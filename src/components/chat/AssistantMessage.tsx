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

function fallbackCopy(text: string, done: () => void) {
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
  done();
}

function CodeBlock({ children, className }: { children?: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const code = String(children ?? "").trimEnd();
  const language = className?.replace("language-", "") ?? "";

  const copy = useCallback(() => {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(done).catch(() => fallbackCopy(code, done));
    } else {
      fallbackCopy(code, done);
    }
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
      {thinking && <ThinkingBlock content={thinking} isStreaming={isStreaming} />}

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
        <div className="text-sm leading-relaxed space-y-3">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1({ children }) {
                return <h1 className="text-2xl font-bold mt-4 mb-2">{children}</h1>;
              },
              h2({ children }) {
                return <h2 className="text-xl font-bold mt-4 mb-2">{children}</h2>;
              },
              h3({ children }) {
                return <h3 className="text-lg font-semibold mt-3 mb-1">{children}</h3>;
              },
              h4({ children }) {
                return <h4 className="text-base font-semibold mt-3 mb-1">{children}</h4>;
              },
              p({ children }) {
                return <p className="leading-relaxed">{children}</p>;
              },
              strong({ children }) {
                return <strong className="font-semibold text-foreground">{children}</strong>;
              },
              em({ children }) {
                return <em className="italic text-foreground/90">{children}</em>;
              },
              ul({ children }) {
                return <ul className="list-disc pl-5 space-y-1">{children}</ul>;
              },
              ol({ children }) {
                return <ol className="list-decimal pl-5 space-y-1">{children}</ol>;
              },
              li({ children }) {
                return <li className="leading-relaxed">{children}</li>;
              },
              blockquote({ children }) {
                return (
                  <blockquote className="border-l-2 border-border pl-3 text-muted-foreground italic">
                    {children}
                  </blockquote>
                );
              },
              hr() {
                return <hr className="border-border my-3" />;
              },
              table({ children }) {
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">{children}</table>
                  </div>
                );
              },
              th({ children }) {
                return (
                  <th className="border border-border px-3 py-1.5 text-left font-semibold bg-muted/40">
                    {children}
                  </th>
                );
              },
              td({ children }) {
                return <td className="border border-border px-3 py-1.5">{children}</td>;
              },
              code({ className, children, ...props }) {
                const isBlock = !props.ref;
                if (isBlock && className) {
                  return <CodeBlock className={className}>{children}</CodeBlock>;
                }
                return (
                  <code className="rounded bg-muted/60 px-1 py-0.5 text-sm font-mono" {...props}>
                    {children}
                  </code>
                );
              },
              pre({ children }) {
                return <>{children}</>;
              },
              a({ href, children }) {
                return (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">
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
