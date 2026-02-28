import type { MessageData } from "@/types";
import { vllmClient } from "@/lib/vllm/client";

// Rough token estimate: 4 chars per token
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function messageTokens(msg: MessageData): number {
  let tokens = estimateTokens(msg.content);
  if (msg.thinking) tokens += estimateTokens(msg.thinking);
  if (msg.toolCalls) tokens += estimateTokens(JSON.stringify(msg.toolCalls));
  return tokens + 4; // overhead per message
}

export function countTokens(messages: MessageData[]): number {
  return messages.reduce((sum, m) => sum + messageTokens(m), 0);
}

export async function summarizeAndCompress(
  messages: MessageData[],
  modelId: string,
  threshold: number,
  maxModelLen: number
): Promise<MessageData[]> {
  const totalTokens = countTokens(messages);
  const maxTokens = Math.floor(maxModelLen * threshold);

  if (totalTokens <= maxTokens) return messages;

  // Keep the last 10 messages verbatim
  const keepCount = 10;
  const toSummarize = messages.slice(0, -keepCount);
  const toKeep = messages.slice(-keepCount);

  if (toSummarize.length === 0) return messages;

  const transcript = toSummarize
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  try {
    const response = await vllmClient.chat.completions.create({
      model: modelId,
      messages: [
        {
          role: "system",
          content: "Summarize the following conversation concisely, preserving key facts, decisions, and context.",
        },
        { role: "user", content: transcript },
      ],
      max_tokens: 1024,
      stream: false,
    });

    const summary = response.choices[0]?.message?.content ?? "Previous conversation summarized.";

    const summaryMessage: MessageData = {
      id: `summary-${Date.now()}`,
      sessionId: messages[0]?.sessionId ?? "",
      role: "system",
      content: `[Conversation summary]: ${summary}`,
      isPartial: false,
      createdAt: Date.now() / 1000,
    };

    return [summaryMessage, ...toKeep];
  } catch (err) {
    console.error("[Agent] Summarization failed:", err);
    return messages; // return unchanged on failure
  }
}
