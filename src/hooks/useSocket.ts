"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

let sharedSocket: Socket | null = null;

export function useSocket(): Socket {
  const socketRef = useRef<Socket | null>(null);

  if (!sharedSocket) {
    sharedSocket = io({ path: "/socket.io", transports: ["websocket"] });
  }
  socketRef.current = sharedSocket;

  useEffect(() => {
    return () => {
      // Don't disconnect on unmount — keep connection alive across navigation
    };
  }, []);

  return socketRef.current;
}
