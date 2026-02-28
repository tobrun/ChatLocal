"use client";

import useSWR from "swr";
import type { SessionSummary } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useSessions() {
  const { data, error, isLoading, mutate } = useSWR<SessionSummary[]>(
    "/api/sessions",
    fetcher,
    { refreshInterval: 5000 }
  );

  return {
    sessions: data ?? [],
    isLoading,
    error,
    refresh: mutate,
  };
}
