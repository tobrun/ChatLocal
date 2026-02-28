import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { DEFAULT_SETTINGS, type AppSettings } from "@/types";

export async function GET() {
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
  const body: Partial<AppSettings> = await req.json();

  for (const [key, value] of Object.entries(body)) {
    await db
      .insert(settings)
      .values({ key, value: JSON.stringify(value) })
      .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value) } });
  }

  return NextResponse.json({ ok: true });
}
