import { NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";

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

export async function POST(request: Request) {
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

    const segments = await YoutubeTranscript.fetchTranscript(videoId);

    if (!segments || segments.length === 0) {
      return NextResponse.json(
        { error: "No transcript available for this video" },
        { status: 404 }
      );
    }

    const transcript = segments.map((s) => s.text).join(" ");

    return NextResponse.json({ transcript, videoId });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch transcript";
    console.error("[YouTube Transcript]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
