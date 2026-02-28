import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessions, messages } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

export async function GET() {
  const rows = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      modelId: sessions.modelId,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      messageCount: sql<number>`(SELECT COUNT(*) FROM messages WHERE session_id = ${sessions.id})`,
    })
    .from(sessions)
    .orderBy(desc(sessions.updatedAt));

  return NextResponse.json(rows);
}

const createSessionSchema = z.object({
  modelId: z.string().min(1),
  title: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { modelId, title } = parsed.data;
  const id = uuidv4();

  await db.insert(sessions).values({
    id,
    modelId,
    title: title ?? "New Chat",
  });

  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, id) });
  return NextResponse.json(session, { status: 201 });
}
