"use client";

import { useHealth } from "@/hooks/useHealth";

export function HealthBanner() {
  const health = useHealth();

  if (health.status !== "down") return null;

  return (
    <div className="w-full bg-destructive/20 border-b border-destructive/30 text-destructive px-4 py-2 text-sm text-center">
      Model server unreachable — check that vLLM is running
    </div>
  );
}
