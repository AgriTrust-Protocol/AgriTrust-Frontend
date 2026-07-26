/**
 * Type definitions for the Yield Dashboard's real-time oracle price feed system.
 *
 * Price feeds: oracle prices for 20+ crop-currency pairs updated via WebSocket.
 * Charts: OHLC candlestick data at daily granularity for 1-year historical view.
 * Alerts: user-configured threshold alerts with browser notification + email.
 */

// ── Price Feed ────────────────────────────────────────────────────────────

/** A single price tick from the oracle WebSocket feed. */
export interface PriceTick {
  /** Crop-currency pair identifier, e.g. "CORN_USD" */
  pair: string;
  /** Human-readable crop name, e.g. "Corn" */
  crop: string;
  /** ISO 4217 currency code, e.g. "USD" */
  currency: string;
  /** Current price in the pair's quote currency (as a string to preserve precision). */
  price: string;
  /** 24-hour change as a decimal string (e.g. "-0.025" = -2.5%). */
  change24h: string;
  /** Highest price in the last 24 hours. */
  high24h: string;
  /** Lowest price in the last 24 hours. */
  low24h: string;
  /** Volume / open interest as a decimal string. */
  volume24h: string;
  /** ISO-8601 timestamp of this price tick. */
  timestamp: string;
  /** Server-assigned sequence number for ordering/dedup. */
  sequence: number;
}

/** The full price map keyed by pair (e.g. "CORN_USD"). */
export type PriceMap = Record<string, PriceTick>;

// ── OHLC / Historical ─────────────────────────────────────────────────────

/** A single OHLC (Open-High-Low-Close) candlestick for daily granularity. */
export interface OHLCBar {
  /** ISO-8601 date string (YYYY-MM-DD). */
  date: string;
  /** Opening price. */
  open: number;
  /** Highest price of the period. */
  high: number;
  /** Lowest price of the period. */
  low: number;
  /** Closing price. */
  close: number;
  /** Volume for the period. */
  volume: number;
}

/** Time range options for the price chart. */
export type ChartTimeRange = "1d" | "5d" | "1m" | "3m" | "1y" | "all";

// ── Alerts ─────────────────────────────────────────────────────────────────

/** A user-configured price threshold alert for a specific crop pair. */
export interface PriceAlert {
  /** Unique alert identifier. */
  id: string;
  /** Crop pair to monitor, e.g. "CORN_USD". */
  pair: string;
  /** Threshold price (as a string to preserve precision). */
  threshold: string;
  /**
   * Direction: "above" triggers when price rises above threshold;
   * "below" triggers when price falls below threshold.
   */
  direction: "above" | "below";
  /** Whether this alert is currently enabled. */
  enabled: boolean;
  /** Whether this alert has been triggered (resets when condition no longer holds). */
  triggered: boolean;
  /** Unix-ms timestamp when the alert was created. */
  createdAt: number;
  /** Unix-ms timestamp of the last trigger (null if never triggered). */
  lastTriggeredAt: number | null;
  /** Optional user-defined label for this alert. */
  label?: string;
}

/** Normalized alert configuration for persisting to IndexedDB and localStorage. */
export interface AlertConfig {
  alerts: PriceAlert[];
  /** Whether browser notifications are enabled globally. */
  browserNotificationsEnabled: boolean;
  /** Whether email notifications are enabled globally. */
  emailNotificationsEnabled: boolean;
}

// ── KPI ────────────────────────────────────────────────────────────────────

/** Farm-level KPI dashboard metric. */
export interface FarmKpi {
  /** Unique KPI identifier (e.g. "avg-portfolio-value"). */
  id: string;
  /** Display label for the KPI card. */
  label: string;
  /** Current value (formatted string). */
  value: string;
  /** 24-hour change as a decimal string (e.g. "0.034" = +3.4%). */
  change24h: string;
  /** Sparkline data points (last 7 days). */
  sparkline: number[];
  /** Trend direction. */
  trend: "up" | "down" | "flat";
  /** Optional secondary label (e.g. unit). */
  unit?: string;
}

// ── WebSocket Message Types ────────────────────────────────────────────────

/** Message types sent by the oracle WebSocket server. */
export type PriceFeedMessageType = "price_update" | "ohlc_snapshot" | "heartbeat" | "error";

/** Base WebSocket message shape. */
export interface PriceFeedMessage {
  type: PriceFeedMessageType;
  /** ISO-8601 server timestamp. */
  timestamp: string;
}

/** Price update message: delta of changed pairs. */
export interface PriceUpdateMessage extends PriceFeedMessage {
  type: "price_update";
  /** Map of pair → price tick (only changed pairs). */
  updates: PriceMap;
}

/** OHLC snapshot message: full historical data for a pair. */
export interface OHLCSnapshotMessage extends PriceFeedMessage {
  type: "ohlc_snapshot";
  /** Crop pair identifier. */
  pair: string;
  /** Array of OHLC bars. */
  bars: OHLCBar[];
}

/** Heartbeat message to keep the connection alive. */
export interface HeartbeatMessage extends PriceFeedMessage {
  type: "heartbeat";
}

/** Error message from the server. */
export interface ErrorMessage extends PriceFeedMessage {
  type: "error";
  /** Human-readable error description. */
  message: string;
  /** Machine-readable error code. */
  code?: string;
}

/** Union of all possible WebSocket message types. */
export type PriceFeedWSMessage =
  | PriceUpdateMessage
  | OHLCSnapshotMessage
  | HeartbeatMessage
  | ErrorMessage;

// ── Connection State ───────────────────────────────────────────────────────

/** Enum of possible WebSocket connection states. */
export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

/** Data freshness relative to now. */
export interface DataFreshness {
  /** The pair this freshness applies to. */
  pair: string;
  /** Unix-ms timestamp of the last update for this pair. */
  lastUpdatedAt: number;
  /** Is the data older than the stale threshold (60s)? */
  isStale: boolean;
}
