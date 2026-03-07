# Always-On Memory Integration Spec

## Overview

Integrate an always-on memory system into ChatLocal. The memory system continuously extracts facts from conversations, consolidates them into connected knowledge over time, and injects relevant memories into chat context when enabled. The system runs as a Python sidecar process alongside the existing Node.js server, communicating exclusively through a shared SQLite database and an inbox directory.

## Reference Project

The reference implementation lives at `/home/nurbot/ws/generative-ai/gemini/agents/always-on-memory-agent`. It uses Google ADK with Gemini to run three specialized agents (ingest, consolidate, query) with a Streamlit dashboard. This integration adapts that architecture for ChatLocal.

---

## Architecture

### Hybrid Approach

The existing chat loop (`src/lib/agent/loop.ts`) remains on the OpenAI SDK against vLLM. A Python sidecar (`memory-agent/`) handles all background memory processing using Google ADK, with LiteLLM used as an in-process library to route ADK's model calls to the local vLLM instance.

```
┌──────────────────────────────────┐     ┌──────────────────────────────┐
│          server.ts               │     │     memory-agent/agent.py    │
│  ┌────────────┐ ┌─────────────┐  │     │  ┌───────────┐              │
│  │ Agent Loop  │ │  Socket.IO  │  │     │  │ IngestAgent│  (ADK)      │
│  │ (OpenAI SDK)│ │  Handlers   │  │     │  ├───────────┤              │
│  └─────┬──────┘ └──────┬──────┘  │     │  │Consolidate│  (ADK)      │
│        │               │         │     │  │   Agent    │              │
│        │  writes JSON   │         │     │  ├───────────┤              │
│        ├───────────────►│ inbox/  │◄────│  │QueryAgent │  (ADK)      │
│        │               │         │     │  └─────┬─────┘              │
│  reads │               │         │     │        │ LiteLLM (library)  │
│  ┌─────┴──────┐        │         │     │        ▼                    │
│  │ memory.db  │◄───────┼─────────┼─────│   vLLM (OpenAI compat)     │
│  │  (SQLite)  │        │         │     │                              │
│  └────────────┘        │         │     └──────────────────────────────┘
└──────────────────────────────────┘
```

### Communication: Shared DB + Inbox Directory

No direct IPC between server.ts and the sidecar. All communication flows through:
- **`inbox/`** directory: server.ts writes exchange JSON files after each completed agent loop. The sidecar's file watcher picks them up for ingestion.
- **`memory.db`** (separate from `chatlocal.db`): The sidecar writes memories/consolidations. server.ts reads them for FTS5 recall.

---

## Sidecar Process (`memory-agent/`)

### Directory Structure

```
memory-agent/
├── agent.py              # Main sidecar entry point
├── requirements.txt      # Python dependencies
├── setup.sh              # Auto-setup script (venv + deps)
└── inbox/                # Watched directory for ingestion
    └── failed/           # Files that failed processing
```

### Dependencies

```
google-adk>=1.0.0
litellm>=1.0.0
aiohttp>=3.9.0
```

LiteLLM is used as an **in-process library** (not a proxy server). The ADK model parameter is configured to route through LiteLLM to the local vLLM instance.

### Lifecycle

1. **server.ts** spawns the sidecar Python process on startup (like MCP server spawning).
2. On first startup, if the Python venv doesn't exist, **server.ts auto-runs `setup.sh`** to create the venv and install dependencies.
3. The sidecar starts, initializes ADK agents, and begins:
   - Watching `inbox/` for new files (poll every **10 seconds**)
   - Running the consolidation timer (every **30 minutes**, fixed interval)
4. The sidecar lifecycle is tied to server.ts — starts and stops together.

### Agents (Google ADK)

Three specialized agents, matching the reference project:

**IngestAgent** — Processes inbox files. For each file:
- Analyzes content (text, or stores non-text files for future multimodal processing)
- Generates a 1-2 sentence summary
- Extracts entities (people, companies, concepts)
- Assigns 2-4 topic tags
- Rates importance (0.0-1.0)
- Stores to `memory.db` via `store_memory` tool
- **Importance threshold: 0.3** — memories rated below this are discarded

**ConsolidateAgent** — Runs on the 30-minute timer:
- Reads unconsolidated memories from `memory.db`
- **Minimum threshold: 3 memories** — skips if fewer than 3 unconsolidated memories exist
- Finds cross-cutting patterns and connections
- Creates synthesized summaries and insights
- Tracks connections between memories (relationship types: complements, contradicts, relates_to, depends_on)
- Marks processed memories as consolidated

**QueryAgent** — Not directly used in the hybrid architecture (server.ts handles recall via FTS5), but available for the sidecar's internal use.

### Inbox Processing

