import { NextResponse } from "next/server";
import { listModels } from "@/lib/vllm/health";

export async function GET() {
  const models = await listModels();
  return NextResponse.json(models);
}
