# ChatLocal

A self-hosted ChatGPT replacement for your locally running models. Connects to any OpenAI-compatible inference endpoint — vLLM, Ollama, LM Studio, llama.cpp server — and gives you a polished chat UI with no data leaving your machine.

## Why

ChatGPT and Claude are great, but sometimes you need:

- **Full privacy** — every token stays on your hardware
- **No rate limits** — your GPU, your rules
- **Bleeding-edge models** — run whatever is on Hugging Face today without waiting for an API
- **Tool use with local context** — connect MCP servers to give the model access to your files, APIs, and services

ChatLocal gives you the ChatGPT-style experience on top of your own inference stack.

## Features

- **Real-time streaming** — tokens appear as they are generated via WebSocket
- **Thinking blocks** — collapsible reasoning display for models like Qwen3 that emit `<think>` tokens
- **MCP tool integration** — connect any MCP server (stdio transport); tools run automatically and appear inline as collapsible cards
- **Session management** — persistent chat history in SQLite, auto-named after the first exchange
- **Full-text search** — FTS5-powered search across all messages in the sidebar
- **Vision support** — attach images via paste, drag-and-drop, or file picker
- **Context compression** — automatically summarizes old messages when approaching the model's context limit
- **Markdown rendering** — tables, code blocks with syntax highlighting and one-click copy, links
- **Export** — download any session as a Markdown file
- **Settings** — configurable system prompt, temperature, top-p, max tokens

## Requirements

- Node.js 20+
- An OpenAI-compatible inference server (vLLM, Ollama, LM Studio, etc.) running locally or on your network

## Setup

```bash
npm install
```

Create a `.env` file:

```env
VLLM_BASE_URL=http://localhost:8000   # your inference server base URL
PORT=3000
DATABASE_PATH=./data/chatlocal.db
TAVILY_API_KEY=                        # optional, for web search via MCP
```

Start the server:

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## MCP Tools

Tool servers are configured in `mcp-servers.json`. Each entry is a stdio process that ChatLocal spawns on startup. Environment variables are interpolated automatically.

```json
{
  "tavily-remote": {
    "command": "npx",
    "args": ["-y", "mcp-remote", "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"]
  }
}
```

Any MCP server that speaks stdio transport works here. Changes require a server restart.

## Connecting to different backends

| Backend | `VLLM_BASE_URL` |
|---------|-----------------|
| vLLM | `http://localhost:8000` |
| Ollama | `http://localhost:11434` |
| LM Studio | `http://localhost:1234` |
| llama.cpp server | `http://localhost:8080` |

The model list is populated automatically from `GET /v1/models`. If your backend doesn't serve that endpoint, set the model ID manually in the settings.
