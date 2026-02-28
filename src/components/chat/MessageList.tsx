"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { AssistantMessage } from "./AssistantMessage";
import type { MessageData } from "@/types";

interface ActiveToolCall {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  done: boolean;
}

interface StreamingMessage {
  id: string;
  content: string;
  thinking: string;
  toolCalls: ActiveToolCall[];
  isStreaming: boolean;
}

interface MessageListProps {
  messages: MessageData[];
  streaming: StreamingMessage | null;
}

export function MessageList({ messages, streaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming?.content, streaming?.toolCalls]);

  const visible = messages.filter((m) => m.role !== "system" && m.role !== "tool");

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="flex flex-col gap-4 px-4 py-6 max-w-3xl mx-auto">
        {visible.length === 0 && !streaming && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Send a message to start the conversation
          </div>
        )}

        {visible.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {streaming && (
          <div className="flex gap-3 justify-start">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary mt-0.5">
              AI
            </div>
            <div className="max-w-[85%] rounded-xl px-4 py-2.5 bg-muted/30 border border-border/40">
              <AssistantMessage
                content={streaming.content}
                thinking={streaming.thinking}
                toolCalls={streaming.toolCalls}
                isStreaming={streaming.isStreaming}
              />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
