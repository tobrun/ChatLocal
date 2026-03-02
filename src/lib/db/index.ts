import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import * as usersSchema from "./users-schema";
import path from "path";
import fs from "fs";

// ─── Users (management) database ─────────────────────────────────────────────

const dataDir = path.resolve(process.env.DATA_DIR ?? "./data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const usersDbPath = path.join(dataDir, "users.db");
const usersSqlite = new Database(usersDbPath);
usersSqlite.pragma("journal_mode = WAL");
usersSqlite.pragma("foreign_keys = ON");

export const usersDb = drizzle(usersSqlite, { schema: usersSchema });

export function runUsersMigrations() {
  usersSqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS server_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

// ─── Per-user chat databases ──────────────────────────────────────────────────

const userDbCache = new Map<string, ReturnType<typeof drizzle>>();

export function getUserDb(userId: string): ReturnType<typeof drizzle<typeof schema>> {
  const cached = userDbCache.get(userId);
  if (cached) return cached as ReturnType<typeof drizzle<typeof schema>>;

  const userDataDir = path.join(dataDir, "users", userId);
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const dbPath = path.join(userDataDir, "chatlocal.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  runChatMigrations(sqlite);

  const db = drizzle(sqlite, { schema });
  userDbCache.set(userId, db as ReturnType<typeof drizzle>);
  return db as ReturnType<typeof drizzle<typeof schema>>;
}

// ─── Chat schema migrations (applied to each user's database) ─────────────────

function runChatMigrations(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      model_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT NOT NULL,
      tool_calls TEXT,
      tool_call_id TEXT,
      is_partial INTEGER NOT NULL DEFAULT 0,
      thinking TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      session_id UNINDEXED,
      content='messages',
      content_rowid='rowid'
    );

    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content, session_id)
      VALUES (new.rowid, new.content, new.session_id);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, session_id)
      VALUES ('delete', old.rowid, old.content, old.session_id);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, session_id)
      VALUES ('delete', old.rowid, old.content, old.session_id);
      INSERT INTO messages_fts(rowid, content, session_id)
      VALUES (new.rowid, new.content, new.session_id);
    END;
  `);
}

// ─── Legacy export (kept for backwards compatibility during migration) ─────────
// Re-export runMigrations as a no-op since migrations now happen per-user.
export function runMigrations() {
  runUsersMigrations();
}
