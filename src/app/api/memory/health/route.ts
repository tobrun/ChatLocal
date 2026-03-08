import { NextResponse } from "next/server";
import { getMemoryHealth } from "@/lib/db/memory";

export async function GET() {
  const health = getMemoryHealth();
  return NextResponse.json(health);
}
