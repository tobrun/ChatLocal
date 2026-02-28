"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallCard } from "./ToolCallCard";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ActiveToolCall {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  done: boolean;
}

interface AssistantMessageProps {
  content: string;
  thinking?: string | null;
  toolCalls?: ActiveToolCall[];
  isStreaming?: boolean;
}

function CodeBlock({ children, className }: { children?: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const code = String(children ?? "").trimEnd();
  const language = className?.replace("language-", "") ?? "";

  const copy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="relative group my-3">
      <div className="flex items-center justify-between rounded-t-md bg-muted/60 px-3 py-1 border border-b-0 border-border/60">
        <span className="text-xs text-muted-foreground font-mono">{language || "code"}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={copy}
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      <pre className="rounded-b-md border border-border/60 bg-muted/30 p-3 overflow-x-auto">
        <code className="text-sm font-mono">{code}</code>
      </pre>
    </div>
  );
}

export function AssistantMessage({
  content,
  thinking,
  toolCalls = [],
  isStreaming,
}: AssistantMessageProps) {
  return (
    <div className="space-y-1">
      {thinking && <ThinkingBlock content={thinking} />}

      {toolCalls.map((tc) => (
        <ToolCallCard
          key={tc.callId}
          toolName={tc.toolName}
          args={tc.args}
          result={tc.result}
          isError={tc.isError}
          done={tc.done}
        />
      ))}

      {content && (
        <div className="prose prose-sm prose-invert max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }) {
                const isBlock = !props.ref;
                if (isBlock && className) {
                  return <CodeBlock className={className}>{children}</CodeBlock>;
                }
                return (
                  <code
                    className="rounded bg-muted/60 px-1 py-0.5 text-sm font-mono"
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
              pre({ children }) {
                return <>{children}</>;
              },
              a({ href, children }) {
                return (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    {children}
                  </a>
                );
              },
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}

      {isStreaming && !content && !toolCalls.length && (
        <span className="inline-block w-2 h-4 bg-foreground/70 animate-pulse rounded-sm" />
      )}
    </div>
  );
}
