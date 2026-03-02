import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { usersDb } from "@/lib/db";
import { users } from "@/lib/db/users-schema";
import { parseAuthCookie, verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = parseAuthCookie(req.headers.get("cookie"));
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await verifyToken(token);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await usersDb
    .select({ id: users.id, username: users.username, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .then((rows) => rows[0]);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(user);
}
