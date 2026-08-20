"use client";

import { useEffect, useState } from "react";

export type ConnectionQuality = "offline" | "slow" | "good" | "unknown";
export interface OfflineStatus { isOnline: boolean; quality: ConnectionQuality; offlineSince?: number; }

function readStatus(): OfflineStatus {
  if (typeof navigator === "undefined") return { isOnline: true, quality: "unknown" };
  const isOnline = navigator.onLine;
  const effectiveType = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;
  return { isOnline, quality: !isOnline ? "offline" : effectiveType === "2g" || effectiveType === "slow-2g" ? "slow" : effectiveType ? "good" : "unknown" };
}

export function useOfflineStatus(): OfflineStatus {
  const [status, setStatus] = useState<OfflineStatus>(readStatus);
  useEffect(() => {
    const update = () => setStatus((previous) => {
      const next = readStatus();
      return next.isOnline ? next : { ...next, offlineSince: previous.isOnline ? Date.now() : previous.offlineSince };
    });
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const connection = (navigator as Navigator & { connection?: EventTarget }).connection;
    connection?.addEventListener("change", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); connection?.removeEventListener("change", update); };
  }, []);
  return status;
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  return navigator.storage.persist();
}