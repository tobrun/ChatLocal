import type { Server, Socket } from "socket.io";
import type { SendMessagePayload, CancelGenerationPayload } from "@/types";
import { runAgentLoop } from "@/lib/agent/loop";
import { checkHealth } from "@/lib/vllm/health";
import { getUserDb } from "@/lib/db";
import { settings as settingsTable } from "@/lib/db/schema";
import { DEFAULT_SETTINGS, type AppSettings } from "@/types";
import { eq } from "drizzle-orm";
import { parseAuthCookie, verifyToken } from "@/lib/auth";

// Active abort controllers keyed by sessionId
const activeGenerations = new Map<string, AbortController>();

async function getSettings(userId: string): Promise<AppSettings> {
  try {
    const db = getUserDb(userId);
    const rows = await db.select().from(settingsTable);
    const merged: Partial<AppSettings> = {};
    for (const row of rows) {
      try {
        (merged as Record<string, unknown>)[row.key] = JSON.parse(row.value);
      } catch {
        // skip malformed
      }
    }
    return { ...DEFAULT_SETTINGS, ...merged };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function registerSocketHandlers(io: Server) {
  // Authenticate socket connections via auth_token cookie
  io.use(async (socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie;
    const token = parseAuthCookie(cookieHeader);

    if (!token) {
      return next(new Error("Authentication required"));
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return next(new Error("Invalid or expired token"));
    }

    socket.data.userId = userId;
    next();
  });

  // Broadcast vLLM status every 10 seconds
  setInterval(async () => {
    const health = await checkHealth();
    io.emit("vllm_status", { status: health.status, model: health.model });
  }, 10_000);

  io.on("connection", (socket: Socket) => {
    const userId: string = socket.data.userId;
    console.log("[Socket] Client connected:", socket.id, "user:", userId);

    // Send initial health status
    checkHealth().then((health) => {
      socket.emit("vllm_status", { status: health.status, model: health.model });
    });

    socket.on("send_message", async (payload: SendMessagePayload) => {
      const { sessionId, content, images = [], transcripts = [], webpages = [] } = payload;

      // Cancel any existing generation for this session
      const existing = activeGenerations.get(sessionId);
      if (existing) {
        existing.abort();
        activeGenerations.delete(sessionId);
      }

      const controller = new AbortController();
      activeGenerations.set(sessionId, controller);

      const appSettings = await getSettings(userId);

      try {
        await runAgentLoop(
          sessionId,
          content,
          images,
          socket,
          controller.signal,
          appSettings,
          transcripts,
          webpages,
          userId
        );
      } finally {
        activeGenerations.delete(sessionId);
      }
    });

    socket.on("cancel_generation", (payload: CancelGenerationPayload) => {
      const { sessionId } = payload;
      const controller = activeGenerations.get(sessionId);
      if (controller) {
        controller.abort();
        activeGenerations.delete(sessionId);
        console.log("[Socket] Cancelled generation for session:", sessionId);
      }
    });

    socket.on("disconnect", () => {
      console.log("[Socket] Client disconnected:", socket.id);
    });
  });
}
