import { NextRequest, NextResponse } from "next/server";
import { sessions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getAuthDb } from "@/lib/api-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthDb(req);
  if (auth.error) return auth.error;
  const { db } = auth;

  const { id } = await params;
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, id) });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(session);
}

const patchSchema = z.object({
  title: z.string().min(1).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthDb(req);
  if (auth.error) return auth.error;
  const { db } = auth;

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { title } = parsed.data;
  await db
    .update(sessions)
    .set({ title, updatedAt: sql`(unixepoch())` })
    .where(eq(sessions.id, id));

  const updated = await db.query.sessions.findFirst({ where: eq(sessions.id, id) });
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthDb(req);
  if (auth.error) return auth.error;
  const { db } = auth;

  const { id } = await params;
  await db.delete(sessions).where(eq(sessions.id, id));
  return new NextResponse(null, { status: 204 });
}
