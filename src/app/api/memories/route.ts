import { NextRequest, NextResponse } from "next/server";
import { listMemories } from "@/lib/db/memory";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q") ?? undefined;
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);

  const result = listMemories({ q, page, limit });
  return NextResponse.json(result);
}
