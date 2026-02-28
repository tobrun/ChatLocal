"use client";

import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Wrench, Loader2, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolCallCardProps {
  toolName: string;
  args: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  done: boolean;
}

export function ToolCallCard({ toolName, args, result, isError, done }: ToolCallCardProps) {
  const [open, setOpen] = useState(false);

  const statusIcon = done ? (
    isError ? (
      <XCircle className="h-3.5 w-3.5 text-destructive" />
    ) : (
      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
    )
  ) : (
    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="my-2">
      <CollapsibleTrigger className="flex items-center gap-2 w-full rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-sm hover:bg-muted/40 transition-colors">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="font-mono text-xs flex-1 text-left">{toolName}</span>
        {statusIcon}
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 rounded-b-md border border-t-0 border-border/50 bg-muted/10 p-3 space-y-2 text-xs">
          <div>
            <div className="flex items-center gap-1 mb-1 text-muted-foreground">
              <Badge variant="outline" className="text-xs h-4">Input</Badge>
            </div>
            <pre className="overflow-x-auto text-foreground/80 font-mono text-xs whitespace-pre-wrap">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
          {done && result && (
            <div>
              <div className="flex items-center gap-1 mb-1 text-muted-foreground">
                <Badge
                  variant="outline"
                  className={cn("text-xs h-4", isError && "border-destructive text-destructive")}
                >
                  {isError ? "Error" : "Output"}
                </Badge>
              </div>
              <pre className={cn(
                "overflow-x-auto font-mono text-xs whitespace-pre-wrap",
                isError ? "text-destructive" : "text-foreground/80"
              )}>
                {result}
              </pre>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
