import { NextRequest, NextResponse } from "next/server";
import { parseAuthCookie, verifyToken } from "@/lib/auth";
import { getUserDb } from "@/lib/db";

/**
 * Resolves the authenticated user's database from a Next.js request.
 * Returns { userId, db } on success, or a 401 NextResponse on failure.
 */
export async function getAuthDb(
  req: NextRequest
): Promise<
  | { userId: string; db: ReturnType<typeof getUserDb>; error: null }
  | { userId: null; db: null; error: NextResponse }
> {
  const token = parseAuthCookie(req.headers.get("cookie"));
  if (!token) {
    return { userId: null, db: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const userId = await verifyToken(token);
  if (!userId) {
    return { userId: null, db: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { userId, db: getUserDb(userId), error: null };
}
