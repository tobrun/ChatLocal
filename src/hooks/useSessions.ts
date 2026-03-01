"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { useSocket } from "@/hooks/useSocket";
import type { SessionSummary } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useSessions() {
  const socket = useSocket();
  const { data, error, isLoading, mutate } = useSWR<SessionSummary[]>(
    "/api/sessions",
    fetcher,
    { refreshInterval: 5000 }
  );

  useEffect(() => {
    const handler = ({
      sessionId,
      title,
    }: {
      sessionId: string;
      title: string;
    }) => {
      mutate(
        (current) =>
          current?.map((s) => (s.id === sessionId ? { ...s, title } : s)),
        { revalidate: false }
      );
    };

    socket.on("session_renamed", handler);
    return () => {
      socket.off("session_renamed", handler);
    };
  }, [socket, mutate]);

  return {
    sessions: data ?? [],
    isLoading,
    error,
    refresh: mutate,
  };
}
