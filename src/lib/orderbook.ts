// src/lib/orderbook.ts
// Pure, framework-free order book model. Kept separate from the hook so it can
// be unit-tested without touching WebSocket/React at all.

export type Side = "bid" | "ask";

export interface PriceLevel {
  price: number;
  size: number; // size at this exact price level (0 means "remove level")
}

export interface OrderBookSnapshotMsg {
  type: "snapshot";
  market: string;
  bids: PriceLevel[];
  asks: PriceLevel[];
  sequence: number;
}

export interface OrderBookDeltaMsg {
  type: "delta";
  market: string;
  side: Side;
  price: number;
  size: number; // new absolute size at `price`; 0 removes the level
  sequence: number;
}

export type OrderBookMsg = OrderBookSnapshotMsg | OrderBookDeltaMsg;

export interface DepthLevel extends PriceLevel {
  cumulative: number;
}

export interface OrderBookState {
  market: string | null;
  bids: Map<number, number>; // price -> size
  asks: Map<number, number>;
  sequence: number;
  connected: boolean;
  lastUpdateAt: number | null;
}

export const MAX_LEVELS = 100;

export function createEmptyBook(): OrderBookState {
  return {
    market: null,
    bids: new Map(),
    asks: new Map(),
    sequence: -1,
    connected: false,
    lastUpdateAt: null,
  };
}

/**
 * Applies a snapshot or delta message to a book, returning a NEW state object
 * (never mutates the input) so it's safe to use directly as React state.
 *
 * Out-of-order / stale messages (sequence <= current sequence) are ignored,
 * which protects the book from double-applying a delta that arrives twice.
 */
export function applyMessage(
  state: OrderBookState,
  msg: OrderBookMsg
): OrderBookState {
  if (msg.sequence <= state.sequence && state.sequence !== -1) {
    return state;
  }

  if (msg.type === "snapshot") {
    return {
      market: msg.market,
      bids: new Map(msg.bids.map((l) => [l.price, l.size])),
      asks: new Map(msg.asks.map((l) => [l.price, l.size])),
      sequence: msg.sequence,
      connected: true,
      lastUpdateAt: Date.now(),
    };
  }

  const bids = new Map(state.bids);
  const asks = new Map(state.asks);
  const target = msg.side === "bid" ? bids : asks;

  if (msg.size <= 0) {
    target.delete(msg.price);
  } else {
    target.set(msg.price, msg.size);
  }

  return {
    ...state,
    bids,
    asks,
    sequence: msg.sequence,
    lastUpdateAt: Date.now(),
  };
}

/**
 * Converts the raw price->size maps into sorted, depth-accumulated arrays
 * ready for rendering. Bids sorted high->low, asks sorted low->high, each
 * capped to MAX_LEVELS (the deepest levels are dropped, not the best ones).
 */
export function toDepthLevels(
  levels: Map<number, number>,
  side: Side,
  maxLevels: number = MAX_LEVELS
): DepthLevel[] {
  const entries = Array.from(levels.entries())
    .filter(([, size]) => size > 0)
    .sort((a, b) => (side === "bid" ? b[0] - a[0] : a[0] - b[0]))
    .slice(0, maxLevels);

  let cumulative = 0;
  return entries.map(([price, size]) => {
    cumulative += size;
    return { price, size, cumulative };
  });
}

export function bestBid(state: OrderBookState): number | null {
  let best: number | null = null;
  for (const [price, size] of state.bids) {
    if (size > 0 && (best === null || price > best)) best = price;
  }
  return best;
}

export function bestAsk(state: OrderBookState): number | null {
  let best: number | null = null;
  for (const [price, size] of state.asks) {
    if (size > 0 && (best === null || price < best)) best = price;
  }
  return best;
}

export function midPrice(state: OrderBookState): number | null {
  const bid = bestBid(state);
  const ask = bestAsk(state);
  if (bid === null || ask === null) return null;
  return (bid + ask) / 2;
}

export function spread(state: OrderBookState): number | null {
  const bid = bestBid(state);
  const ask = bestAsk(state);
  if (bid === null || ask === null) return null;
  return ask - bid;
}
