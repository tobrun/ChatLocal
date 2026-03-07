"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useSocket } from "./useSocket";
import type {
  MessageData,
  TokenEvent,
  ThinkingTokenEvent,
  ToolCallEvent,
  ToolResultEvent,
  MessageCompleteEvent,
  GenerationErrorEvent,
  MemoryRecallStartEvent,
  MemoryRecallResultEvent,
  MemoryItem,
} from "@/types";

interface ActiveToolCall {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  done: boolean;
}

export interface MemoryRecallState {
  query: string;
  memories: MemoryItem[];
  done: boolean;
}

interface StreamingMessage {
  id: string;
  content: string;
  thinking: string;
  toolCalls: ActiveToolCall[];
  memoryRecall: MemoryRecallState | null;
  isStreaming: boolean;
}

export function useChat(sessionId: string | null) {
  const socket = useSocket();
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [streaming, setStreaming] = useState<StreamingMessage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef(sessionId);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Load initial messages
  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setStreaming(null);
      return;
    }

    setMessages([]);
    setStreaming(null);
    setError(null);

    fetch(`/api/sessions/${sessionId}/messages`)
      .then((r) => r.json())
      .then((data: MessageData[]) => setMessages(data))
      .catch(() => setError("Failed to load messages"));
  }, [sessionId]);

  // Socket event handlers
  useEffect(() => {
    const onToken = ({ delta }: TokenEvent) => {
      setStreaming((prev) => {
        if (!prev) return null;
        return { ...prev, content: prev.content + delta };
      });
    };

    const onThinkingToken = ({ delta }: ThinkingTokenEvent) => {
      setStreaming((prev) => {
        if (!prev) return null;
        return { ...prev, thinking: prev.thinking + delta };
      });
    };

    const onToolCallStart = ({ toolName, args, callId }: ToolCallEvent) => {
      setStreaming((prev) => {
        if (!prev) return null;
        const newCall: ActiveToolCall = { callId, toolName, args, done: false };
        return { ...prev, toolCalls: [...prev.toolCalls, newCall] };
      });
    };

    const onToolCallResult = ({ callId, result, isError }: ToolResultEvent) => {
      setStreaming((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          toolCalls: prev.toolCalls.map((tc) =>
            tc.callId === callId ? { ...tc, result, isError, done: true } : tc
          ),
        };
      });
    };

    const onMemoryRecallStart = ({ query }: MemoryRecallStartEvent) => {
      setStreaming((prev) => {
        if (!prev) return null;
        return { ...prev, memoryRecall: { query, memories: [], done: false } };
      });
    };

    const onMemoryRecallResult = ({ memories }: MemoryRecallResultEvent) => {
      setStreaming((prev) => {
        if (!prev) return null;
        return { ...prev, memoryRecall: prev.memoryRecall ? { ...prev.memoryRecall, memories, done: true } : null };
      });
    };

    const onMessageComplete = ({ messageId, sessionId: sid }: MessageCompleteEvent) => {
      if (sid !== sessionIdRef.current) return;
      setIsGenerating(false);

      // Reload messages from server to get the final persisted state
      fetch(`/api/sessions/${sid}/messages`)
        .then((r) => r.json())
        .then((data: MessageData[]) => {
          setMessages(data);
          setStreaming(null);
        })
        .catch(() => {});
    };

    const onError = ({ error: err }: GenerationErrorEvent) => {
      setError(err);
      setIsGenerating(false);
      setStreaming(null);
    };

    socket.on("token", onToken);
    socket.on("thinking_token", onThinkingToken);
    socket.on("tool_call_start", onToolCallStart);
    socket.on("tool_call_result", onToolCallResult);
    socket.on("message_complete", onMessageComplete);
    socket.on("generation_error", onError);
    socket.on("memory_recall_start", onMemoryRecallStart);
    socket.on("memory_recall_result", onMemoryRecallResult);

    return () => {
      socket.off("token", onToken);
      socket.off("thinking_token", onThinkingToken);
      socket.off("tool_call_start", onToolCallStart);
      socket.off("tool_call_result", onToolCallResult);
      socket.off("message_complete", onMessageComplete);
      socket.off("generation_error", onError);
      socket.off("memory_recall_start", onMemoryRecallStart);
      socket.off("memory_recall_result", onMemoryRecallResult);
    };
  }, [socket]);

  const sendMessage = useCallback(
    (
      content: string,
      images: string[] = [],
      transcripts?: { videoId: string; transcript: string }[],
      webpages?: { url: string; title: string; content: string }[],
      memoryEnabled = true,
    ) => {
      if (!sessionId || isGenerating) return;

      const hasMedia =
        images.length > 0 ||
        (transcripts && transcripts.length > 0) ||
        (webpages && webpages.length > 0);

      let userContent: string;
      if (hasMedia) {
        const parts: Array<Record<string, unknown>> = [];
        if (transcripts && transcripts.length > 0) {
          for (const t of transcripts) {
            parts.push({
              type: "text",
              text: `[YouTube Transcript — ${t.videoId}]\n${t.transcript}`,
            });
          }
        }
        if (webpages && webpages.length > 0) {
          for (const w of webpages) {
            parts.push({
              type: "text",
              text: `[Webpage — ${w.title}]\n${w.content}`,
            });
          }
        }
        parts.push({ type: "text", text: content });
        for (const img of images) {
          parts.push({ type: "image_url", image_url: { url: img } });
        }
        userContent = JSON.stringify(parts);
      } else {
        userContent = content;
      }

      const optimisticMsg: MessageData = {
        id: uuidv4(),
        sessionId,
        role: "user",
        content: userContent,
        isPartial: false,
        createdAt: Math.floor(Date.now() / 1000),
      };

      setError(null);
      setIsGenerating(true);
      setMessages((prev) => [...prev, optimisticMsg]);
      setStreaming({
        id: uuidv4(),
        content: "",
        thinking: "",
        toolCalls: [],
        memoryRecall: null,
        isStreaming: true,
      });

      socket.emit("send_message", { sessionId, content, images, transcripts, webpages, memoryEnabled });
    },
    [sessionId, isGenerating, socket]
  );

  const cancelGeneration = useCallback(() => {
    if (!sessionId || !isGenerating) return;
    socket.emit("cancel_generation", { sessionId });
    setIsGenerating(false);
  }, [sessionId, isGenerating, socket]);

  return {
    messages,
    streaming,
    isGenerating,
    error,
    sendMessage,
    cancelGeneration,
    clearError: () => setError(null),
  };
}
