"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { PlusIcon, SearchIcon, SunIcon, MoonIcon } from "lucide-react";
import { useSessions } from "@/hooks/useSessions";
import { SessionItem } from "@/components/session/SessionItem";
import { useHealth } from "@/hooks/useHealth";
import { useSettingsStore } from "@/stores/settings";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import useSWR from "swr";
import type { VllmModel } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function Sidebar() {
  const router = useRouter();
  const { sessions, refresh } = useSessions();
  const [search, setSearch] = useState("");
  const health = useHealth();
  const { settings, updateSettings } = useSettingsStore();
  const { data: models = [] } = useSWR<VllmModel[]>("/api/models", fetcher, {
    refreshInterval: 15000,
  });

  const defaultModel = models[0]?.id ?? "";

  const handleNewChat = async () => {
    if (!defaultModel) return;
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: defaultModel }),
      });
      const session = await res.json();
      await refresh();
      router.push(`/chat/${session.id}`);
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    refresh();
  };

  const handleRename = async (id: string, title: string) => {
    await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    refresh();
  };

  const filtered = search.trim()
    ? sessions.filter((s) =>
        s.title.toLowerCase().includes(search.toLowerCase())
      )
    : sessions;

  return (
    <div className="flex flex-col h-full w-64 border-r border-border bg-background">
      {/* Header */}
      <div className="p-3 flex items-center gap-2">
        <span className="font-semibold text-sm flex-1">ChatLocal</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`w-2 h-2 rounded-full cursor-default ${
                  health.status === "ok"
                    ? "bg-green-500"
                    : health.status === "down"
                    ? "bg-destructive"
                    : "bg-muted-foreground"
                }`}
              />
            </TooltipTrigger>
            <TooltipContent side="right">
              {health.status === "ok"
                ? `${health.model} — Active`
                : health.status === "down"
                ? "Server unreachable"
                : "Checking..."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="px-2 pb-2">
        <Button
          className="w-full gap-2"
          size="sm"
          onClick={handleNewChat}
          disabled={!defaultModel}
        >
          <PlusIcon className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <Separator />

      {/* Filter by title */}
      <div className="px-2 py-2">
        <div className="relative">
          <SearchIcon className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter sessions..."
            className="pl-7 h-8 text-sm"
          />
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-1">
        <div className="space-y-0.5 py-1">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              {search ? "No matching sessions" : "No sessions yet"}
            </p>
          )}
          {filtered.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          ))}
        </div>
      </div>

      <Separator />

      {/* Footer */}
      <div className="p-2 flex justify-end">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => updateSettings({ theme: settings.theme === "dark" ? "light" : "dark" })}
          title={settings.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {settings.theme === "dark" ? (
            <SunIcon className="h-4 w-4" />
          ) : (
            <MoonIcon className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
