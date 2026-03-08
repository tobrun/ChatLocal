"""
Always-on memory sidecar for ChatLocal.

Runs as a background process alongside server.ts.
Communicates exclusively through:
  - inbox/ directory: receives JSON exchange files from server.ts
  - memory.db: writes memories; server.ts reads for FTS5 recall

Agents (Google ADK + LiteLLM → vLLM):
  - IngestAgent: processes inbox files → stores memories
  - ConsolidateAgent: runs every 30 min → finds patterns, links memories
"""

import asyncio
import json
import logging
import os
import signal
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

import litellm
from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

VLLM_BASE_URL = os.environ.get("VLLM_BASE_URL", "http://localhost:8000")
MEMORY_DB_PATH = os.environ.get("MEMORY_DB_PATH", "./data/memory.db")
MEMORY_INBOX_PATH = os.environ.get("MEMORY_INBOX_PATH", "./memory-agent/inbox")
CONSOLIDATION_INTERVAL = 30 * 60  # 30 minutes
INBOX_POLL_INTERVAL = 10  # seconds
IMPORTANCE_THRESHOLD = 0.3
CONSOLIDATION_MIN_MEMORIES = 3
VERSION = "1.0.0"

# LiteLLM routes ADK model calls to local vLLM
litellm.api_base = f"{VLLM_BASE_URL}/v1"
litellm.api_key = "dummy"  # vLLM doesn't require auth; LiteLLM's OpenAI provider still needs a non-empty key
litellm.drop_params = True  # ignore unsupported params silently

