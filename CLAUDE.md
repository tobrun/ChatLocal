# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev     # Development (NODE_ENV=development tsx server.ts)
npm start       # Production (tsx server.ts)
npm run build   # Next.js build
npm run lint    # ESLint
```

No test suite exists. There are no migration scripts — migrations run inline at startup.

## Architecture

ChatLocal is a self-hosted AI chat app. The entry point is `server.ts`, which runs this startup sequence:
1. Load `.env` via dotenv
2. Run DB migrations (`src/lib/db/index.ts` → inline `sqlite.exec()` calls)
3. Initialize MCP servers from `mcp-servers.json`
4. Create HTTP server → attach Socket.IO → mount Next.js handler
5. Register Socket.IO event handlers (`src/server/socket.ts`)
6. Auto-setup and spawn memory sidecar (`memory-agent/agent.py`)

### Backend

**`server.ts`** — Entry point. Owns the HTTP server and orchestrates all initialization.

**`src/lib/agent/loop.ts`** — The core engine. `runAgentLoop()` handles:
- Memory recall: keyword extraction → FTS5 search → system prompt injection (when `memoryEnabled=true`)
- Streaming completions from vLLM via OpenAI SDK
- Extracting `<think>...</think>` blocks into separate `thinking` fields
- Tool call loop (max 10 iterations) using MCP tools
- Context compression when token usage exceeds `contextThreshold` (default 0.8)
- Auto-session naming after first exchange
- Saving partial messages on abort
- Writing completed exchanges to `memory-agent/inbox/` for sidecar ingestion

**`src/server/socket.ts`** — All Socket.IO event handlers. Listens for `send_message` (now with `memoryEnabled` field) and `cancel_generation`; emits `token`, `thinking_token`, `tool_call_start`, `tool_call_result`, `message_complete`, `generation_error`, `session_renamed`, `vllm_status`, `memory_recall_start`, `memory_recall_result`.

**`src/lib/db/memory.ts`** — Read-only `better-sqlite3` connection to `memory.db`. Exports `searchMemories()`, `listMemories()`, `getMemory()`, `deleteMemory()`, `getMemoryHealth()`.

**`memory-agent/agent.py`** — Python sidecar. Google ADK agents (IngestAgent, ConsolidateAgent) routed via LiteLLM to vLLM. Watches `inbox/` every 10s, consolidates every 30 min. Writes status to `sidecar_status` table in `memory.db`.

**`src/lib/db/index.ts`** — SQLite setup (WAL mode, FTS5 search). All migrations are inline SQL strings in `runMigrations()`. Schema: `sessions`, `messages`, `settings` tables plus FTS5 virtual table with auto-sync triggers.

**`src/lib/mcp/manager.ts`** — Singleton MCP client. Reads `mcp-servers.json`, spawns stdio processes, supports env var interpolation (`${VAR_NAME}`), and auto-restarts on disconnect.

**`src/lib/vllm/client.ts`** — OpenAI SDK instance pointed at `VLLM_BASE_URL`.

### Frontend

Next.js App Router (`src/app/`). Key routes:
- `/chat/[sessionId]` — main chat UI
- `/settings` — model and UI configuration
- `/memories` — browse, search, manage stored memories; manual text + file upload
- `/api/models`, `/api/health`, `/api/sessions`, `/api/settings`, `/api/youtube`, `/api/webpage`
- `/api/memories` (GET list/search, POST manual), `/api/memories/[id]` (GET, DELETE), `/api/memories/upload` (POST), `/api/memory/health` (GET)

State: Zustand (`src/stores/settings.ts`) for client-side settings/theme. Socket.IO module-level singleton in `src/hooks/useSocket.ts` persists across navigations.

### Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `VLLM_BASE_URL` | `http://localhost:8000` | vLLM (or Ollama/LM Studio) base URL |
| `PORT` | `3000` | HTTP server port |
| `DATABASE_PATH` | `./data/chatlocal.db` | SQLite file location |
| `MEMORY_DB_PATH` | `./data/memory.db` | SQLite file for memory storage (read by server.ts, written by sidecar) |
| `MEMORY_INBOX_PATH` | `./memory-agent/inbox` | Inbox directory watched by sidecar |
| `VLLM_MODEL` | (empty) | Model ID passed to sidecar for LiteLLM routing |

### Key Patterns

- **Singletons**: MCP manager, vLLM client, and Socket.IO client are module-level singletons.
- **DB migrations**: Add new migrations as additional `sqlite.exec()` calls in `runMigrations()` — existing migrations are idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).
- **Streaming**: Agent loop accumulates tokens and emits `token`/`thinking_token` socket events per delta.
- **MCP tools**: Adding tools requires only updating `mcp-servers.json` and restarting — no code changes.
- **`jan/`**: Reference project directory excluded from tsconfig, do not modify.
