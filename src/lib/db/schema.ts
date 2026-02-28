import { sql } from "drizzle-orm";
import {
  text,
  integer,
  sqliteTable,
} from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("New Chat"),
  modelId: text("model_id").notNull(),
  createdAt: integer("created_at", { mode: "number" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "number" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
  content: text("content").notNull(),
  toolCalls: text("tool_calls"),
  toolCallId: text("tool_call_id"),
  isPartial: integer("is_partial", { mode: "boolean" }).notNull().default(false),
  thinking: text("thinking"),
  createdAt: integer("created_at", { mode: "number" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Setting = typeof settings.$inferSelect;
