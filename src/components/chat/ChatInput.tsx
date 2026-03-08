"use client";

import {
  useState,
  useRef,
  useCallback,
  type KeyboardEvent,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Square, Paperclip, X, Youtube, Globe, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { YouTubeDialog } from "./YouTubeDialog";
import { WebpageDialog } from "./WebpageDialog";

interface TranscriptAttachment {
  videoId: string;
  transcript: string;
}

interface WebpageAttachment {
  url: string;
  title: string;
  content: string;
}

interface ChatInputProps {
  onSend: (content: string, images: string[], transcripts?: TranscriptAttachment[], webpages?: WebpageAttachment[], memoryEnabled?: boolean) => void;
  onCancel: () => void;
  isGenerating: boolean;
  disabled?: boolean;
}

function imageFileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ChatInput({ onSend, onCancel, isGenerating, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptAttachment[]>([]);
  const [webpages, setWebpages] = useState<WebpageAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [youtubeOpen, setYoutubeOpen] = useState(false);
  const [webpageOpen, setWebpageOpen] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addImages = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    const encoded = await Promise.all(imageFiles.map(imageFileToBase64));
    setImages((prev) => [...prev, ...encoded]);
  }, []);

  const addTranscript = useCallback((transcript: string, videoId: string) => {
    setTranscripts((prev) => [...prev, { videoId, transcript }]);
  }, []);

  const removeTranscript = useCallback((index: number) => {
    setTranscripts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addWebpage = useCallback((content: string, title: string, url: string) => {
    setWebpages((prev) => [...prev, { url, title, content }]);
  }, []);

  const removeWebpage = useCallback((index: number) => {
    setWebpages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSend = useCallback(() => {
    const content = value.trim();
    if (!content && images.length === 0 && transcripts.length === 0 && webpages.length === 0) return;
    if (isGenerating) return;
    onSend(
      content,
      images,
      transcripts.length > 0 ? transcripts : undefined,
      webpages.length > 0 ? webpages : undefined,
      memoryEnabled,
    );
    setValue("");
    setImages([]);
    setTranscripts([]);
    setWebpages([]);
    textareaRef.current?.focus();
  }, [value, images, transcripts, webpages, isGenerating, onSend, memoryEnabled]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      await addImages(files);
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    await addImages(files);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    await addImages(files);
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div
      className={cn(
        "border-t border-border bg-background/95 backdrop-blur",
        isDragging && "ring-2 ring-primary ring-inset"
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-2 px-4 pt-3 flex-wrap">
          {images.map((img, i) => (
            <div key={i} className="relative group">
              <img
                src={img}
                alt={`attachment ${i + 1}`}
                className="h-16 w-16 object-cover rounded-md border border-border/60"
              />
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Transcript previews */}
      {transcripts.length > 0 && (
        <div className="flex gap-2 px-4 pt-3 flex-wrap">
          {transcripts.map((t, i) => (
            <div
              key={i}
              className="relative group flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 text-xs"
            >
              <Youtube className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
              <span className="truncate max-w-[140px]">{t.videoId}</span>
              <button
                onClick={() => removeTranscript(i)}
                className="ml-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Webpage previews */}
      {webpages.length > 0 && (
        <div className="flex gap-2 px-4 pt-3 flex-wrap">
          {webpages.map((w, i) => (
            <div
              key={i}
              className="relative group flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 text-xs"
            >
              <Globe className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
              <span className="truncate max-w-[160px]">{w.title}</span>
              <button
                onClick={() => removeWebpage(i)}
                className="ml-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 px-4 py-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 flex-shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 flex-shrink-0"
          onClick={() => setYoutubeOpen(true)}
          disabled={disabled}
          title="Add YouTube transcript"
        >
          <Youtube className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 flex-shrink-0"
          onClick={() => setWebpageOpen(true)}
          disabled={disabled}
          title="Add webpage"
        >
          <Globe className="h-4 w-4" />
        </Button>

        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={disabled ? "Select a model to start chatting..." : "Type a message... (Enter to send, Shift+Enter for newline)"}
          disabled={disabled}
          rows={1}
          className={cn(
            "flex-1 resize-none min-h-[36px] max-h-[200px] bg-muted/30 border-border/60",
            "scrollbar-thin"
          )}
          style={{
            height: "auto",
            overflowY: value.split("\n").length > 5 ? "auto" : "hidden",
          }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
          }}
        />

        <Button
          variant="ghost"
          size="icon"
          className={cn("h-9 w-9 flex-shrink-0", memoryEnabled ? "text-primary" : "text-muted-foreground")}
          onClick={() => setMemoryEnabled((v) => !v)}
          disabled={disabled}
          title={memoryEnabled ? "Memory recall enabled" : "Memory recall disabled"}
        >
          <Brain className="h-4 w-4" />
        </Button>

        {isGenerating ? (
          <Button
            variant="destructive"
            size="icon"
            className="h-9 w-9 flex-shrink-0"
            onClick={onCancel}
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="h-9 w-9 flex-shrink-0"
            onClick={handleSend}
            disabled={disabled || (!value.trim() && images.length === 0 && transcripts.length === 0 && webpages.length === 0)}
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>

      <YouTubeDialog
        open={youtubeOpen}
        onOpenChange={setYoutubeOpen}
        onTranscriptLoaded={addTranscript}
      />

      <WebpageDialog
        open={webpageOpen}
        onOpenChange={setWebpageOpen}
        onPageLoaded={addWebpage}
      />
    </div>
  );
}

export type { TranscriptAttachment, WebpageAttachment };
