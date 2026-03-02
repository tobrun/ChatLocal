import { vllmClient } from "@/lib/vllm/client";
import { getUserDb } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function generateSessionTitle(
  sessionId: string,
  userMessage: string,
  assistantResponse: string,
  modelId: string,
  userId: string = "default"
): Promise<string | undefined> {
  const db = getUserDb(userId);
  try {
    // Use streaming so that thinking tokens (delta.reasoning) don't count against
    // max_tokens — only delta.content tokens do. Non-streaming mode counts thinking
    // toward max_tokens, causing the model to exhaust the budget before producing output.
    const stream = await vllmClient.chat.completions.create({
      model: modelId,
      messages: [
        {
          role: "system",
          content:
            "Generate a very short title (3-6 words) for this conversation. Respond with ONLY the title, no quotes, no punctuation at the end.",
        },
        {
          role: "user",
          content: `User: ${userMessage.slice(0, 500)}\nAssistant: ${assistantResponse.slice(0, 500)}`,
        },
      ],
      max_tokens: 4096,
      temperature: 0.3,
      stream: true,
    });

    let raw = "";
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) raw += content;
    }

    // Strip <think>...</think> blocks — some models embed thinking in delta.content
    const withoutThinking = raw.replace(/^<think>[\s\S]*?<\/think>\s*/m, "");

    // Take the first non-empty line (model sometimes leads with newlines)
    const title = withoutThinking
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0);

    if (!title) {
      console.warn("[Naming] Model returned empty title for session:", sessionId);
      return undefined;
    }

    await db
      .update(sessions)
      .set({ title, updatedAt: sql`(unixepoch())` })
      .where(eq(sessions.id, sessionId));

    console.log("[Naming] Session title set:", sessionId, "→", title);
    return title;
  } catch (err) {
    console.error("[Naming] Failed to generate session title:", err);
    return undefined;
  }
}
