import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessions, messages } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, id) });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, id))
    .orderBy(asc(messages.createdAt));

  const lines: string[] = [
    `# ${session.title}`,
    ``,
    `**Model**: ${session.modelId}`,
    `**Created**: ${new Date(session.createdAt * 1000).toISOString()}`,
    ``,
    `---`,
    ``,
  ];

  for (const msg of msgs) {
    if (msg.role === "system") continue;

    const roleLabel =
      msg.role === "user"
        ? "**User**"
        : msg.role === "assistant"
        ? "**Assistant**"
        : "**Tool**";

    lines.push(`## ${roleLabel}`);

    if (msg.thinking) {
      lines.push(``, `<details><summary>Reasoning</summary>`, ``, msg.thinking, ``, `</details>`, ``);
    }

    let content = msg.content;
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        content = parsed
          .filter((p: { type: string; text?: string }) => p.type === "text")
          .map((p: { text?: string }) => p.text ?? "")
          .join("\n");
      }
    } catch {
      // use raw content
    }

    lines.push(``, content, ``);
    lines.push(`---`, ``);
  }

  const markdown = lines.join("\n");
  const filename = `${session.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.md`;

  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
