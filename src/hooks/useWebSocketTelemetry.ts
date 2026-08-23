"use client";

/**
 * WebSocket telemetry connection backed by the time-batched
 * `TelemetryBuffer`.
 *
 * Incoming frames (up to ~200/sec) are pushed into the buffer instead of
 * calling `setState` per frame; the component re-renders once per flush
 * batch (~450ms cadence), which keeps React renders at or below 3/sec.
 *
 * The hook owns its buffer, exposes connection status for the UI, and
 * tears everything down on unmount. An external buffer can be injected
 * via `options.buffer` (used by tests to control the flush cadence).
 */

import { useEffect, useState } from "react";
import {
  TelemetryBuffer,
  type TelemetryPoint,
} from "@/src/utils/telemetryBuffer";

export type TelemetryStatus =
  | "idle"
  | "connecting"
  | "live"
  | "reconnecting"
  | "closed"
  | "error";

export interface UseWebSocketTelemetryOptions {
  /** WebSocket endpoint streaming telemetry frames. */
  url: string;
  /** Inject a pre-configured buffer (tests). Defaults to a new instance. */
  buffer?: TelemetryBuffer;
  /** Reconnect delay base in ms. Default 1000. */
  reconnectDelayMs?: number;
}

export interface UseWebSocketTelemetryReturn {
  status: TelemetryStatus;
  /** Archived sliding-window points, updated once per flush batch. */
  points: readonly TelemetryPoint[];
  /** Frames evicted from the window so far (memory bound). */
  droppedFrames: number;
  /** Timestamp of the last applied flush batch (0 before the first). */
  lastBatchAt: number;
}

const MAX_RECONNECT_ATTEMPTS = 5;

export function useWebSocketTelemetry(
  options: UseWebSocketTelemetryOptions,
): UseWebSocketTelemetryReturn {
  const { url, reconnectDelayMs = 1000 } = options;

  // One stable buffer per hook instance (or the injected one), created
  // once via lazy initial state so subscribers survive re-renders.
  const [buffer] = useState<TelemetryBuffer>(() =>
    options.buffer ? options.buffer : new TelemetryBuffer(),
  );

  const [status, setStatus] = useState<TelemetryStatus>("idle");
  const [points, setPoints] = useState<readonly TelemetryPoint[]>([]);
  const [droppedFrames, setDroppedFrames] = useState(0);
  const [lastBatchAt, setLastBatchAt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    // Single subscriber: one setState per flush batch instead of one per
    // incoming frame.
    const unsubscribe = buffer.subscribe((batch) => {
      if (disposed || batch.length === 0) return;
      const snapshot = buffer.getSnapshot();
      setPoints(snapshot);
      setLastBatchAt(batch[batch.length - 1].timestamp);
      setDroppedFrames(buffer.droppedFrames);
    });

    function connect(): void {
      if (disposed) return;
      setStatus(attempts === 0 ? "connecting" : "reconnecting");

      socket = new WebSocket(url);

      socket.onopen = () => {
        attempts = 0;
        if (!disposed) setStatus("live");
      };

      socket.onmessage = (event: MessageEvent) => {
        if (disposed) return;
        try {
          const parsed = JSON.parse(
            typeof event.data === "string" ? event.data : "",
          ) as Partial<TelemetryPoint>;
          if (
            typeof parsed.metric === "string" &&
            typeof parsed.value === "number" &&
            typeof parsed.timestamp === "number"
          ) {
            buffer.push({
              metric: parsed.metric,
              value: parsed.value,
              timestamp: parsed.timestamp,
            });
          }
        } catch {
          // Malformed frame: ignore rather than break the stream.
        }
      };

      socket.onerror = () => {
        if (!disposed) setStatus("error");
      };

      socket.onclose = () => {
        if (disposed) return;
        if (attempts < MAX_RECONNECT_ATTEMPTS) {
          attempts++;
          const backoff = reconnectDelayMs * 2 ** (attempts - 1);
          reconnectTimer = setTimeout(connect, backoff);
        } else {
          setStatus("closed");
        }
      };
    }

    connect();

    return () => {
      disposed = true;
      unsubscribe();
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
    };
  }, [url, reconnectDelayMs, buffer]);

  return { status, points, droppedFrames, lastBatchAt };
}
