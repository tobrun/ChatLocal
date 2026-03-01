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
import { Send, Square, Paperclip, X, Film } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (content: string, images: string[], videos: string[]) => void;
  onCancel: () => void;
  isGenerating: boolean;
  disabled?: boolean;
}

function fileToBase64(file: File): Promise<string> {
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
  const [videos, setVideos] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addMediaFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    const videoFiles = files.filter((f) => f.type.startsWith("video/"));
    if (imageFiles.length > 0) {
      const encoded = await Promise.all(imageFiles.map(fileToBase64));
      setImages((prev) => [...prev, ...encoded]);
    }
    if (videoFiles.length > 0) {
      const encoded = await Promise.all(videoFiles.map(fileToBase64));
      setVideos((prev) => [...prev, ...encoded]);
    }
  }, []);

  const handleSend = useCallback(() => {
    const content = value.trim();
    if (!content && images.length === 0 && videos.length === 0) return;
    if (isGenerating) return;
    onSend(content, images, videos);
    setValue("");
    setImages([]);
    setVideos([]);
    textareaRef.current?.focus();
  }, [value, images, videos, isGenerating, onSend]);

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
      await addMediaFiles(files);
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    await addMediaFiles(files);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    await addMediaFiles(files);
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const removeVideo = (index: number) => {
    setVideos((prev) => prev.filter((_, i) => i !== index));
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
      {/* Media previews */}
      {(images.length > 0 || videos.length > 0) && (
        <div className="flex gap-2 px-4 pt-3 flex-wrap">
          {images.map((img, i) => (
            <div key={`img-${i}`} className="relative group">
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
          {videos.map((vid, i) => (
            <div key={`vid-${i}`} className="relative group">
              <div className="h-16 w-24 rounded-md border border-border/60 overflow-hidden bg-black/50 flex items-center justify-center">
                <video
                  src={vid}
                  className="h-full w-full object-cover"
                  muted
                />
                <Film className="h-5 w-5 text-white/80 absolute" />
              </div>
              <button
                onClick={() => removeVideo(i)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
          accept="image/*,video/*"
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
            disabled={disabled || (!value.trim() && images.length === 0 && videos.length === 0)}
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