- Files processed in **FIFO order** (by filesystem timestamp)
- Chat exchanges arrive as JSON: `{ userMessage, assistantResponse, sessionId, timestamp }`
- Uploaded files arrive as-is (text, images, PDFs, etc.)
- **Supported file types** (future-proofed to match reference): text (.txt, .md, .json, .csv, .log, .xml, .yaml, .yml), images (.png, .jpg, .jpeg, .gif, .webp, .bmp, .svg), audio (.mp3, .wav, .ogg, .flac, .m4a, .aac), video (.mp4, .webm, .mov, .avi, .mkv), documents (.pdf)
  - Non-text files are stored but only fully processed when a multimodal model is available
- **On vLLM failure**: move file to `inbox/failed/`. User can manually move files back for reprocessing.

### Health Endpoint

The sidecar exposes health data via `memory.db` — a `sidecar_status` table with:
- Last heartbeat timestamp
- Last consolidation time
- Total memory count
- Pending (unconsolidated) count
- Sidecar version/status

server.ts reads this table to serve `/api/memory/health`.

---

## Database Schema (`memory.db`)

Separate SQLite database file from `chatlocal.db`. Both processes access it (SQLite WAL mode for concurrency).

```sql
-- Core memory storage
CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT DEFAULT '',           -- 'chat', 'upload', filename
    raw_text TEXT,                     -- Full exchange (user + assistant) or file content
    summary TEXT,                      -- LLM-generated 1-2 sentence summary
    entities TEXT DEFAULT '[]',        -- JSON array of extracted entities
    topics TEXT DEFAULT '[]',          -- JSON array of topic tags
    connections TEXT DEFAULT '[]',     -- JSON array: [{linked_to: id, relationship: str}]
    importance REAL DEFAULT 0.5,       -- 0.0-1.0 scale
    created_at TEXT,                   -- ISO 8601
    consolidated INTEGER DEFAULT 0    -- 0=pending, 1=consolidated
);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    summary,
    entities,
    topics,
    raw_text,
    content='memories',
    content_rowid='id'
);

-- Auto-sync triggers for FTS5
-- (INSERT, UPDATE, DELETE triggers to keep FTS5 in sync with memories table)

-- Consolidation insights
CREATE TABLE IF NOT EXISTS consolidations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_ids TEXT,                   -- JSON array of memory IDs
    summary TEXT,                      -- Synthesized summary
    insight TEXT,                      -- Key cross-cutting insight
    created_at TEXT                    -- ISO 8601
);

-- File processing tracking
CREATE TABLE IF NOT EXISTS processed_files (
    path TEXT PRIMARY KEY,
    processed_at TEXT                  -- ISO 8601
);

-- Sidecar health status
CREATE TABLE IF NOT EXISTS sidecar_status (
    key TEXT PRIMARY KEY,
    value TEXT
);
```

### Connection Cleanup

When a memory is deleted, all references to its ID in other memories' `connections` arrays are removed (referential integrity maintained).

---

## Server-Side Changes (`server.ts` / Node.js)

### Startup Sequence (additions)

After existing initialization (DB migrations, MCP init, Socket.IO, Next.js):
1. Check for `memory-agent/venv/`. If missing, run `memory-agent/setup.sh`.
2. Spawn `memory-agent/agent.py` as a child process.
3. Log memory sidecar status.

### Agent Loop Changes (`src/lib/agent/loop.ts`)

After each completed agent loop (final assistant response generated):
1. Write a JSON file to `memory-agent/inbox/` containing:
   ```json
   {
     "type": "chat_exchange",
     "userMessage": "...",
     "assistantResponse": "...",
     "sessionId": "...",
     "timestamp": "2026-03-07T..."
   }
   ```
2. File named with timestamp for FIFO ordering: `{timestamp}_{sessionId}.json`

### Memory Recall (before vLLM completion)

When the memory toggle is ON, before sending the user's message to vLLM:

1. **Keyword extraction**: Send the user's message to vLLM with a fast extraction prompt ("Extract 3-5 search keywords from this message"). Uses the **same vLLM model** as chat.
2. **Emit socket event**: `memory_recall_start` with `{ query: extractedKeywords }`
3. **FTS5 search**: Query `memories_fts` in `memory.db` using extracted keywords.
4. **Rank results**: Combine FTS5 relevance score with importance rating. Return **top 10** memories.
5. **Emit socket event**: `memory_recall_result` with the matched memories (or empty array if none found).
6. **Inject into system prompt**: Append recalled memories to the system prompt as structured context:
   ```
   ## Recalled Memories
   [Memory #1] (importance: 0.85): Summary text here
   [Memory #2] (importance: 0.72): Summary text here
   ...
   ```
7. Proceed with normal vLLM completion.

If FTS5 returns zero results, still emit `memory_recall_result` with an empty array (UI shows "no memories found").

### New API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/memory/health` | GET | Reads `sidecar_status` table from memory.db. Returns last heartbeat, consolidation time, memory count, pending count. |
| `/api/memories` | GET | List all memories with pagination. Supports `?q=` for FTS5 search. |
| `/api/memories/:id` | GET | Get single memory with full details. |
| `/api/memories/:id` | DELETE | Delete memory. Clean up connections in other memories. |
| `/api/memories/upload` | POST | Accept file upload, save to `memory-agent/inbox/`. |
| `/api/memories/manual` | POST | Accept `{ text, source? }`, write as JSON to `memory-agent/inbox/`. |

