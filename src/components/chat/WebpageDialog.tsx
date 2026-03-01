"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface WebpageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPageLoaded: (content: string, title: string, url: string) => void;
}

export function WebpageDialog({
  open,
  onOpenChange,
  onPageLoaded,
}: WebpageDialogProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/webpage/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to extract page content");
        return;
      }

      onPageLoaded(data.content, data.title, data.url);
      setUrl("");
      setError(null);
      onOpenChange(false);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, [url, onPageLoaded, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Webpage</DialogTitle>
          <DialogDescription>
            Paste a URL to extract the page content as context.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) handleSubmit();
            }}
            disabled={loading}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!url.trim() || loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Fetching...
              </>
            ) : (
              "Add Page"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
