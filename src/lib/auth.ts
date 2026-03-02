import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { usersDb } from "@/lib/db";
import { serverConfig } from "@/lib/db/users-schema";
import { eq } from "drizzle-orm";

const scryptAsync = promisify(scrypt);

export const AUTH_COOKIE = "auth_token";
const TOKEN_SEPARATOR = ".";

// ─── Secret management ─────────────────────────────────────────────────────────

let cachedSecret: string | null = null;

export async function getAuthSecret(): Promise<string> {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (cachedSecret) return cachedSecret;

  // Try to load from DB
  const row = await usersDb
    .select()
    .from(serverConfig)
    .where(eq(serverConfig.key, "auth_secret"))
    .then((rows) => rows[0]);

  if (row) {
    cachedSecret = row.value;
    return cachedSecret;
  }

  // Generate and persist a new secret
  const secret = randomBytes(32).toString("hex");
  await usersDb
    .insert(serverConfig)
    .values({ key: "auth_secret", value: secret })
    .onConflictDoNothing();
  cachedSecret = secret;
  console.warn(
    "[Auth] No AUTH_SECRET env var set. Generated a random secret — " +
    "users will need to log in again after server restarts. " +
    "Set AUTH_SECRET in your .env for persistent sessions."
  );
  return secret;
}

// ─── Password hashing ──────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const derivedHash = (await scryptAsync(password, salt, 64)) as Buffer;
  const hashBuf = Buffer.from(hash, "hex");
  if (derivedHash.length !== hashBuf.length) return false;
  return timingSafeEqual(derivedHash, hashBuf);
}

// ─── Token creation / verification ────────────────────────────────────────────

export async function createToken(userId: string): Promise<string> {
  const secret = await getAuthSecret();
  const timestamp = Date.now().toString();
  const data = `${userId}${TOKEN_SEPARATOR}${timestamp}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const signature = Buffer.from(sigBuffer).toString("hex");

  return Buffer.from(`${data}${TOKEN_SEPARATOR}${signature}`).toString("base64url");
}

export async function verifyToken(token: string): Promise<string | null> {
  const secret = process.env.AUTH_SECRET ?? cachedSecret;
  if (!secret) {
    // Secret not yet loaded — do a full load
    const loaded = await getAuthSecret();
    return verifyTokenWithSecret(token, loaded);
  }
  return verifyTokenWithSecret(token, secret);
}

async function verifyTokenWithSecret(token: string, secret: string): Promise<string | null> {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const lastDot = decoded.lastIndexOf(TOKEN_SEPARATOR);
    if (lastDot === -1) return null;

    const data = decoded.slice(0, lastDot);
    const signature = decoded.slice(lastDot + 1);

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = Buffer.from(signature, "hex");
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(data)
    );
    if (!valid) return null;

    // data = "userId.timestamp"
    const firstDot = data.indexOf(TOKEN_SEPARATOR);
    if (firstDot === -1) return null;
    return data.slice(0, firstDot);
  } catch {
    return null;
  }
}

// ─── Sync token verification (for middleware — uses env var only) ──────────────
// Called from Next.js middleware (Edge runtime), so must be synchronous-friendly
// and only relies on process.env.AUTH_SECRET (no DB access).

export async function verifyTokenEdge(token: string, secret: string): Promise<string | null> {
  return verifyTokenWithSecret(token, secret);
}

// ─── Cookie helpers ────────────────────────────────────────────────────────────

export function parseAuthCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === AUTH_COOKIE) return rest.join("=");
  }
  return null;
}

export function makeAuthCookieHeader(token: string): string {
  const maxAge = 60 * 60 * 24 * 7; // 7 days
  return `${AUTH_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearAuthCookieHeader(): string {
  return `${AUTH_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}
