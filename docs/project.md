# ChatLocal - Technical Specification

A self-hosted ChatGPT alternative powered by local models via vLLM, served as a web application on the local network.

## Architecture Overview

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (fullstack) with custom Node server |
| UI | Tailwind CSS + shadcn/ui |
| Real-time | Socket.IO (WebSocket transport) |
| Database | SQLite via Drizzle ORM |
| Model Backend | vLLM (OpenAI-compatible API) |
| MCP Runtime | Server-side only (Node.js child processes) |

### Deployment

Custom Node server (`server.ts`) that:
- Creates an HTTP server
- Attaches Next.js request handler
- Attaches Socket.IO for real-time streaming
- Manages MCP subprocess lifecycle

Single process manages everything. No containerization required for v1.

---

## Model Integration

### vLLM Connection

- **Base URL**: Configured via `VLLM_BASE_URL` environment variable, defaulting to `http://localhost:8000`
- **Model discovery**: `GET /v1/models` auto-populates the model selector dropdown
- **API format**: Use `/v1/chat/completions` with `tools` parameter (OpenAI function-calling format). Fall back to `/v1/completions` with custom prompt parsing if the model doesn't support structured tool calls.

Example response from `/v1/models`:
```json
{
  "object": "list",
  "data": [{
    "id": "/home/nurbot/ws/models/Qwen3.5-122B-A10B-FP8",
    "object": "model",
    "max_model_len": 262144
  }]
}
```

### Health Monitoring

- Periodic health polling of vLLM endpoint (every ~10 seconds)
- Persistent banner at the top of the UI when vLLM is unreachable: "Model server unreachable"
- Send button disabled while vLLM is down
- Banner auto-dismisses when connectivity is restored

### Model Parameters

- Global defaults only (no per-session overrides)
- Configurable from a settings page: temperature, top_p, max_tokens, system prompt
- Applied to all new sessions uniformly

### Thinking Token Handling

Models that emit `<think>...</think>` blocks (e.g., Qwen3 thinking mode):
- Parse out thinking tokens from the response stream
- Render them in a **collapsible "Reasoning" section** above the assistant's response
- Collapsed by default; user can expand to inspect the model's thought process

---

## Session Management

### Session Lifecycle

- Each session is **bound to a model** at creation time (stores model ID)
- If the bound model is no longer loaded on vLLM, the session becomes **read-only**
- User must start a new session when the model changes

### Session Naming

- Auto-generated after the first exchange
- The model generates a short title summarizing the conversation topic (separate lightweight model call)

### Session Storage

SQLite database with Drizzle ORM. Schema includes:

**sessions table:**
- `id` (UUID, primary key)
- `title` (text)
- `model_id` (text, the vLLM model ID at session creation)
- `created_at` (timestamp)
- `updated_at` (timestamp)

**messages table:**
- `id` (UUID, primary key)
- `session_id` (foreign key -> sessions)
- `role` (enum: user | assistant | system | tool)
- `content` (text, JSON for multi-part content like text + images)
- `tool_calls` (JSON, nullable, for assistant tool invocations)
- `tool_call_id` (text, nullable, for tool result messages)
- `is_partial` (boolean, true if generation was cancelled mid-stream)
- `thinking` (text, nullable, extracted thinking tokens)
- `created_at` (timestamp)

### Chat Search

- **Full-text search** across all messages (user AND assistant) across all sessions
- Implemented via SQLite FTS5 virtual table indexing message content
- Search UI in the sidebar: text input that filters/highlights matching sessions and messages

---

## Agent Harness & Tool Use

### Agent Loop

**Simple ReAct loop:**

1. Send conversation history + available tools to vLLM via `/v1/chat/completions`
2. If response contains tool calls, execute them via MCP
3. Append tool results to conversation history
4. Re-send to vLLM for the next completion
5. Repeat until the model produces a final text response (no tool calls)

### MCP Integration

- **Configuration**: Static JSON config file on disk (e.g., `mcp-servers.json`). Requires server restart to pick up changes.
- MCP servers are spawned as **child processes** (stdio transport) on the Node server
- Server manages MCP process lifecycle (spawn on startup, restart on crash)

Example config (`mcp-servers.json`):
```json
{
  "tavily-remote": {
    "command": "npx",
    "args": [
      "-y",
      "mcp-remote",
      "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
    ]
  }
}
```

Environment variables (e.g., `TAVILY_API_KEY`) are loaded from `.env` and interpolated into MCP args.

### Tool Approval

- **Always auto-execute**: Tools run without user confirmation for minimum friction
- Tool calls and results are shown inline in the chat (see UI section)

---

## Streaming & Real-time Communication

### WebSocket Protocol (Socket.IO)

Socket.IO handles reconnection, heartbeats, and message framing automatically.

