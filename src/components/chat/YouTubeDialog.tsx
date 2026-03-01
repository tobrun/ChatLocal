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

interface YouTubeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTranscriptLoaded: (transcript: string, videoId: string) => void;
}

export function YouTubeDialog({
  open,
  onOpenChange,
  onTranscriptLoaded,
}: YouTubeDialogProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/youtube/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to fetch transcript");
        return;
      }

      onTranscriptLoaded(data.transcript, data.videoId);
      setUrl("");
      setError(null);
      onOpenChange(false);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, [url, onTranscriptLoaded, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add YouTube Transcript</DialogTitle>
          <DialogDescription>
            Paste a YouTube URL to pull in the video transcript as context.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="https://www.youtube.com/watch?v=..."
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
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!url.trim() || loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Fetching...
              </>
            ) : (
              "Add Transcript"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
