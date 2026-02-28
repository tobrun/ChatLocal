"use client";

import { useEffect } from "react";
import { useChat } from "@/hooks/useChat";
import { useSettingsStore } from "@/stores/settings";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import useSWR from "swr";
import type { VllmModel, SessionSummary } from "@/types";
import { Badge } from "@/components/ui/badge";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ChatViewProps {
  sessionId: string;
}

export function ChatView({ sessionId }: ChatViewProps) {
  const { messages, streaming, isGenerating, error, sendMessage, cancelGeneration, clearError } =
    useChat(sessionId);
  const { settings, loaded, fetchSettings } = useSettingsStore();
  const { data: session } = useSWR<SessionSummary>(`/api/sessions/${sessionId}`, fetcher);
  const { data: models = [] } = useSWR<VllmModel[]>("/api/models", fetcher, {
    refreshInterval: 15000,
  });

  useEffect(() => {
    if (!loaded) fetchSettings();
  }, [loaded, fetchSettings]);

  const modelName = session?.modelId?.split("/").pop() ?? session?.modelId ?? "Unknown model";
  const isModelLoaded = models.some((m) => m.id === session?.modelId);
  const isReadOnly = session && !isModelLoaded && models.length > 0;

  const canSend = !isReadOnly && loaded;

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{modelName}</span>
            {isReadOnly && (
              <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-500">
                Read-only
              </Badge>
            )}
            {session?.modelId && isModelLoaded && (
              <Badge variant="outline" className="text-xs border-green-500/30 text-green-500">
                Active
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div
          className="mx-4 mt-2 rounded-md bg-destructive/15 border border-destructive/30 px-3 py-2 text-sm text-destructive cursor-pointer"
          onClick={clearError}
        >
          {error} (click to dismiss)
        </div>
      )}

      {isReadOnly && (
        <div className="mx-4 mt-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 text-sm text-yellow-600">
          The model bound to this session ({modelName}) is not currently loaded. Start a new chat to continue.
        </div>
      )}

      {/* Messages */}
      <MessageList messages={messages} streaming={streaming} />

      {/* Input */}
      <ChatInput
        onSend={sendMessage}
        onCancel={cancelGeneration}
        isGenerating={isGenerating}
        disabled={!canSend}
      />
    </div>
  );
}
