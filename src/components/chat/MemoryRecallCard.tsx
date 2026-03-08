"use client";

import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Brain, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MemoryItem } from "@/types";

interface MemoryRecallCardProps {
  query: string;
  memories: MemoryItem[];
  done: boolean;
}

function importanceColor(importance: number): string {
  if (importance >= 0.7) return "border-l-green-500";
  if (importance >= 0.4) return "border-l-yellow-500";
  return "border-l-muted-foreground/40";
}

export function MemoryRecallCard({ query, memories, done }: MemoryRecallCardProps) {
  const [open, setOpen] = useState(false);

  const statusIcon = done ? (
    <Brain className="h-3.5 w-3.5 text-primary" />
  ) : (
    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
  );

  const label = done
    ? memories.length > 0
      ? `${memories.length} memor${memories.length === 1 ? "y" : "ies"} recalled`
      : "No relevant memories found"
    : `Searching memories for: "${query}"`;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="my-2">
      <CollapsibleTrigger className="flex items-center gap-2 w-full rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-sm hover:bg-muted/40 transition-colors">
        {statusIcon}
        <span className="font-mono text-xs flex-1 text-left text-muted-foreground">{label}</span>
        {done && (
          open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )
        )}
      </CollapsibleTrigger>

      {done && (
        <CollapsibleContent>
          <div className="mt-1 rounded-b-md border border-t-0 border-border/50 bg-muted/10 p-3 space-y-2 text-xs">
            {memories.length === 0 ? (
              <p className="text-muted-foreground">No memories matched the search query.</p>
            ) : (
              memories.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "border-l-2 pl-2 py-1 space-y-1",
                    importanceColor(m.importance)
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">#{m.id}</span>
                    <Badge variant="outline" className="text-xs h-4 font-normal">
                      {m.importance.toFixed(2)}
                    </Badge>
                    {m.topics.slice(0, 3).map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs h-4 font-normal">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-foreground/80 leading-snug">{m.summary}</p>
                </div>
              ))
            )}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
