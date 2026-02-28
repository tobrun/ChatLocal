export interface SessionSummary {
  id: string;
  title: string;
  modelId: string;
  createdAt: number;
  updatedAt: number;
  messageCount?: number;
}

export interface MessageData {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: ToolCall[] | null;
  toolCallId?: string | null;
  isPartial: boolean;
  thinking?: string | null;
  createdAt: number;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolCallEvent {
  toolName: string;
  args: Record<string, unknown>;
  callId: string;
}

export interface ToolResultEvent {
  callId: string;
  result: string;
  isError: boolean;
}

export interface AppSettings {
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  contextThreshold: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  systemPrompt: "You are a helpful assistant.",
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 2048,
  contextThreshold: 0.8,
};

export interface VllmModel {
  id: string;
  object: string;
  maxModelLen?: number;
}

// Socket.IO event payloads
export interface SendMessagePayload {
  sessionId: string;
  content: string;
  images: string[];
}

export interface CancelGenerationPayload {
  sessionId: string;
}

export interface TokenEvent {
  delta: string;
}

export interface ThinkingTokenEvent {
  delta: string;
}

export interface MessageCompleteEvent {
  messageId: string;
  sessionId: string;
}

export interface GenerationErrorEvent {
  error: string;
}

export interface VllmStatusEvent {
  status: "ok" | "down";
  model?: string;
}