**Events (server -> client):**
- `token` - Individual token from model stream
- `thinking_token` - Token inside a `<think>` block
- `tool_call_start` - Model initiated a tool call (includes tool name + args)
- `tool_call_result` - Tool execution completed (includes result)
- `message_complete` - Final message saved to DB
- `error` - Error during generation
- `vllm_status` - Health check status update

**Events (client -> server):**
- `send_message` - User sends a message (text + optional image attachments)
- `cancel_generation` - User cancels mid-stream

### Cancellation Behavior

- When user cancels generation, the **partial response is kept** and saved to the database
- The message is marked with `is_partial: true`
- Visually renders normally (no special indicator needed; the message simply ends where it was stopped)

---

## Context Window Management

### Summarize and Compress Strategy

When the conversation token count approaches a threshold (configurable, default 80% of `max_model_len`):

1. Take all messages older than the most recent N turns (e.g., last 10 messages)
2. Send them to the same vLLM model with a summarization prompt
3. Replace the old messages with a single system message containing the summary
4. Preserve the recent N messages verbatim for continuity

This happens **automatically** before the next model call when the threshold is exceeded. The summarized system message is stored in the DB so the summary persists across page reloads.

---

## UI / UX Design

### Layout

Sidebar + chat panel layout:

```
┌──────────┬───────────────────────┐
│ Sessions │                       │
│          │    Chat Messages      │
│ - Chat 1 │                       │
│ - Chat 2 │    [user message]     │
│ - Chat 3 │    [assistant reply]  │
│          │                       │
│ [search] │  ┌─────────────────┐  │
│ [+ new]  │  │ Type message... │  │
│          │  └─────────────────┘  │
└──────────┴───────────────────────┘
```

- Left sidebar: session list, search input, "New Chat" button
- Main panel: message thread + input area
- Sidebar collapses on mobile (hamburger menu)

### Theme

- **Dark theme only**
- Built on shadcn/ui dark color tokens

### Message Input

- Auto-expanding textarea (grows with content)
- **Enter** to send, **Shift+Enter** for newline
- Attachment button (paperclip icon) for file picker
- **Image input methods**: clipboard paste (Ctrl+V), drag-and-drop onto input area, file picker button
- Image thumbnails shown as previews below the textarea before sending

### Message Rendering

- Full **markdown rendering** with syntax-highlighted code blocks (Shiki or Prism)
- **Copy button** on code blocks
- Tables, lists, links rendered properly
- No LaTeX/math rendering

### Tool Call Display

- **Inline tool cards** in the message stream
- Collapsible card showing: tool name, arguments (JSON), and result
- Shows while tool is executing (spinner state) and after completion (result state)

### Model Selector

- Dropdown in the chat header area
- Auto-populated from `GET /v1/models`
- Shows the model name (extracted from the path, e.g., "Qwen3.5-122B-A10B-FP8")
- Disabled when a session is active (session-bound model)

### Settings Page

Accessible from sidebar or header. Contains:
- **System prompt**: Editable textarea for the global system prompt
- **Model parameters**: Temperature, top_p, max_tokens sliders/inputs
- **vLLM status**: Current connection status, loaded model info

---

## Image Handling

- Images attached to prompts are **base64 encoded** inline in the message content
- Sent to vLLM using the OpenAI vision format:
  ```json
  {
    "role": "user",
    "content": [
      {"type": "text", "text": "What's in this image?"},
      {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}
    ]
  }
  ```
- No server-side resizing (images sent as-is)
- If the active model doesn't support vision, the request will fail and the error is shown inline in the chat

---

## Data Export

- **Markdown export only** (no import)
- Export a session as a readable markdown transcript
- Accessible via a menu option on each session in the sidebar

---

## Concurrency Model

- **Single user** system (no authentication, no multi-user support)
- One active generation at a time
- No request queuing to vLLM (sequential requests)

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VLLM_BASE_URL` | `http://localhost:8000` | vLLM API endpoint |
| `TAVILY_API_KEY` | (required) | API key for Tavily web search MCP |
| `PORT` | `3000` | Port for the web server |
| `DATABASE_PATH` | `./data/chatlocal.db` | SQLite database file path |

---

## Reference Project

The `../jan` directory contains the Jan project which serves a similar purpose. It can be referenced for implementation patterns, but should not be directly copied. Key differences from Jan:
- Jan is a Tauri desktop app; ChatLocal is a web service
- Jan has its own model runtime; ChatLocal delegates to vLLM
- Jan uses file-based storage on desktop; ChatLocal uses SQLite

---

## Non-Goals (v1)

- No user authentication or multi-user support
- No LaTeX/math rendering
- No response regeneration / alternative responses
- No per-session model parameter overrides
- No UI-managed MCP configuration (config file only)
- No import of chat sessions
- No light theme
- No Docker containerization
