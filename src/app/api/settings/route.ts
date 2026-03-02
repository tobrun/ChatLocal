import { NextRequest, NextResponse } from "next/server";
import { settings } from "@/lib/db/schema";
import { DEFAULT_SETTINGS, type AppSettings } from "@/types";
import { getAuthDb } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const auth = await getAuthDb(req);
  if (auth.error) return auth.error;
  const { db } = auth;

  const rows = await db.select().from(settings);
  const merged: Partial<AppSettings> = {};
  for (const row of rows) {
    try {
      (merged as Record<string, unknown>)[row.key] = JSON.parse(row.value);
    } catch {
      // skip malformed
    }
  }
  return NextResponse.json({ ...DEFAULT_SETTINGS, ...merged });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthDb(req);
  if (auth.error) return auth.error;
  const { db } = auth;

  const body: Partial<AppSettings> = await req.json();

  for (const [key, value] of Object.entries(body)) {
    await db
      .insert(settings)
      .values({ key, value: JSON.stringify(value) })
      .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value) } });
  }

  return NextResponse.json({ ok: true });
}