# Model name — use openai/ prefix so LiteLLM routes to the OpenAI-compatible endpoint
_raw_model = os.environ.get("VLLM_MODEL", "")
MODEL = f"openai/{_raw_model}" if _raw_model and not _raw_model.startswith("openai/") else (
    _raw_model or "openai/default"
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(message)s",
    datefmt="[%H:%M]",
)
log = logging.getLogger("memory-agent")

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def get_db() -> sqlite3.Connection:
    db_path = Path(MEMORY_DB_PATH).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT DEFAULT '',
            raw_text TEXT,
            summary TEXT,
            entities TEXT DEFAULT '[]',
            topics TEXT DEFAULT '[]',
            connections TEXT DEFAULT '[]',
            importance REAL DEFAULT 0.5,
            created_at TEXT,
            consolidated INTEGER DEFAULT 0
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
            summary,
            entities,
            topics,
            raw_text,
            content='memories',
            content_rowid='id'
        );

        CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
            INSERT INTO memories_fts(rowid, summary, entities, topics, raw_text)
            VALUES (new.id, new.summary, new.entities, new.topics, new.raw_text);
        END;

        CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
            INSERT INTO memories_fts(memories_fts, rowid, summary, entities, topics, raw_text)
            VALUES ('delete', old.id, old.summary, old.entities, old.topics, old.raw_text);
        END;

        CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
            INSERT INTO memories_fts(memories_fts, rowid, summary, entities, topics, raw_text)
            VALUES ('delete', old.id, old.summary, old.entities, old.topics, old.raw_text);
            INSERT INTO memories_fts(rowid, summary, entities, topics, raw_text)
            VALUES (new.id, new.summary, new.entities, new.topics, new.raw_text);
        END;

        CREATE TABLE IF NOT EXISTS consolidations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_ids TEXT,
            summary TEXT,
            insight TEXT,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS processed_files (
            path TEXT PRIMARY KEY,
            processed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS sidecar_status (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    """)
    conn.commit()


def set_status(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO sidecar_status (key, value) VALUES (?, ?)",
        (key, value),
    )
    conn.commit()


def update_heartbeat(conn: sqlite3.Connection) -> None:
    now = datetime.now(timezone.utc).isoformat()
    row = conn.execute("SELECT COUNT(*) as n FROM memories").fetchone()
    pending = conn.execute(
        "SELECT COUNT(*) as n FROM memories WHERE consolidated = 0"
    ).fetchone()
    set_status(conn, "last_heartbeat", now)
    set_status(conn, "memory_count", str(row["n"]))
    set_status(conn, "pending_count", str(pending["n"]))
    set_status(conn, "version", VERSION)
    set_status(conn, "status", "online")


# ---------------------------------------------------------------------------
# Agent tools
# ---------------------------------------------------------------------------

# Module-level db connection shared by tool functions
_db: sqlite3.Connection | None = None


def _get_db() -> sqlite3.Connection:
    global _db
    if _db is None:
        raise RuntimeError("DB not initialized")
    return _db


def store_memory(
    summary: str,
    entities: str,
    topics: str,
    importance: float,
    raw_text: str = "",
    source: str = "chat",
) -> str:
    """Store a new memory in the database. importance must be 0.0–1.0."""
    if importance < IMPORTANCE_THRESHOLD:
        return f"Discarded: importance {importance:.2f} below threshold {IMPORTANCE_THRESHOLD}"
    db = _get_db()
    now = datetime.now(timezone.utc).isoformat()
    # Normalize JSON strings
    try:
        json.loads(entities)
    except (json.JSONDecodeError, TypeError):
        entities = json.dumps([e.strip() for e in str(entities).split(",") if e.strip()])
    try:
        json.loads(topics)
    except (json.JSONDecodeError, TypeError):
        topics = json.dumps([t.strip() for t in str(topics).split(",") if t.strip()])

    cur = db.execute(
        """INSERT INTO memories (source, raw_text, summary, entities, topics, importance, created_at, consolidated)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0)""",
        (source, raw_text[:50000], summary, entities, topics, float(importance), now),
    )
    db.commit()
    mem_id = cur.lastrowid
    log.info("🧠 Stored memory #%d (importance: %.2f): %s", mem_id, importance, summary[:80])
    return f"Stored memory #{mem_id}"


def read_unconsolidated_memories() -> str:
    """Return up to 10 unconsolidated memories as JSON for the consolidation agent."""
    db = _get_db()
    rows = db.execute(
        "SELECT id, summary, entities, topics, importance, raw_text FROM memories WHERE consolidated = 0 ORDER BY id ASC LIMIT 10"
    ).fetchall()
    if not rows:
        return json.dumps([])
    return json.dumps([dict(r) for r in rows])


def store_consolidation(
    source_ids: str,
    summary: str,
    insight: str,
    connections: str = "[]",
) -> str:
    """Store a consolidation result and update source memories with connections."""
    db = _get_db()
    now = datetime.now(timezone.utc).isoformat()

    # Parse and validate source_ids
    try:
        ids: list[int] = json.loads(source_ids)
    except (json.JSONDecodeError, TypeError):
        ids = []

    # Store consolidation record
    db.execute(
        "INSERT INTO consolidations (source_ids, summary, insight, created_at) VALUES (?, ?, ?, ?)",
        (json.dumps(ids), summary, insight, now),
    )

    # Parse connections
    try:
        conn_list = json.loads(connections)
    except (json.JSONDecodeError, TypeError):
        conn_list = []

    # Update each source memory: mark as consolidated and set connections
    for mem_id in ids:
        mem_connections = [c for c in conn_list if c.get("from_id") == mem_id]
        # Build connection list: links to other memories in this consolidation
        mem_conn = [
            {"linked_to": c["linked_to"], "relationship": c.get("relationship", "relates_to")}
            for c in mem_connections
        ]
        if not mem_conn:
            # Default: connect to all other memories in this batch
            mem_conn = [
                {"linked_to": other_id, "relationship": "relates_to"}
                for other_id in ids
                if other_id != mem_id
            ]
        db.execute(
            "UPDATE memories SET consolidated = 1, connections = ? WHERE id = ?",
            (json.dumps(mem_conn), mem_id),
        )

    db.commit()
    log.info("🔮 Consolidated %d memories → insight: %s", len(ids), insight[:80])
    return f"Consolidated {len(ids)} memories"


# ---------------------------------------------------------------------------
# ADK agent setup
# ---------------------------------------------------------------------------

INGEST_INSTRUCTION = """You are a Memory Ingest Agent for a personal AI chat assistant.
When you receive content (a chat exchange or text), you must:
1. Thoroughly analyze what the content is about
2. Write a concise 1-2 sentence summary capturing the key information
3. Extract key entities (people, companies, products, concepts, locations) as a JSON array of strings
4. Assign 2-4 topic tags as a JSON array of strings
5. Rate importance from 0.0 to 1.0:
   - 0.9-1.0: crucial personal information, important decisions, key facts to always remember
   - 0.7-0.8: useful context, preferences, notable events
   - 0.4-0.6: interesting but not critical information
   - 0.0-0.3: trivial conversation, greetings, simple confirmations (these will be discarded)
6. Call store_memory with all extracted information

For chat exchanges, focus on what the USER shared or what was decided/learned, not just pleasantries.
Be selective — only store information that would be valuable to recall in future conversations."""

CONSOLIDATE_INSTRUCTION = """You are a Memory Consolidation Agent. Your job is to find patterns and connections across memories.
When called:
1. Call read_unconsolidated_memories to get pending memories
2. If fewer than 3 memories returned, respond with "Nothing to consolidate yet."
3. Analyze the memories to find:
   - Common themes and patterns
   - Complementary information (memories that reinforce each other)
   - Contradictions (memories that conflict)
   - Dependencies (one memory provides context for another)
4. Create a synthesized summary that captures the overall pattern across these memories
5. Identify one key insight — the most important cross-cutting finding
6. Build a connections array where each item has: from_id, linked_to, relationship
   (relationship must be one of: complements, contradicts, relates_to, depends_on)
7. Call store_consolidation with source_ids (JSON array of memory IDs), summary, insight, and connections

Focus on genuine patterns, not forced connections. If memories are truly unrelated, note that in the summary."""


def _make_runner(agent: Agent) -> tuple[Runner, InMemorySessionService]:
    session_service = InMemorySessionService()
    runner = Runner(agent=agent, app_name=agent.name, session_service=session_service)
    return runner, session_service


ingest_agent = Agent(
    name="ingest_agent",
    model=MODEL,
    description="Analyzes content and stores important information as memories",
    instruction=INGEST_INSTRUCTION,
    tools=[store_memory],
)

consolidate_agent = Agent(
    name="consolidate_agent",
    model=MODEL,
    description="Finds patterns across memories and creates consolidations",
    instruction=CONSOLIDATE_INSTRUCTION,
    tools=[read_unconsolidated_memories, store_consolidation],
)

ingest_runner, ingest_sessions = _make_runner(ingest_agent)
consolidate_runner, consolidate_sessions = _make_runner(consolidate_agent)


async def _run_agent(runner: Runner, sessions: InMemorySessionService, prompt: str, session_id: str) -> str:
    """Run an ADK agent with a prompt, return the final text response."""
    await sessions.create_session(app_name=runner.agent.name, user_id="system", session_id=session_id)
    content = types.Content(role="user", parts=[types.Part(text=prompt)])
    response_text = ""
    async for event in runner.run_async(
        user_id="system", session_id=session_id, new_message=content
    ):
        if event.is_final_response() and event.content and event.content.parts:
            for part in event.content.parts:
                if hasattr(part, "text") and part.text:
                    response_text += part.text
    return response_text


# ---------------------------------------------------------------------------
# File type classification
# ---------------------------------------------------------------------------

TEXT_EXTENSIONS = {".txt", ".md", ".json", ".csv", ".log", ".xml", ".yaml", ".yml"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi", ".mkv"}
DOC_EXTENSIONS = {".pdf"}

ALL_SUPPORTED = TEXT_EXTENSIONS | IMAGE_EXTENSIONS | AUDIO_EXTENSIONS | VIDEO_EXTENSIONS | DOC_EXTENSIONS


# ---------------------------------------------------------------------------
# Ingest logic
# ---------------------------------------------------------------------------

async def ingest_file(file_path: Path, db: sqlite3.Connection) -> None:
    """Process a single inbox file through the IngestAgent."""
    suffix = file_path.suffix.lower()
    source = file_path.name

    if suffix not in ALL_SUPPORTED:
        log.info("⏭️  Skipping unsupported file type: %s", file_path.name)
        return

    # Check if already processed
    already = db.execute(
        "SELECT 1 FROM processed_files WHERE path = ?", (str(file_path),)
    ).fetchone()
    if already:
        return

    log.info("📥 Ingesting: %s", file_path.name)

    try:
        if suffix == ".json":
            # Might be a chat exchange from server.ts
            try:
                data = json.loads(file_path.read_text(encoding="utf-8"))
                if data.get("type") == "chat_exchange":
                    user_msg = data.get("userMessage", "")
                    assistant_msg = data.get("assistantResponse", "")
                    session_id = data.get("sessionId", "unknown")
                    raw = f"[User]: {user_msg}\n\n[Assistant]: {assistant_msg}"
                    prompt = f"Analyze this chat exchange and store any valuable information as a memory:\n\n{raw[:10000]}"
                    source = f"chat:{session_id}"
                elif data.get("type") == "manual":
                    raw = data.get("text", "")
                    prompt = f"Analyze this text and store any valuable information as a memory:\n\n{raw[:10000]}"
                    source = data.get("source", "manual")
                else:
                    raw = file_path.read_text(encoding="utf-8", errors="replace")[:10000]
                    prompt = f"Analyze this content and store any valuable information as a memory:\n\n{raw}"
            except json.JSONDecodeError:
                raw = file_path.read_text(encoding="utf-8", errors="replace")[:10000]
                prompt = f"Analyze this content and store any valuable information as a memory:\n\n{raw}"

        elif suffix in TEXT_EXTENSIONS:
            raw = file_path.read_text(encoding="utf-8", errors="replace")[:10000]
            prompt = f"Analyze this content and store any valuable information as a memory:\n\n{raw}"

        elif suffix in (IMAGE_EXTENSIONS | AUDIO_EXTENSIONS | VIDEO_EXTENSIONS | DOC_EXTENSIONS):
            # Non-text: store a placeholder record (future multimodal support)
            db.execute(
                """INSERT INTO memories (source, raw_text, summary, entities, topics, importance, created_at, consolidated)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 0)""",
                (
                    source,
                    f"[Binary file: {file_path.name}]",
                    f"Binary file stored for future multimodal processing: {file_path.name}",
                    "[]",
                    "[]",
                    0.4,
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            db.commit()
            log.info("📄 Stored placeholder for binary file: %s", file_path.name)
            _mark_processed(db, file_path)
            return
        else:
            return

        # Run IngestAgent
        session_id = f"ingest_{int(time.time() * 1000)}"
        await _run_agent(ingest_runner, ingest_sessions, prompt, session_id)

        _mark_processed(db, file_path)
        file_path.unlink(missing_ok=True)

    except Exception as exc:
        log.error("❌ Ingest failed for %s: %s", file_path.name, exc)
        failed_dir = file_path.parent / "failed"
        failed_dir.mkdir(exist_ok=True)
        target = failed_dir / file_path.name
        file_path.rename(target)
        log.info("🗑️  Moved to failed/: %s", file_path.name)


def _mark_processed(db: sqlite3.Connection, file_path: Path) -> None:
    db.execute(
        "INSERT OR REPLACE INTO processed_files (path, processed_at) VALUES (?, ?)",
        (str(file_path), datetime.now(timezone.utc).isoformat()),
    )
    db.commit()


# ---------------------------------------------------------------------------
# Consolidation
# ---------------------------------------------------------------------------

async def run_consolidation(db: sqlite3.Connection) -> None:
    """Run the ConsolidateAgent if enough unconsolidated memories exist."""
    count = db.execute(
        "SELECT COUNT(*) as n FROM memories WHERE consolidated = 0"
    ).fetchone()["n"]

    if count < CONSOLIDATION_MIN_MEMORIES:
        log.info("🔄 Consolidation skipped: only %d unconsolidated memories (need %d)", count, CONSOLIDATION_MIN_MEMORIES)
        return

    log.info("🔄 Running consolidation (%d memories pending)...", count)
    session_id = f"consolidate_{int(time.time() * 1000)}"
    try:
        await _run_agent(
            consolidate_runner,
            consolidate_sessions,
            "Please consolidate the unconsolidated memories now.",
            session_id,
        )
        now = datetime.now(timezone.utc).isoformat()
        set_status(db, "last_consolidation", now)
        log.info("✅ Consolidation complete")
    except Exception as exc:
        log.error("❌ Consolidation failed: %s", exc)


# ---------------------------------------------------------------------------
# Background tasks
# ---------------------------------------------------------------------------

async def watch_inbox(inbox_dir: Path, db: sqlite3.Connection) -> None:
    """Poll inbox/ directory every INBOX_POLL_INTERVAL seconds and process files."""
    log.info("👁️  Watching inbox: %s (every %ds)", inbox_dir, INBOX_POLL_INTERVAL)
    while True:
        try:
            # Collect files sorted by mtime for FIFO ordering
            files = sorted(
                (f for f in inbox_dir.iterdir() if f.is_file() and f.suffix.lower() != ".gitkeep"),
                key=lambda f: f.stat().st_mtime,
            )
            for file_path in files:
                await ingest_file(file_path, db)
                update_heartbeat(db)
        except Exception as exc:
            log.error("❌ Inbox watch error: %s", exc)

        await asyncio.sleep(INBOX_POLL_INTERVAL)


async def consolidation_loop(db: sqlite3.Connection) -> None:
    """Run consolidation every CONSOLIDATION_INTERVAL seconds."""
    # Wait before first run to let inbox warm up
    await asyncio.sleep(60)
    while True:
        await run_consolidation(db)
        await asyncio.sleep(CONSOLIDATION_INTERVAL)


async def heartbeat_loop(db: sqlite3.Connection) -> None:
    """Update sidecar_status every 30 seconds."""
    while True:
        try:
            update_heartbeat(db)
        except Exception as exc:
            log.error("❌ Heartbeat error: %s", exc)
        await asyncio.sleep(30)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main() -> None:
    inbox_dir = Path(MEMORY_INBOX_PATH).resolve()
    inbox_dir.mkdir(parents=True, exist_ok=True)
    (inbox_dir / "failed").mkdir(exist_ok=True)

    log.info("🚀 Memory sidecar starting (model: %s)", MODEL)
    log.info("📦 DB: %s", MEMORY_DB_PATH)
    log.info("📬 Inbox: %s", inbox_dir)

    db = get_db()
    init_db(db)

    # Inject db into tool closure
    global _db
    _db = db

    set_status(db, "status", "online")
    update_heartbeat(db)

    # Graceful shutdown
    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()

    def _signal_handler() -> None:
        log.info("👋 Shutting down memory sidecar...")
        set_status(db, "status", "offline")
        db.commit()
        stop_event.set()

    loop.add_signal_handler(signal.SIGINT, _signal_handler)
    loop.add_signal_handler(signal.SIGTERM, _signal_handler)

    tasks = [
        asyncio.create_task(watch_inbox(inbox_dir, db)),
        asyncio.create_task(consolidation_loop(db)),
        asyncio.create_task(heartbeat_loop(db)),
    ]

    await stop_event.wait()

    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    log.info("✅ Memory sidecar stopped")


if __name__ == "__main__":
    asyncio.run(main())
