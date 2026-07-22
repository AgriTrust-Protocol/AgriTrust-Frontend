/**
 * WebSocket price feed subscription hook.
 *
 * Subscribes to wss://oracle.agritrust.io/ws/prices and maintains a reactive
 * price map via the signal-based price feed store.  On mount, hydrates from
 * IndexedDB cache first, then connects to WebSocket for live updates.
 *
 * Handles:
 *  - Auto-reconnect with exponential backoff (1s → 30s cap)
 *  - Heartbeat monitoring (20s timeout)
 *  - Staleness detection (60s threshold)
 *  - Offline → cache fallback
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { useOnlineStatus } from "@/src/hooks/useOnlineStatus";
import { useSignal } from "@/src/hooks/useSignal";
import { cachePriceMap, getCachedPriceMap, cacheOHLCBars } from "@/src/services/priceCache";
import { defaultPriceFeedStore } from "@/src/stores/priceFeedStore";
import type {
  PriceFeedWSMessage,
  PriceUpdateMessage,
  OHLCSnapshotMessage,
  ConnectionState,
  PriceMap,
  ChartTimeRange,
  OHLCBar,
  PriceAlert,
} from "@/src/types/prices";

// ── Constants ──────────────────────────────────────────────────────────────

const WS_URL = "wss://oracle.agritrust.io/ws/prices";
const HEARTBEAT_TIMEOUT_MS = 20_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_JITTER_MS = 500;

// ── Hook ───────────────────────────────────────────────────────────────────

export interface UsePriceFeedReturn {
  priceMap: PriceMap;
  connectionState: ConnectionState;
  alerts: PriceAlert[];
  selectPair: (pair: string | null) => void;
  selectedPair: string | null;
  setChartRange: (range: ChartTimeRange) => void;
  chartRange: ChartTimeRange;
  ohlcData: Record<string, OHLCBar[]>;
  reconnect: () => void;
}

export function usePriceFeed(): UsePriceFeedReturn {
  const isOnline = useOnlineStatus();
  const priceMap = useSignal(defaultPriceFeedStore.priceMap$);
  const connectionState = useSignal(defaultPriceFeedStore.connectionState$);
  const alerts = useSignal(defaultPriceFeedStore.alerts$);
  const selectedPair = useSignal(defaultPriceFeedStore.selectedPair$);
  const chartRange = useSignal(defaultPriceFeedStore.chartRange$);
  const ohlcData = useSignal(defaultPriceFeedStore.ohlcData$);

  // ── Refs ───────────────────────────────────────────────────────────────

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const isOnlineRef = useRef(isOnline);

  // Sync refs with latest values in effects (not during render)
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  // ── Heartbeat ──────────────────────────────────────────────────────────

  const resetHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearTimeout(heartbeatTimerRef.current);
    }
    heartbeatTimerRef.current = setTimeout(() => {
      defaultPriceFeedStore.connectionState$.set("error");
      wsRef.current?.close();
    }, HEARTBEAT_TIMEOUT_MS);
  }, []);

  // ── Message handler ────────────────────────────────────────────────────

  const handleMessage = useCallback((event: MessageEvent) => {
    let msg: PriceFeedWSMessage;
    try {
      msg = JSON.parse(event.data as string) as PriceFeedWSMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case "price_update": {
        const update = msg as PriceUpdateMessage;
        const currentMap = defaultPriceFeedStore.priceMap$.get();

        const newMap: PriceMap = { ...currentMap };
        const now = Date.now();
        const lastUpdated: Record<string, number> = {
          ...defaultPriceFeedStore.lastUpdated$.get(),
        };

        for (const [pair, tick] of Object.entries(update.updates)) {
          newMap[pair] = tick;
          lastUpdated[pair] = now;
        }

        defaultPriceFeedStore.priceMap$.set(newMap);
        defaultPriceFeedStore.lastUpdated$.set(lastUpdated);

        cachePriceMap(newMap).catch((err) => {
          console.warn("[usePriceFeed] Failed to cache price map:", err);
        });

        // Check alert thresholds
        const currentAlerts = defaultPriceFeedStore.alerts$.get();
        for (const alert of currentAlerts) {
          if (!alert.enabled || alert.triggered) continue;
          const tick = update.updates[alert.pair];
          if (!tick) continue;

          const currentPrice = parseFloat(tick.price);
          const threshold = parseFloat(alert.threshold);

          const shouldTrigger =
            (alert.direction === "above" && currentPrice > threshold) ||
            (alert.direction === "below" && currentPrice < threshold);

          if (shouldTrigger) {
            const updated = currentAlerts.map((a) =>
              a.id === alert.id
                ? { ...a, triggered: true, lastTriggeredAt: Date.now() }
                : a,
            );
            defaultPriceFeedStore.alerts$.set(updated);

            if (
              typeof window !== "undefined" &&
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              new Notification(`Price Alert: ${alert.pair}`, {
                body: `${alert.pair} is now ${alert.direction} $${threshold.toFixed(2)} (current: $${currentPrice.toFixed(2)})`,
                icon: "/favicon.ico",
              });
            }
          } else if (alert.triggered) {
            const updated = currentAlerts.map((a) =>
              a.id === alert.id ? { ...a, triggered: false } : a,
            );
            defaultPriceFeedStore.alerts$.set(updated);
          }
        }
        break;
      }

      case "ohlc_snapshot": {
        const snapshot = msg as OHLCSnapshotMessage;
        const currentOHLC = defaultPriceFeedStore.ohlcData$.get();
        defaultPriceFeedStore.ohlcData$.set({
          ...currentOHLC,
          [snapshot.pair]: snapshot.bars,
        });
        cacheOHLCBars(snapshot.pair, snapshot.bars).catch((err) => {
          console.warn("[usePriceFeed] Failed to cache OHLC data:", err);
        });
        break;
      }

      case "heartbeat":
        resetHeartbeat();
        break;

      case "error":
        console.error("[usePriceFeed] Server error:", msg.message);
        break;
    }
  }, [resetHeartbeat]);

  // ── Reconnect logic ────────────────────────────────────────────────────

  // Ref that always points to the latest connect function
  const doConnectRef = useRef<() => void>(() => {});

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    if (!isOnlineRef.current) return;

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, reconnectAttemptRef.current) +
        Math.random() * RECONNECT_JITTER_MS,
      RECONNECT_MAX_MS,
    );

    defaultPriceFeedStore.connectionState$.set("reconnecting");

    reconnectTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        reconnectAttemptRef.current++;
        doConnectRef.current();
      }
    }, delay);
  }, []);

  // ── Connect function ───────────────────────────────────────────────────

  const doConnect = useCallback(() => {
    if (!mountedRef.current) return;
    if (!isOnlineRef.current) return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    defaultPriceFeedStore.connectionState$.set("connecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;
    } catch {
      defaultPriceFeedStore.connectionState$.set("error");
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      if (!mountedRef.current) return;
      defaultPriceFeedStore.connectionState$.set("connected");
      reconnectAttemptRef.current = 0;
      resetHeartbeat();
    };

    ws.onmessage = handleMessage;

    ws.onclose = (event) => {
      if (!mountedRef.current) return;
      if (event.code !== 1000 && event.code !== 1001) {
        scheduleReconnect();
      } else {
        defaultPriceFeedStore.connectionState$.set("disconnected");
      }
    };

    ws.onerror = () => {
      defaultPriceFeedStore.connectionState$.set("error");
    };
  }, [handleMessage, resetHeartbeat, scheduleReconnect]);

  // Sync the ref so callers always use the latest connect function
  useEffect(() => {
    doConnectRef.current = doConnect;
  }, [doConnect]);

  // ── Hydrate from cache on mount ────────────────────────────────────────

  useEffect(() => {
    getCachedPriceMap().then((cached) => {
      if (cached && mountedRef.current) {
        defaultPriceFeedStore.priceMap$.set(cached.data);
        const lastUpdated: Record<string, number> = {};
        for (const [pair, tick] of Object.entries(cached.data)) {
          lastUpdated[pair] = new Date(tick.timestamp).getTime();
        }
        defaultPriceFeedStore.lastUpdated$.set(lastUpdated);
      }
    }).catch(() => {
      // Cache read failed — proceed with empty state
    });
  }, []);

  // ── Connect/disconnect based on online status ──────────────────────────

  useEffect(() => {
    if (isOnline) {
      doConnectRef.current();
    } else {
      if (wsRef.current) {
        wsRef.current.close(1000, "offline");
        wsRef.current = null;
      }
      defaultPriceFeedStore.connectionState$.set("disconnected");
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    }
  }, [isOnline]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (wsRef.current) {
        wsRef.current.close(1000, "unmount");
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatTimerRef.current) {
        clearTimeout(heartbeatTimerRef.current);
      }
    };
  }, []);

  // ── Public API ─────────────────────────────────────────────────────────

  const selectPair = useCallback((pair: string | null) => {
    defaultPriceFeedStore.selectedPair$.set(pair);
  }, []);

  const setChartRange = useCallback((range: ChartTimeRange) => {
    defaultPriceFeedStore.chartRange$.set(range);
  }, []);

  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close(1000, "manual reconnect");
    }
    doConnectRef.current();
  }, []);

  return {
    priceMap,
    connectionState,
    alerts,
    selectPair,
    selectedPair,
    setChartRange,
    chartRange,
    ohlcData,
    reconnect,
  };
}
