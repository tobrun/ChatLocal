"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Memory } from "@/lib/db/memory";

interface MemoryCardProps {
  memory: Memory;
  onDelete: (id: number) => void;
  onScrollTo: (id: number) => void;
}

function importanceBorderColor(importance: number): string {
  if (importance >= 0.7) return "border-l-green-500";
  if (importance >= 0.4) return "border-l-yellow-500";
  return "border-l-muted-foreground/30";
}

function importanceBadgeClass(importance: number): string {
  if (importance >= 0.7) return "border-green-500/50 text-green-500";
  if (importance >= 0.4) return "border-yellow-500/50 text-yellow-500";
  return "border-muted-foreground/40 text-muted-foreground";
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function MemoryCard({ memory, onDelete, onScrollTo }: MemoryCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(memory.id);
  };

  return (
    <div
      id={`memory-${memory.id}`}
      className={cn(
        "rounded-lg border border-border/50 bg-muted/10 p-4 border-l-4 space-y-2.5 transition-colors",
        importanceBorderColor(memory.importance)
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-mono">#{memory.id}</span>
          <Badge
            variant="outline"
            className={cn("text-xs h-5 font-normal", importanceBadgeClass(memory.importance))}
          >
            {memory.importance.toFixed(2)}
          </Badge>
          {memory.consolidated === 1 && (
            <Badge variant="outline" className="text-xs h-5 font-normal border-primary/40 text-primary/70">
              consolidated
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">{formatDate(memory.created_at)}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-7 w-7 flex-shrink-0",
            confirmDelete ? "text-destructive hover:text-destructive" : "text-muted-foreground"
          )}
          onClick={handleDelete}
          onBlur={() => setConfirmDelete(false)}
          title={confirmDelete ? "Click again to confirm deletion" : "Delete memory"}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Summary */}
      <p className="text-sm leading-relaxed">{memory.summary}</p>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {memory.topics.map((t) => (
          <Badge key={t} variant="secondary" className="text-xs h-5 font-normal bg-purple-500/10 text-purple-400 border-purple-500/20">
            {t}
          </Badge>
        ))}
        {memory.entities.slice(0, 5).map((e) => (
          <Badge key={e} variant="secondary" className="text-xs h-5 font-normal bg-blue-500/10 text-blue-400 border-blue-500/20">
            {e}
          </Badge>
        ))}
      </div>

      {/* Connections */}
      {memory.connections.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <span className="text-xs text-muted-foreground">Links:</span>
          {memory.connections.map((c) => (
            <button
              key={c.linked_to}
              onClick={() => onScrollTo(c.linked_to)}
              className="text-xs text-primary/70 hover:text-primary underline underline-offset-2 transition-colors"
              title={`Navigate to memory #${c.linked_to}`}
            >
              #{c.linked_to} ({c.relationship})
            </button>
          ))}
        </div>
      )}

      {confirmDelete && (
        <p className="text-xs text-destructive">Click delete again to confirm.</p>
      )}
    </div>
  );
}
