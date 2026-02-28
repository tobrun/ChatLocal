"use client";

import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThinkingBlockProps {
  content: string;
}

export function ThinkingBlock({ content }: ThinkingBlockProps) {
  const [open, setOpen] = useState(false);

  if (!content) return null;

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
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          className={cn(
            "mt-2 rounded-md border border-border/50 bg-muted/30 p-3",
            "text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed"
          )}
        >
          {content}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
