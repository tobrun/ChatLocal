"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Brain, Search, Upload, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MemoryCard } from "@/components/memories/MemoryCard";
import type { Memory } from "@/lib/db/memory";

interface HealthData {
  healthy: boolean;
  lastHeartbeat: string | null;
  lastConsolidation: string | null;
  memoryCount: number;
  pendingCount: number;
  status: string;
}

interface MemoriesResponse {
  memories: Memory[];
  total: number;
}

const PAGE_SIZE = 20;

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);

  const [manualText, setManualText] = useState("");
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSuccess, setManualSuccess] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const debouncedSearch = useDebounce(search, 300);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/memory/health");
      const data: HealthData = await res.json();
      setHealth(data);
    } catch {
      // health unavailable
    }
  }, []);

  const fetchMemories = useCallback(async (q: string, p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/memories?${params}`);
      const data: MemoriesResponse = await res.json();
      setMemories(data.memories ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  useEffect(() => {
    setPage(1);
    fetchMemories(debouncedSearch, 1);
  }, [debouncedSearch, fetchMemories]);

  useEffect(() => {
    fetchMemories(debouncedSearch, page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = useCallback(async (id: number) => {
    try {
      await fetch(`/api/memories/${id}`, { method: "DELETE" });
      setMemories((prev) => prev.filter((m) => m.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch {
      // ignore
    }
  }, []);

  const handleScrollTo = useCallback((id: number) => {
    const el = document.getElementById(`memory-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "ring-offset-2");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-2"), 2000);
    }
  }, []);

  const handleManualSave = async () => {
    if (!manualText.trim()) return;
    setManualSaving(true);
    setManualError(null);
    setManualSuccess(false);
    try {
      const res = await fetch("/api/memories/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: manualText }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setManualText("");
      setManualSuccess(true);
      setTimeout(() => setManualSuccess(false), 3000);
    } catch (err) {
      setManualError(err instanceof Error ? err.message : String(err));
    } finally {
      setManualSaving(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/memories/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Memories</h1>
            {health && (
              <Badge variant="outline" className="text-xs">
                {health.memoryCount} stored
              </Badge>
            )}
          </div>
          {health && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className={cn("w-2 h-2 rounded-full", health.healthy ? "bg-green-500" : "bg-destructive")} />
              <span>{health.healthy ? "Sidecar online" : "Sidecar offline"}</span>
              {health.lastConsolidation && (
                <span className="hidden sm:inline">
                  · Last consolidation: {new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(health.lastConsolidation))}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Add memory */}
        <div className="rounded-lg border border-border/50 bg-muted/10 p-4 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Add to memory</h2>
          <Textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="Type something to remember..."
            rows={3}
            className="resize-none bg-muted/20 border-border/60 text-sm"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleManualSave}
              disabled={manualSaving || !manualText.trim()}
              className="gap-1.5"
            >
              {manualSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="gap-1.5"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Upload file
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = "";
              }}
            />
            {manualSuccess && <span className="text-xs text-green-500">Queued for processing</span>}
            {uploadSuccess && <span className="text-xs text-green-500">File queued for processing</span>}
            {manualError && <span className="text-xs text-destructive">{manualError}</span>}
            {uploadError && <span className="text-xs text-destructive">{uploadError}</span>}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories..."
            className="pl-9"
          />
          {total > 0 && (
            <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">
              {total} result{total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Memory list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2">
            <Brain className="h-8 w-8 opacity-30" />
            <p>{search ? "No memories matched your search" : "No memories stored yet"}</p>
            {!search && <p className="text-xs">Start chatting — memories will appear here automatically</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {memories.map((m) => (
              <MemoryCard
                key={m.id}
                memory={m}
                onDelete={handleDelete}
                onScrollTo={handleScrollTo}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
