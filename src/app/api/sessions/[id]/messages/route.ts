import { NextRequest, NextResponse } from "next/server";
import { messages } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { getAuthDb } from "@/lib/api-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthDb(req);
  if (auth.error) return auth.error;
  const { db } = auth;

  const { id } = await params;
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, id))
    .orderBy(asc(messages.createdAt));

  return NextResponse.json(rows);
}
