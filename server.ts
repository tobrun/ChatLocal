import "dotenv/config";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import next from "next";
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

  // Graceful shutdown — force exit after 3s so open Socket.IO connections don't hang
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("[Server] Shutting down...");
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
