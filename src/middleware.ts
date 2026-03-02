import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifyTokenEdge } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public routes
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Allow Next.js internals and static files
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET;
  const token = req.cookies.get(AUTH_COOKIE)?.value;

  let userId: string | null = null;
  if (token && secret) {
    userId = await verifyTokenEdge(token, secret);
  } else if (token && !secret) {
    // Secret not in env — allow API routes to do full DB-backed verification
    // For page routes, we must fall through to redirect (can't query DB in Edge)
    if (pathname.startsWith("/api/")) {
      return NextResponse.next();
    }
  }

  if (!userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
