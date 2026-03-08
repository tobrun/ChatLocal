import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const inboxPath = process.env.MEMORY_INBOX_PATH ?? "./memory-agent/inbox";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, source = "manual" } = body as { text: string; source?: string };

    if (!text?.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const inboxDir = path.resolve(inboxPath);
    fs.mkdirSync(inboxDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${timestamp}_manual.json`;
    const filePath = path.join(inboxDir, filename);

    const payload = {
      type: "manual",
      text: text.trim(),
      source,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");

    return NextResponse.json({ success: true, filename });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
