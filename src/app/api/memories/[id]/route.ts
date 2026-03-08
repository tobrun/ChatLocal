import { NextRequest, NextResponse } from "next/server";
import { getMemory } from "@/lib/db/memory";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const memoryDbPath = process.env.MEMORY_DB_PATH ?? "./data/memory.db";

function getWriteDb(): InstanceType<typeof Database> | null {
  const resolved = path.resolve(memoryDbPath);
  if (!fs.existsSync(resolved)) return null;
  try {
    const db = new Database(resolved);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    return db;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const memory = getMemory(parseInt(id, 10));
  if (!memory) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(memory);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const memoryId = parseInt(id, 10);

  const db = getWriteDb();
  if (!db) return NextResponse.json({ error: "Memory database unavailable" }, { status: 503 });

  try {
    const existing = db.prepare("SELECT id FROM memories WHERE id = ?").get(memoryId);
    if (!existing) {
      db.close();
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Clean up connection references in other memories
    const others = db
      .prepare("SELECT id, connections FROM memories WHERE connections != '[]' AND id != ?")
      .all(memoryId) as { id: number; connections: string }[];

    for (const other of others) {
      try {
        const conns: Array<{ linked_to: number; relationship: string }> = JSON.parse(other.connections);
        const cleaned = conns.filter((c) => c.linked_to !== memoryId);
        if (cleaned.length !== conns.length) {
          db.prepare("UPDATE memories SET connections = ? WHERE id = ?").run(
            JSON.stringify(cleaned),
            other.id
          );
        }
      } catch {
        // skip malformed connections
      }
    }

    db.prepare("DELETE FROM memories WHERE id = ?").run(memoryId);
    db.close();

    return NextResponse.json({ success: true });
  } catch (err) {
    db.close();
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
