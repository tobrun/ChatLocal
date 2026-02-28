"use client";

import { useEffect, useState } from "react";
import { useSettingsStore } from "@/stores/settings";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { useHealth } from "@/hooks/useHealth";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import useSWR from "swr";
import type { VllmModel } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function SettingsForm() {
  const { settings, loaded, fetchSettings, updateSettings } = useSettingsStore();
  const health = useHealth();
  const { data: models = [] } = useSWR<VllmModel[]>("/api/models", fetcher, {
    refreshInterval: 10000,
  });

  const [localSettings, setLocalSettings] = useState(settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loaded) fetchSettings();
  }, [loaded, fetchSettings]);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = async () => {
    await updateSettings(localSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure your ChatLocal instance</p>
      </div>

      {/* vLLM Status */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Model Server
        </h2>
        <div className="rounded-md border border-border/60 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">Status:</span>
            <Badge
              variant="outline"
              className={
                health.status === "ok"
                  ? "border-green-500/50 text-green-500"
                  : health.status === "down"
                  ? "border-destructive/50 text-destructive"
                  : "border-muted text-muted-foreground"
              }
            >
              {health.status === "ok" ? "Connected" : health.status === "down" ? "Disconnected" : "Checking..."}
            </Badge>
          </div>
          {health.model && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Model:</span>{" "}
              <span className="font-mono text-xs">{health.model}</span>
            </div>
          )}
          {models.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Available models:</p>
              {models.map((m) => (
                <p key={m.id} className="text-xs font-mono text-muted-foreground truncate">
                  {m.id}
                </p>
              ))}
            </div>
          )}
        </div>
      </section>

      <Separator />

      {/* System Prompt */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          System Prompt
        </h2>
        <Textarea
          value={localSettings.systemPrompt}
          onChange={(e) => setLocalSettings((p) => ({ ...p, systemPrompt: e.target.value }))}
          placeholder="You are a helpful assistant."
          rows={5}
          className="font-mono text-sm bg-muted/20"
        />
      </section>

      <Separator />

      {/* Model Parameters */}
      <section className="space-y-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Model Parameters
        </h2>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <label>Temperature</label>
            <span className="text-muted-foreground font-mono">{localSettings.temperature.toFixed(2)}</span>
          </div>
          <Slider
            min={0}
            max={2}
            step={0.05}
            value={[localSettings.temperature]}
            onValueChange={([v]) => setLocalSettings((p) => ({ ...p, temperature: v }))}
          />
          <p className="text-xs text-muted-foreground">Controls randomness. Lower = more focused, higher = more creative.</p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <label>Top P</label>
            <span className="text-muted-foreground font-mono">{localSettings.topP.toFixed(2)}</span>
          </div>
          <Slider
            min={0.01}
            max={1}
            step={0.01}
            value={[localSettings.topP]}
            onValueChange={([v]) => setLocalSettings((p) => ({ ...p, topP: v }))}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm">Max Tokens</label>
          <Input
            type="number"
            min={64}
            max={32768}
            value={localSettings.maxTokens}
            onChange={(e) => setLocalSettings((p) => ({ ...p, maxTokens: parseInt(e.target.value) || 2048 }))}
            className="w-32 font-mono"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <label>Context Compression Threshold</label>
            <span className="text-muted-foreground font-mono">{Math.round(localSettings.contextThreshold * 100)}%</span>
          </div>
          <Slider
            min={0.5}
            max={0.95}
            step={0.05}
            value={[localSettings.contextThreshold]}
            onValueChange={([v]) => setLocalSettings((p) => ({ ...p, contextThreshold: v }))}
          />
          <p className="text-xs text-muted-foreground">When context exceeds this % of max length, older messages are summarized.</p>
        </div>
      </section>

      <div className="pt-2">
        <Button onClick={handleSave} className="gap-2">
          {saved ? "Saved!" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