---

## Frontend Changes

### Memory Toggle (Chat Input Bar)

- **Icon**: Brain icon (from lucide-react)
- **Placement**: In the chat input bar, near the send button
- **Behavior**: Toggles memory recall ON/OFF. When ON (colored), recalled memories are injected into context before each message. When OFF (gray), no memory recall occurs.
- **State**: **Defaults to ON**. Does not persist across browser sessions — resets to ON on page load.
- **No count badge** on the icon.

### Memory Recall Display (Chat Messages)

Matches the existing `tool_call_start` / `tool_call_result` UI pattern:

1. When `memory_recall_start` event received, show a collapsible block:
   ```
   Searching memories for: "extracted keywords here"
   ```
2. When `memory_recall_result` event received, populate the block with results:
   - Each memory shown with summary and importance score
   - If no memories found, show "No relevant memories found"
3. Block is **collapsible/expandable**, defaulting to collapsed after the response completes.

### Socket.IO Events (new)

| Event | Direction | Payload |
|---|---|---|
| `memory_recall_start` | server → client | `{ query: string }` |
| `memory_recall_result` | server → client | `{ memories: Memory[] }` or `{ memories: [] }` |
| `memory_status` | server → client | `{ healthy: boolean, lastConsolidation: string, memoryCount: number }` |

### `/memories` Page (New Route)

A dedicated page for browsing and managing all stored memories.

**Header**: Memory count and sidecar health indicator (online/offline, last consolidation time).

**Search**: Single FTS5-powered search box.

**Memory Cards**: Each memory displayed as a card showing:
- Memory ID and timestamp
- Summary text
- Topic tags (badges)
- Entity tags (badges)
- Importance indicator (color-coded: green >= 0.7, yellow >= 0.4, gray < 0.4)
- **Connection badges**: Show linked memory IDs with relationship type. Clicking a badge **scrolls to and highlights** the connected memory on the page.
- **Delete button**: Individual delete with confirmation. Cleans up connection references in other memories.

**Manual Memory Creation**:
- Text input area for typing facts to remember
- File upload dropzone (accepts all supported file types)
- Both write to `memory-agent/inbox/` for sidecar processing

**No bulk operations** in initial release (individual delete only).

### Navigation

Add "Memories" link to the existing navigation (sidebar/header), alongside Chat and Settings.

---

## Memory Scope

**Global single store**. All sessions contribute to and recall from the same memory pool. No per-session isolation or scoping.

---

## Auto-Setup Script (`memory-agent/setup.sh`)

```bash
#!/bin/bash
# Creates Python venv and installs sidecar dependencies
cd "$(dirname "$0")"
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

server.ts runs this automatically if `memory-agent/venv/` doesn't exist on startup.

---

## Environment Variables (additions)

| Variable | Default | Purpose |
|---|---|---|
| `MEMORY_DB_PATH` | `./data/memory.db` | SQLite file for memory storage |
| `MEMORY_INBOX_PATH` | `./memory-agent/inbox` | Inbox directory for ingestion |

---

## Summary of Key Decisions

| Decision | Choice |
|---|---|
| Framework | Hybrid: ADK sidecar + existing OpenAI SDK loop |
| LiteLLM | In-process library (not proxy server) |
| Memory scope | Global (single store) |
| Retrieval | FTS5 keyword search, top 10 importance-weighted |
| Keyword extraction | LLM-driven (same vLLM model), runs on every message |
| Memory creation | LLM-driven per exchange (after full agent loop) |
| Consolidation | Background timer, 30 min fixed interval, min 3 memories |
| Connection graph | Full tracking with relationship types |
| IPC | Shared DB + inbox directory (no direct communication) |
| DB location | Separate `memory.db` file |
| Sidecar lifecycle | Spawned by server.ts, auto-setup on first run |
| Toggle | Brain icon in chat input bar, defaults ON, no persist |
| Recall display | Matches tool_call UI pattern, shows keywords + results |
| Management UI | Dedicated /memories page with FTS5 search |
| Manual creation | Text input + file upload on /memories page |
| File types | All 27 types accepted (future-proofed), text processed now |
| Import threshold | 0.3 minimum (below discarded) |
| Consolidation threshold | 3 unconsolidated memories minimum |
| Processing order | FIFO (timestamp) |
| Inbox poll interval | 10 seconds |
| vLLM failure handling | Move to inbox/failed/ |
| Delete behavior | Clean up connection references |
| Privacy | None (self-hosted, user controls machine) |
| Empty recall | Show "no memories found" block |
| Python setup | Auto-run setup.sh if venv missing |
| Toggle persist | No persist, defaults ON each page load |
