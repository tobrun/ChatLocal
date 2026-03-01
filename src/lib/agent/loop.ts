import type { Socket } from "socket.io";
import type {
  ChatCompletionMessageParam,
  ChatCompletionUserMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { v4 as uuidv4 } from "uuid";
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { messages, sessions } from "@/lib/db/schema";
import type { MessageData, AppSettings, TranscriptAttachment, WebpageAttachment } from "@/types";
import { vllmClient } from "@/lib/vllm/client";
import { mcpManager } from "@/lib/mcp/manager";
import { summarizeAndCompress, countTokens } from "./context";
import { generateSessionTitle } from "./naming";
import { listModels } from "@/lib/vllm/health";

const MAX_TOOL_ITERATIONS = 10;

function parseThinkingTokens(text: string): { thinking: string; content: string } {
  const thinkMatch = text.match(/^<think>([\s\S]*?)<\/think>\s*/);
  if (thinkMatch) {
    return {
      thinking: thinkMatch[1].trim(),
      content: text.slice(thinkMatch[0].length),
    };
  }
  return { thinking: "", content: text };
}

function buildOpenAIMessages(
  history: MessageData[],
  systemPrompt: string
): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    result.push({ role: "system", content: systemPrompt });
  }

  for (const msg of history) {
    if (msg.role === "system") {
      result.push({ role: "system", content: msg.content });
    } else if (msg.role === "user") {
      let content: ChatCompletionUserMessageParam["content"];
      try {
        const parsed = JSON.parse(msg.content);
        if (Array.isArray(parsed)) {
          // Only use multipart array format when there are image parts (required for vision).
          // For text-only attachments (transcripts, webpages) concatenate into a single
          // string — vLLM may not reliably forward text-only multipart arrays to the model.
          const hasImages = parsed.some((p) => p.type === "image_url");
          if (hasImages) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content = parsed as any;
          } else {
            content = parsed
              .filter((p) => p.type === "text")
              .map((p) => p.text as string)
              .join("\n\n");
          }
        } else {
          content = msg.content;
        }
      } catch {
        content = msg.content;
      }
      result.push({ role: "user", content } as ChatCompletionUserMessageParam);
    } else if (msg.role === "assistant") {
      const assistantMsg: ChatCompletionMessageParam = {
        role: "assistant",
        content: msg.content || null,
      };
      if (msg.toolCalls) {
        try {
          const tc = typeof msg.toolCalls === "string"
            ? JSON.parse(msg.toolCalls)
            : msg.toolCalls;
          (assistantMsg as unknown as Record<string, unknown>).tool_calls = tc;
        } catch {
          // ignore malformed tool calls
        }
      }
      result.push(assistantMsg);
    } else if (msg.role === "tool") {
      result.push({
        role: "tool",
        content: msg.content,
        tool_call_id: msg.toolCallId ?? "",
      });
    }
  }

  return result;
}

