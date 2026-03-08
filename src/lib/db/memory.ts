import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const memoryDbPath = process.env.MEMORY_DB_PATH ?? "./data/memory.db";
const resolvedPath = path.resolve(memoryDbPath);

let _db: InstanceType<typeof Database> | null = null;

function getDb(): InstanceType<typeof Database> | null {
  if (_db) return _db;
  if (!fs.existsSync(resolvedPath)) return null;
  try {
    _db = new Database(resolvedPath, { readonly: true });
    _db.pragma("journal_mode = WAL");
    return _db;
  } catch {
    return null;
  }
}

export interface Memory {
  id: number;
  source: string;
  raw_text: string;
  summary: string;
  entities: string[];
  topics: string[];
  connections: Array<{ linked_to: number; relationship: string }>;
  importance: number;
  created_at: string;
  consolidated: number;
}

function parseMemoryRow(row: Record<string, unknown>): Memory {
  return {
    id: row.id as number,
    source: (row.source as string) ?? "",
    raw_text: (row.raw_text as string) ?? "",
    summary: (row.summary as string) ?? "",
    entities: parseJson(row.entities as string, []),
    topics: parseJson(row.topics as string, []),
    connections: parseJson(row.connections as string, []),
    importance: (row.importance as number) ?? 0.5,
    created_at: (row.created_at as string) ?? "",
    consolidated: (row.consolidated as number) ?? 0,
  };
}

function parseJson<T>(val: string, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

export interface ListMemoriesOptions {
  q?: string;
  page?: number;
  limit?: number;
}

export function listMemories(options: ListMemoriesOptions = {}): { memories: Memory[]; total: number } {
  const db = getDb();
  if (!db) return { memories: [], total: 0 };

  const { q, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  try {
    if (q && q.trim()) {
      // FTS5 search — sanitize query for FTS5 syntax
      const ftsQuery = q.trim().replace(/['"*()]/g, " ").trim();
      if (!ftsQuery) return listMemories({ page, limit });

      const rows = db
        .prepare(
          `SELECT m.* FROM memories m
           JOIN memories_fts f ON m.id = f.rowid
           WHERE memories_fts MATCH ?
           ORDER BY f.rank, m.importance DESC
           LIMIT ? OFFSET ?`
        )
        .all(ftsQuery, limit, offset) as Record<string, unknown>[];

      const total = (
        db
          .prepare(
            `SELECT COUNT(*) as n FROM memories m
             JOIN memories_fts f ON m.id = f.rowid
             WHERE memories_fts MATCH ?`
          )
          .get(ftsQuery) as { n: number }
      ).n;

      return { memories: rows.map(parseMemoryRow), total };
    }

    const rows = db
      .prepare("SELECT * FROM memories ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .all(limit, offset) as Record<string, unknown>[];

    const total = (db.prepare("SELECT COUNT(*) as n FROM memories").get() as { n: number }).n;

    return { memories: rows.map(parseMemoryRow), total };
  } catch {
    return { memories: [], total: 0 };
  }
}

export function searchMemories(query: string, limit = 10): Memory[] {
  const db = getDb();
  if (!db || !query.trim()) return [];

  try {
    const ftsQuery = query.trim().replace(/['"*()]/g, " ").trim();
    if (!ftsQuery) return [];

    // Combine FTS5 rank with importance for scoring
    const rows = db
      .prepare(
        `SELECT m.*,
                ((-f.rank) * 0.6 + m.importance * 0.4) AS score
         FROM memories m
         JOIN memories_fts f ON m.id = f.rowid
         WHERE memories_fts MATCH ?
         ORDER BY score DESC
         LIMIT ?`
      )
      .all(ftsQuery, limit) as Record<string, unknown>[];

    return rows.map(parseMemoryRow);
  } catch {
    return [];
  }
}

export function getMemory(id: number): Memory | null {
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare("SELECT * FROM memories WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? parseMemoryRow(row) : null;
  } catch {
    return null;
  }
}

export function getMemoryHealth(): {
  healthy: boolean;
  lastHeartbeat: string | null;
  lastConsolidation: string | null;
  memoryCount: number;
  pendingCount: number;
  status: string;
} {
  const db = getDb();
  if (!db) {
    return { healthy: false, lastHeartbeat: null, lastConsolidation: null, memoryCount: 0, pendingCount: 0, status: "offline" };
  }
  try {
    const rows = db.prepare("SELECT key, value FROM sidecar_status").all() as { key: string; value: string }[];
    const kv: Record<string, string> = {};
    for (const r of rows) kv[r.key] = r.value;

    const lastHeartbeat = kv["last_heartbeat"] ?? null;
    const isRecent = lastHeartbeat
      ? Date.now() - new Date(lastHeartbeat).getTime() < 2 * 60 * 1000
      : false;

    return {
      healthy: kv["status"] === "online" && isRecent,
      lastHeartbeat,
      lastConsolidation: kv["last_consolidation"] ?? null,
      memoryCount: parseInt(kv["memory_count"] ?? "0", 10),
      pendingCount: parseInt(kv["pending_count"] ?? "0", 10),
      status: kv["status"] ?? "unknown",
    };
  } catch {
    return { healthy: false, lastHeartbeat: null, lastConsolidation: null, memoryCount: 0, pendingCount: 0, status: "offline" };
  }
}
