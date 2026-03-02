#!/usr/bin/env tsx
/**
 * Create a user in the users database.
 * Usage: tsx scripts/create-user.ts <username> <password>
 */
import "dotenv/config";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as usersSchema from "../src/lib/db/users-schema";
import { eq } from "drizzle-orm";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

async function main() {
  const [, , username, password] = process.argv;

  if (!username || !password) {
    console.error("Usage: tsx scripts/create-user.ts <username> <password>");
    process.exit(1);
  }

  const dataDir = path.resolve(process.env.DATA_DIR ?? "./data");
  fs.mkdirSync(dataDir, { recursive: true });

  const dbPath = path.join(dataDir, "users.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // Ensure tables exist
  sqlite.exec(`
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

  const db = drizzle(sqlite, { schema: usersSchema });

  // Check if user already exists
  const existing = await db
    .select()
    .from(usersSchema.users)
    .where(eq(usersSchema.users.username, username))
    .then((rows) => rows[0]);

  if (existing) {
    console.error(`User "${username}" already exists.`);
    process.exit(1);
  }

  const id = uuidv4();
  const passwordHash = await hashPassword(password);

  await db.insert(usersSchema.users).values({ id, username, passwordHash });

  console.log(`User "${username}" created successfully (id: ${id})`);
  sqlite.close();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
