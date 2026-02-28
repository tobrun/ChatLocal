import { NextResponse } from "next/server";
import { checkHealth } from "@/lib/vllm/health";

export async function GET() {
  const health = await checkHealth();
  return NextResponse.json(health);
}
