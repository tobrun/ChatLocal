import { vllmClient } from "@/lib/vllm/client";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function generateSessionTitle(
  sessionId: string,
  userMessage: string,
  assistantResponse: string,
  modelId: string
): Promise<void> {
  try {
    const response = await vllmClient.chat.completions.create({
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
      max_tokens: 20,
      temperature: 0.3,
      stream: false,
    });

    const title = response.choices[0]?.message?.content?.trim();
    if (!title) return;

    await db
      .update(sessions)
      .set({ title, updatedAt: sql`(unixepoch())` })
      .where(eq(sessions.id, sessionId));
  } catch (err) {
    console.error("[Naming] Failed to generate session title:", err);
  }
}
