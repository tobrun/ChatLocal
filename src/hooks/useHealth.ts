"use client";

import { useEffect, useState } from "react";
import { useSocket } from "./useSocket";
import type { VllmStatusEvent } from "@/types";

export interface HealthState {
  status: "ok" | "down" | "unknown";
  model?: string;
}

export function useHealth(): HealthState {
  const [health, setHealth] = useState<HealthState>({ status: "unknown" });
  const socket = useSocket();

  useEffect(() => {
    const handler = (event: VllmStatusEvent) => {
      setHealth({ status: event.status, model: event.model });
    };
    socket.on("vllm_status", handler);

    // Also poll directly for immediate feedback
    fetch("/api/health")
      .then((r) => r.json())
      .then((data: { status: "ok" | "down"; model?: string }) => {
        setHealth({ status: data.status, model: data.model });
      })
      .catch(() => setHealth({ status: "down" }));

    return () => {
      socket.off("vllm_status", handler);
    };
  }, [socket]);

  return health;
}
