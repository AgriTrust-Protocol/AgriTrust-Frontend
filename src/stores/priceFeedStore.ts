/**
 * Reactive price feed store using signal-based dependency graph.
 *
 * Signals:
 *  - priceMap$: Signal<PriceMap>              — current prices for all pairs
 *  - connectionState$: Signal<ConnectionState> — WebSocket connection health
 *  - alerts$: Signal<PriceAlert[]>            — configured threshold alerts
 *  - selectedPair$: Signal<string | null>     — currently selected chart pair
 *  - chartRange$: Signal<ChartTimeRange>      — time range for OHLC chart
 *  - ohlcData$: Signal<Record<string, OHLCBar[]>> — OHLC data keyed by pair
 *  - dataFreshness$: Computed<Record<string, DataFreshness>> — per-pair freshness
 *  - kpis$: Computed<FarmKpi[]>               — derived farm-level KPIs
 *
 * Components use `useSignal(priceFeedStore.priceMap$)`
 * to subscribe to reactive price updates and re-render automatically.
 */

import { createSignal } from "@/src/services/reactive/signal";
import { createComputed } from "@/src/services/reactive/computed";
import type { Signal, Computed } from "@/src/types/reactive";
import type {
  PriceMap,
  PriceAlert,
  ChartTimeRange,
  OHLCBar,
  DataFreshness,
  FarmKpi,
  ConnectionState,
} from "@/src/types/prices";

// ── Staleness threshold (60 seconds) ──────────────────────────────────────

const STALE_THRESHOLD_MS = 60_000;

// ── Store shape ────────────────────────────────────────────────────────────

