"use client";

import { AssistantMessage } from "./AssistantMessage";
import { cn } from "@/lib/utils";
import type { MessageData } from "@/types";

interface MessageBubbleProps {
  message: MessageData;
  toolResults?: Map<string, { content: string; isError: boolean }>;
}

function UserContent({ content }: { content: string }) {
  let parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) parts = parsed;
  } catch {
    return <p className="text-sm whitespace-pre-wrap">{content}</p>;
  }

  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        if (part.type === "text") {
          return <p key={i} className="text-sm whitespace-pre-wrap">{part.text}</p>;
        }
        if (part.type === "image_url" && part.image_url) {
          return (
            <img
              key={i}
              src={part.image_url.url}
              alt="Attached"
              className="max-h-64 rounded-md border border-border/50 object-contain"
            />
          );
        }
        return null;
      })}
    </div>
  );
}

export function MessageBubble({ message, toolResults }: MessageBubbleProps) {
  if (message.role === "system" || message.role === "tool") return null;

  const isUser = message.role === "user";

  let resolvedToolCalls: Array<{
    callId: string;
    toolName: string;
    args: Record<string, unknown>;
    result?: string;
    isError?: boolean;
    done: boolean;
  }> = [];

  if (!isUser && message.toolCalls) {
    try {
      const raw: Array<{ id: string; function: { name: string; arguments: string } }> =
        typeof message.toolCalls === "string"
          ? JSON.parse(message.toolCalls)
          : message.toolCalls;

      resolvedToolCalls = raw.map((tc) => {
        const resultEntry = toolResults?.get(tc.id);
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* ignore */ }
        return {
          callId: tc.id,
          toolName: tc.function.name,
          args,
          result: resultEntry?.content,
          isError: resultEntry?.isError,
          done: true,
        };
      });
    } catch {
      // ignore malformed tool calls
    }
  }

  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary mt-0.5">
          AI
        </div>
      )}

      <div
        className={cn(
          "max-w-[85%] rounded-xl px-4 py-2.5",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted/30 border border-border/40"
        )}
      >
        {isUser ? (
          <UserContent content={message.content} />
        ) : (
          <AssistantMessage
            content={message.content}
            thinking={message.thinking}
            toolCalls={resolvedToolCalls}
          />
        )}
      </div>
    </div>
  );
}
