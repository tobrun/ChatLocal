import { vllmBaseURL } from "./client";
import type { VllmModel } from "@/types";

export interface HealthStatus {
  status: "ok" | "down";
  model?: string;
  maxModelLen?: number;
  models?: VllmModel[];
}

export async function checkHealth(): Promise<HealthStatus> {
  try {
    const res = await fetch(`${vllmBaseURL}/v1/models`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { status: "down" };
    const data = await res.json();
    const models: VllmModel[] = data.data ?? [];
    const first = models[0];
    return {
      status: "ok",
      model: first?.id,
      maxModelLen: (first as { max_model_len?: number })?.max_model_len,
      models,
    };
  } catch {
    return { status: "down" };
  }
}

export async function listModels(): Promise<VllmModel[]> {
  try {
    const res = await fetch(`${vllmBaseURL}/v1/models`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.data ?? [];
  } catch {
    return [];
  }
}