export interface PriceFeedSignalStore {
  /** Current price map for all crop-currency pairs. */
  priceMap$: Signal<PriceMap>;
  /** WebSocket connection state. */
  connectionState$: Signal<ConnectionState>;
  /** Configured price threshold alerts. */
  alerts$: Signal<PriceAlert[]>;
  /** Currently selected crop pair for the detailed chart view. */
  selectedPair$: Signal<string | null>;
  /** Selected time range for the OHLC chart. */
  chartRange$: Signal<ChartTimeRange>;
  /** OHLC historical data keyed by pair. */
  ohlcData$: Signal<Record<string, OHLCBar[]>>;
  /** Last-updated timestamps per pair (keyed by pair). */
  lastUpdated$: Signal<Record<string, number>>;
  /** Derived: per-pair data freshness indicators. */
  dataFreshness$: Computed<Record<string, DataFreshness>>;
  /** Derived: farm-level KPI metrics. */
  kpis$: Computed<FarmKpi[]>;
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createPriceFeedSignalStore(): PriceFeedSignalStore {
  const priceMap$ = createSignal<PriceMap>({});
  const connectionState$ = createSignal<ConnectionState>("disconnected");
  const alerts$ = createSignal<PriceAlert[]>([]);
  const selectedPair$ = createSignal<string | null>(null);
  const chartRange$ = createSignal<ChartTimeRange>("1m");
  const ohlcData$ = createSignal<Record<string, OHLCBar[]>>({});
  const lastUpdated$ = createSignal<Record<string, number>>({});

  // Derived: data freshness per pair
  const dataFreshness$ = createComputed<Record<string, DataFreshness>>(() => {
    const now = Date.now();
    const freshness: Record<string, DataFreshness> = {};
    const lastUpdated = lastUpdated$.get();

    for (const pair of Object.keys(lastUpdated)) {
      const lastUpdatedAt = lastUpdated[pair];
      freshness[pair] = {
        pair,
        lastUpdatedAt,
        isStale: now - lastUpdatedAt > STALE_THRESHOLD_MS,
      };
    }

    return freshness;
  });

  // Derived: farm-level KPIs with sparklines
  const kpis$ = createComputed<FarmKpi[]>(() => {
    const priceMap = priceMap$.get();
    const ohlc = ohlcData$.get();
    const pairs = Object.keys(priceMap);

    if (pairs.length === 0) return [];

    // Compute aggregate KPIs
    const kpis: FarmKpi[] = [];

    // 1. Average portfolio value (mean of all current prices)
    const prices = pairs.map((p) => parseFloat(priceMap[p].price));
    const avgPrice =
      prices.length > 0
        ? prices.reduce((a, b) => a + b, 0) / prices.length
        : 0;

    // 2. 24h change (average across all pairs)
    const changes = pairs.map((p) => parseFloat(priceMap[p].change24h));
    const avgChange =
      changes.length > 0
        ? changes.reduce((a, b) => a + b, 0) / changes.length
        : 0;

    // 3. Sparkline: average close price across all pairs per day (last 7 days)
    // Build a per-date map of summed closes and counts, then average
    const dailyAvgs = new Map<string, { sum: number; count: number }>();
    for (const pair of pairs) {
      const bars = ohlc[pair] ?? [];
      for (const bar of bars.slice(-7)) {
        const existing = dailyAvgs.get(bar.date);
        if (existing) {
          existing.sum += bar.close;
          existing.count += 1;
        } else {
          dailyAvgs.set(bar.date, { sum: bar.close, count: 1 });
        }
      }
    }

    const sparkline: number[] = Array.from(dailyAvgs.values()).map(
      (v) => v.sum / v.count,
    );
    // Fallback: if no OHLC data, use a flat line
    if (sparkline.length === 0) {
      sparkline.push(avgPrice, avgPrice);
    }

    const avgTrend: "up" | "down" | "flat" =
      avgChange > 0.001 ? "up" : avgChange < -0.001 ? "down" : "flat";

    kpis.push({
      id: "avg-portfolio-value",
      label: "Avg Portfolio Value",
      value: `$${avgPrice.toFixed(2)}`,
      change24h: avgChange.toFixed(4),
      sparkline,
      trend: avgTrend,
      unit: "USD",
    });

    // 2. Yearly high/low
    const yearlyHighs: number[] = [];
    const yearlyLows: number[] = [];
    for (const pair of pairs) {
      const bars = ohlc[pair] ?? [];
      if (bars.length > 0) {
        yearlyHighs.push(Math.max(...bars.map((b) => b.high)));
        yearlyLows.push(Math.min(...bars.map((b) => b.low)));
      }
    }

    const avgYearlyHigh =
      yearlyHighs.length > 0
        ? yearlyHighs.reduce((a, b) => a + b, 0) / yearlyHighs.length
        : 0;

    const avgYearlyLow =
      yearlyLows.length > 0
        ? yearlyLows.reduce((a, b) => a + b, 0) / yearlyLows.length
        : 0;

    kpis.push({
      id: "yearly-range",
      label: "Yearly Range",
      value: `$${avgYearlyLow.toFixed(2)} – $${avgYearlyHigh.toFixed(2)}`,
      change24h: "0",
      sparkline: sparkline.length > 0 ? sparkline : [],
      trend: "flat",
    });

    // 3. Total volume / open interest
    const volumes = pairs.map((p) => parseFloat(priceMap[p].volume24h));
    const totalVolume =
      volumes.length > 0
        ? volumes.reduce((a, b) => a + b, 0)
        : 0;

    kpis.push({
      id: "total-volume",
      label: "Total Volume (24h)",
      value: `$${totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      change24h: "0",
      sparkline: sparkline.length > 0 ? sparkline : [],
      trend: "flat",
    });

    return kpis;
  });

  return {
    priceMap$,
    connectionState$,
    alerts$,
    selectedPair$,
    chartRange$,
    ohlcData$,
    lastUpdated$,
    dataFreshness$,
    kpis$,
  };
}

/** Shared singleton for the yield dashboard. */
export const defaultPriceFeedStore = createPriceFeedSignalStore();