export async function runAgentLoop(
  sessionId: string,
  userMessage: string,
  images: string[],
  socket: Socket,
  abortSignal: AbortSignal,
  settings: AppSettings,
  transcripts: TranscriptAttachment[] = [],
  webpages: WebpageAttachment[] = []
): Promise<void> {
  try {
    // Load session
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });
    if (!session) {
      socket.emit("generation_error", { error: "Session not found" });
      return;
    }

    const modelId = session.modelId;

    // Fetch max_model_len for context management — non-blocking, fall back to safe default
    const models = await listModels();
    const modelInfo = models.find((m) => m.id === modelId);
    const maxModelLen = (modelInfo as { max_model_len?: number } | undefined)?.max_model_len ?? 8192;

    // Save user message
    const userMsgId = uuidv4();
    let userContent: string;

    const hasMedia = images.length > 0 || transcripts.length > 0 || webpages.length > 0;

    if (hasMedia) {
      const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
      for (const t of transcripts) {
        contentParts.push({
          type: "text",
          text: `[YouTube Transcript — ${t.videoId}]\n${t.transcript}`,
        });
      }
      for (const w of webpages) {
        contentParts.push({
          type: "text",
          text: `[Webpage — ${w.title}]\n${w.content}`,
        });
      }
      contentParts.push({ type: "text", text: userMessage });
      for (const img of images) {
        contentParts.push({
          type: "image_url",
          image_url: { url: img },
        });
      }
      userContent = JSON.stringify(contentParts);
    } else {
      userContent = userMessage;
    }

    await db.insert(messages).values({
      id: userMsgId,
      sessionId,
      role: "user",
      content: userContent,
    });

    // Load full history
    const history = await db.query.messages.findMany({
      where: eq(messages.sessionId, sessionId),
      orderBy: [messages.createdAt],
    });

    // Map to MessageData
    let historyData: MessageData[] = history.map((m) => ({
      id: m.id,
      sessionId: m.sessionId,
      role: m.role as MessageData["role"],
      content: m.content,
      toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : null,
      toolCallId: m.toolCallId,
      isPartial: Boolean(m.isPartial),
      thinking: m.thinking,
      createdAt: m.createdAt,
    }));

    // Compress context if needed
    const tokenCount = countTokens(historyData);
    const threshold = settings.contextThreshold ?? 0.8;
    if (tokenCount > maxModelLen * threshold) {
      historyData = await summarizeAndCompress(historyData, modelId, threshold, maxModelLen);
    }

    const tools = mcpManager.getOpenAITools() as ChatCompletionTool[];
    let iteration = 0;
    let finalContent = "";
    let finalThinking = "";
    const assistantMsgId = uuidv4();

    // Agent loop
    while (iteration < MAX_TOOL_ITERATIONS) {
      if (abortSignal.aborted) break;

      iteration++;

      // Recheck context size each iteration — tool results can be large
      if (iteration > 1 && countTokens(historyData) > maxModelLen * threshold) {
        historyData = await summarizeAndCompress(historyData, modelId, threshold, maxModelLen);
      }

      const openAIMessages = buildOpenAIMessages(historyData, settings.systemPrompt);

      // Create streaming completion
      const baseParams = {
        model: modelId,
        messages: openAIMessages,
        temperature: settings.temperature,
        top_p: settings.topP,
        max_tokens: settings.maxTokens,
      };

      const stream = await vllmClient.chat.completions.create({
        ...baseParams,
        stream: true as const,
        ...(tools.length > 0 ? { tools, tool_choice: "auto" as const } : {}),
      });

      let accumulatedContent = "";
      let accumulatedThinking = "";
      let inThinkBlock = false;
      const toolCallsAccumulated: Record<
        number,
        { id: string; type: "function"; function: { name: string; arguments: string } }
      > = {};

      for await (const chunk of stream) {
        if (abortSignal.aborted) {
          // Save partial message and exit
          const { thinking, content } = parseThinkingTokens(accumulatedContent);
          await db.insert(messages).values({
            id: assistantMsgId,
            sessionId,
            role: "assistant",
            content: content || accumulatedContent,
            thinking: thinking || accumulatedThinking || null,
            isPartial: true,
          });
          await db.update(sessions).set({ updatedAt: sql`(unixepoch())` }).where(eq(sessions.id, sessionId));
          socket.emit("message_complete", { messageId: assistantMsgId, sessionId });
          return;
        }

        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Handle text content with thinking block detection
        if (delta.content) {
          const text = delta.content;
          accumulatedContent += text;

          // Detect and stream thinking vs content tokens
          if (accumulatedContent.startsWith("<think>") && !inThinkBlock) {
            inThinkBlock = true;
          }

          if (inThinkBlock) {
            const closeIdx = accumulatedContent.indexOf("</think>");
            if (closeIdx !== -1) {
              inThinkBlock = false;
              // Extract thinking content so far
              const thinkContent = accumulatedContent.slice(7, closeIdx);
              accumulatedThinking = thinkContent;
              const afterThink = accumulatedContent.slice(closeIdx + 8).trimStart();
              if (afterThink) {
                socket.emit("token", { delta: afterThink });
                finalContent = afterThink;
              }
            } else {
              socket.emit("thinking_token", { delta: text });
            }
          } else {
            socket.emit("token", { delta: text });
            finalContent += text;
          }
        }

        // Accumulate tool calls
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCallsAccumulated[tc.index]) {
              toolCallsAccumulated[tc.index] = {
                id: tc.id ?? "",
                type: "function",
                function: { name: tc.function?.name ?? "", arguments: "" },
              };
            }
            if (tc.id) toolCallsAccumulated[tc.index].id = tc.id;
            if (tc.function?.name) toolCallsAccumulated[tc.index].function.name = tc.function.name;
            if (tc.function?.arguments) {
              toolCallsAccumulated[tc.index].function.arguments += tc.function.arguments;
            }
          }
        }

        if (choice.finish_reason === "stop" || choice.finish_reason === "length") {
          break;
        }
        if (choice.finish_reason === "tool_calls") {
          break;
        }
      }

      const toolCallsList = Object.values(toolCallsAccumulated);

      if (toolCallsList.length === 0) {
        // Final text response — save and done
        const { thinking, content } = parseThinkingTokens(accumulatedContent);
        finalThinking = thinking || accumulatedThinking;
        finalContent = content || accumulatedContent;

        await db.insert(messages).values({
          id: assistantMsgId,
          sessionId,
          role: "assistant",
          content: finalContent,
          thinking: finalThinking || null,
          isPartial: false,
        });
        await db.update(sessions).set({ updatedAt: sql`(unixepoch())` }).where(eq(sessions.id, sessionId));
        socket.emit("message_complete", { messageId: assistantMsgId, sessionId });
        break;
      }

      // Handle tool calls
      const assistantToolMsgId = uuidv4();
      await db.insert(messages).values({
        id: assistantToolMsgId,
        sessionId,
        role: "assistant",
        content: accumulatedContent,
        toolCalls: JSON.stringify(toolCallsList),
        isPartial: false,
      });

      // Add to local history
      historyData.push({
        id: assistantToolMsgId,
        sessionId,
        role: "assistant",
        content: accumulatedContent,
        toolCalls: toolCallsList,
        isPartial: false,
        createdAt: Math.floor(Date.now() / 1000),
      });

      // Execute each tool call
      for (const tc of toolCallsList) {
        if (abortSignal.aborted) break;

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          // use empty args
        }

        socket.emit("tool_call_start", {
          toolName: tc.function.name,
          args,
          callId: tc.id,
        });

        let toolResult: string;
        let isError = false;

        try {
          toolResult = await mcpManager.callTool(tc.function.name, args);
        } catch (err) {
          toolResult = err instanceof Error ? err.message : String(err);
          isError = true;
        }

        socket.emit("tool_call_result", {
          callId: tc.id,
          result: toolResult,
          isError,
        });

        // Save tool result message
        const toolResultMsgId = uuidv4();
        await db.insert(messages).values({
          id: toolResultMsgId,
          sessionId,
          role: "tool",
          content: toolResult,
          toolCallId: tc.id,
          isPartial: false,
        });

        historyData.push({
          id: toolResultMsgId,
          sessionId,
          role: "tool",
          content: toolResult,
          toolCallId: tc.id,
          isPartial: false,
          createdAt: Math.floor(Date.now() / 1000),
        });
      }
    }

    // Auto-generate session title after first exchange (async, no await)
    if (session.title === "New Chat" && finalContent) {
      generateSessionTitle(sessionId, userMessage, finalContent, modelId)
        .then((title) => {
          if (title) socket.emit("session_renamed", { sessionId, title });
        })
        .catch((err) => console.error("[AgentLoop] Title generation failed:", err));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[AgentLoop] Error:", err);
    socket.emit("generation_error", { error: msg });
  }
}
