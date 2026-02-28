"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Pencil, Trash2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionSummary } from "@/types";
import { useState } from "react";
import { Input } from "@/components/ui/input";

interface SessionItemProps {
  session: SessionSummary;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export function SessionItem({ session, onDelete, onRename }: SessionItemProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = pathname === `/chat/${session.id}`;
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);

  const handleRename = () => {
    if (editTitle.trim() && editTitle !== session.title) {
      onRename(session.id, editTitle.trim());
    }
    setEditing(false);
  };

  const handleExport = () => {
    window.location.href = `/api/sessions/${session.id}/export`;
  };

  const handleDelete = () => {
    onDelete(session.id);
    if (isActive) router.push("/chat");
  };

  const modelName = session.modelId.split("/").pop() ?? session.modelId;

  if (editing) {
    return (
      <div className="px-2 py-1">
        <Input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRename();
            if (e.key === "Escape") { setEditTitle(session.title); setEditing(false); }
          }}
          className="h-7 text-sm"
          autoFocus
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent/50 transition-colors",
        isActive && "bg-accent text-accent-foreground"
      )}
    >
      <Link href={`/chat/${session.id}`} className="flex-1 min-w-0">
        <div className="truncate font-medium">{session.title}</div>
        <div className="truncate text-xs text-muted-foreground">{modelName}</div>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 flex-shrink-0"
            onClick={(e) => e.preventDefault()}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => { setEditTitle(session.title); setEditing(true); }}>
            <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExport}>
            <Download className="mr-2 h-3.5 w-3.5" /> Export
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={handleDelete}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
