"use client";

import { AssistantMessage } from "./AssistantMessage";
import { cn } from "@/lib/utils";
import type { MessageData } from "@/types";

interface MessageBubbleProps {
  message: MessageData;
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

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === "system" || message.role === "tool") return null;

  const isUser = message.role === "user";

  let toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = [];
  if (message.toolCalls) {
    try {
      toolCalls = typeof message.toolCalls === "string"
        ? JSON.parse(message.toolCalls)
        : message.toolCalls;
    } catch {
      // ignore
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
          />
        )}
      </div>
    </div>
  );
}
