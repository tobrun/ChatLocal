import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { readFile, readdir, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1);
    }
    if (
      parsed.hostname === "www.youtube.com" ||
      parsed.hostname === "youtube.com" ||
      parsed.hostname === "m.youtube.com"
    ) {
      return parsed.searchParams.get("v");
    }
  } catch {
    // not a valid URL — try treating it as a bare video ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  }
  return null;
}

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Array<{ utf8: string }>;
}

function parseJson3Transcript(json: { events?: Json3Event[] }): string {
  const events = json.events ?? [];
  const lines: string[] = [];

  for (const event of events) {
    if (!event.segs) continue;
    const text = event.segs.map((s) => s.utf8).join("").trim();
    if (text) lines.push(text);
  }

  return lines.join(" ").replace(/\s+/g, " ").trim();
}

export async function POST(request: Request) {
  const tmpBase = join(tmpdir(), `yt-transcript-${Date.now()}`);
  // yt-dlp appends language code and extension, e.g. <base>.en.json3
  const base = tmpBase.split("/").pop()!;

  try {
    const { url } = (await request.json()) as { url: string };

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "A YouTube URL is required" },
        { status: 400 }
      );
    }

    const videoId = extractVideoId(url.trim());
    if (!videoId) {
      return NextResponse.json(
        { error: "Invalid YouTube URL" },
        { status: 400 }
      );
    }

    // yt-dlp fetches auto-generated or manual subtitles without hitting the
    // blocked timedtext endpoint that the youtube-transcript library uses.
    await execFileAsync("yt-dlp", [
      "--write-auto-sub",
      "--write-sub",
      "--skip-download",
      "--sub-format", "json3",
      "--sub-lang", "en",
      "--no-warnings",
      "-o", tmpBase,
      `https://www.youtube.com/watch?v=${videoId}`,
    ]);

    // Find the downloaded subtitle file (yt-dlp names it <base>.<lang>.json3)
    const dir = tmpdir();
    const files = (await readdir(dir)).filter(
      (f) => f.startsWith(base) && f.endsWith(".json3")
    );

    if (files.length === 0) {
      return NextResponse.json(
        { error: "No transcript available for this video" },
        { status: 404 }
      );
    }

    const subtitlePath = join(dir, files[0]);
    const raw = await readFile(subtitlePath, "utf8");
    await unlink(subtitlePath).catch(() => {});

    const transcript = parseJson3Transcript(JSON.parse(raw));

    if (!transcript) {
      return NextResponse.json(
        { error: "No transcript available for this video" },
        { status: 404 }
      );
    }

    return NextResponse.json({ transcript, videoId });
  } catch (err) {
    // Clean up any leftover temp files
    const dir = tmpdir();
    await readdir(dir)
      .then((files) =>
        Promise.all(
          files
            .filter((f) => f.startsWith(base))
            .map((f) => unlink(join(dir, f)).catch(() => {}))
        )
      )
      .catch(() => {});

    const message =
      err instanceof Error ? err.message : "Failed to fetch transcript";
    console.error("[YouTube Transcript]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
