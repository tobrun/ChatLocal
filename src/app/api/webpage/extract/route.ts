import { NextResponse } from "next/server";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

// Max characters of content to return — keeps context window manageable
const MAX_CONTENT_LENGTH = 50_000;

export async function POST(request: Request) {
  try {
    const { url } = (await request.json()) as { url: string };

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "A URL is required" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        { error: "Only http and https URLs are supported" },
        { status: 400 }
      );
    }

    const res = await fetch(parsedUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ChatLocal/1.0; +https://github.com/chatlocal)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL (HTTP ${res.status})` },
        { status: 502 }
      );
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return NextResponse.json(
        { error: "URL does not point to an HTML page" },
        { status: 422 }
      );
    }

    const html = await res.text();
    const dom = new JSDOM(html, { url: parsedUrl.toString() });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.textContent?.trim()) {
      return NextResponse.json(
        { error: "Could not extract readable content from this page" },
        { status: 404 }
      );
    }

    // Normalise whitespace and truncate
    const content = article.textContent
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MAX_CONTENT_LENGTH);

    const title = article.title?.trim() || parsedUrl.hostname;

    return NextResponse.json({ content, title, url: parsedUrl.toString() });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch webpage";
    console.error("[Webpage Extract]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
