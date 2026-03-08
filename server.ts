import "dotenv/config";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import next from "next";
import { execSync, spawn, type ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { runMigrations } from "./src/lib/db/index";
import { mcpManager } from "./src/lib/mcp/manager";
import { registerSocketHandlers } from "./src/server/socket";

const port = parseInt(process.env.PORT ?? "3000", 10);
const dev = process.env.NODE_ENV !== "production";

async function main() {
  // Initialize DB
  console.log("[Server] Running database migrations...");
  runMigrations();
  console.log("[Server] Database ready");

  // Initialize MCP servers
  console.log("[Server] Initializing MCP servers...");
  await mcpManager.initialize();
  console.log("[Server] MCP servers ready");

  // Initialize Next.js
  const app = next({ dev });
  const handle = app.getRequestHandler();
  await app.prepare();

  // Create HTTP server
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });
  httpServer.setMaxListeners(0);

  // Attach Socket.IO
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Register Socket.IO event handlers
  registerSocketHandlers(io);

  // Start listening
  httpServer.listen(port, () => {
    console.log(`[Server] Running at http://localhost:${port}`);
    console.log(`[Server] Mode: ${dev ? "development" : "production"}`);
  });

  // Start memory sidecar
  let sidecarProcess: ChildProcess | null = null;
  const sidecarDir = path.resolve("memory-agent");
  const venvPython = path.join(sidecarDir, "venv", "bin", "python");
  const agentScript = path.join(sidecarDir, "agent.py");

  if (fs.existsSync(agentScript)) {
    if (!fs.existsSync(venvPython)) {
      console.log("[Memory] venv not found — running setup.sh...");
      try {
        execSync(`bash ${path.join(sidecarDir, "setup.sh")}`, { stdio: "inherit" });
      } catch (err) {
        console.error("[Memory] setup.sh failed:", err);
      }
    }
    if (fs.existsSync(venvPython)) {
      const vllmModel = process.env.VLLM_MODEL ?? "";
      sidecarProcess = spawn(venvPython, [agentScript], {
        env: {
          ...process.env,
          VLLM_BASE_URL: process.env.VLLM_BASE_URL ?? "http://localhost:8000",
          MEMORY_DB_PATH: process.env.MEMORY_DB_PATH ?? "./data/memory.db",
          MEMORY_INBOX_PATH: process.env.MEMORY_INBOX_PATH ?? "./memory-agent/inbox",
          VLLM_MODEL: vllmModel,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      sidecarProcess.stdout?.on("data", (d: Buffer) =>
        process.stdout.write(`[memory] ${d.toString()}`)
      );
      sidecarProcess.stderr?.on("data", (d: Buffer) =>
        process.stderr.write(`[memory] ${d.toString()}`)
      );
      sidecarProcess.on("exit", (code) => {
        if (code !== 0 && code !== null)
          console.error(`[Memory] Sidecar exited with code ${code}`);
      });
      console.log("[Memory] Sidecar started");
    } else {
      console.warn("[Memory] Sidecar venv unavailable — memory features disabled");
    }
  } else {
    console.warn("[Memory] memory-agent/agent.py not found — memory features disabled");
  }

  // Graceful shutdown — force exit after 3s so open Socket.IO connections don't hang
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("[Server] Shutting down...");
    if (sidecarProcess) {
      sidecarProcess.kill("SIGTERM");
    }
    setTimeout(() => process.exit(0), 3000).unref();
    await mcpManager.shutdown();
    io.close();
    httpServer.close(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[Server] Fatal error:", err);
  process.exit(1);
});
