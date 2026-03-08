import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const inboxPath = process.env.MEMORY_INBOX_PATH ?? "./memory-agent/inbox";

const SUPPORTED_EXTENSIONS = new Set([
  ".txt", ".md", ".json", ".csv", ".log", ".xml", ".yaml", ".yml",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg",
  ".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac",
  ".mp4", ".webm", ".mov", ".avi", ".mkv",
  ".pdf",
]);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: `Unsupported file type: ${ext}` }, { status: 400 });
    }

    const inboxDir = path.resolve(inboxPath);
    fs.mkdirSync(inboxDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeFilename = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const filePath = path.join(inboxDir, safeFilename);

    const arrayBuffer = await file.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));

    return NextResponse.json({ success: true, filename: safeFilename });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
