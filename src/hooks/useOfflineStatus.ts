"use client";

import { useEffect, useState } from "react";

export type ConnectionQuality = "offline" | "poor" | "fair" | "good" | "unknown";

function quality(): ConnectionQuality {
  if (typeof navigator === "undefined" || !navigator.onLine) return "offline";
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number } }).connection;
  if (!connection) return "unknown";
  if (connection.effectiveType === "slow-2g" || connection.effectiveType === "2g" || (connection.downlink ?? 10) < 0.5) return "poor";
  if (connection.effectiveType === "3g" || (connection.downlink ?? 10) < 2) return "fair";
  return "good";
}

export function useOfflineStatus() {
  const [state, setState] = useState({ isOnline: typeof navigator !== "undefined" ? navigator.onLine : true, quality: quality() });

  useEffect(() => {
    const update = () => setState({ isOnline: navigator.onLine, quality: quality() });
    const connection = (navigator as Navigator & { connection?: EventTarget }).connection;
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    connection?.addEventListener("change", update);
    update();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      connection?.removeEventListener("change", update);
    };
  }, []);

  return state;
}
