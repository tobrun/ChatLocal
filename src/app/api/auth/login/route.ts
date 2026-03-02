import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { usersDb } from "@/lib/db";
import { users } from "@/lib/db/users-schema";
import {
  verifyPassword,
  createToken,
  makeAuthCookieHeader,
} from "@/lib/auth";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { username, password } = parsed.data;

  const user = await usersDb
    .select()
    .from(users)
    .where(eq(users.username, username))
    .then((rows) => rows[0]);

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const token = await createToken(user.id);

  return NextResponse.json(
    { id: user.id, username: user.username },
    { headers: { "Set-Cookie": makeAuthCookieHeader(token) } }
  );
}
