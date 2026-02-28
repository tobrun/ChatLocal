"use client";

import { useState, useEffect } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThinkingBlockProps {
  content: string;
  isStreaming?: boolean;
}

export function ThinkingBlock({ content, isStreaming }: ThinkingBlockProps) {
  // Auto-open while streaming so the user can watch reasoning live
  const [open, setOpen] = useState(!!isStreaming);

  useEffect(() => {
    if (isStreaming) {
      setOpen(true);
    } else {
      // Collapse when streaming finishes
      setOpen(false);
    }
  }, [isStreaming]);

  // Strip raw <think> / </think> tags that may appear during streaming
  const displayContent = content
    .replace(/^<think>\s?/, "")
    .replace(/\s?<\/think>$/, "")
    .trim();

  if (!displayContent) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-3">
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <Brain className="h-3.5 w-3.5" />
        <span>Reasoning</span>
        {isStreaming && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse ml-0.5" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          className={cn(
            "mt-2 rounded-md border border-border/50 bg-muted/30 p-3",
            "text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed"
          )}
        >
          {displayContent}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
