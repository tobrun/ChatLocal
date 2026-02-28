import { NextRequest, NextResponse } from "next/server";
import { searchMessages } from "@/lib/search";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  if (!query || query.trim().length === 0) {
    return NextResponse.json([]);
  }

  try {
    const results = searchMessages(query.trim());
    return NextResponse.json(results);
  } catch {
    // FTS5 query syntax errors return empty results
    return NextResponse.json([]);
  }
}
