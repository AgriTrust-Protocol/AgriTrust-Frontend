"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type OrderBookSide = "bid" | "ask";
export type OrderBookLevel = { price: number; size: number; cumulative: number };
export type OrderBookState = { bids: OrderBookLevel[]; asks: OrderBookLevel[]; connected: boolean; lastUpdate?: number };
export type OrderBookDelta = { side: OrderBookSide; price: number; size: number };
export type OrderBookMessage = { type?: "snapshot" | "delta"; bids?: [number, number][]; asks?: [number, number][]; deltas?: OrderBookDelta[] } | OrderBookDelta;

const MAX_LEVELS = 100;

const withCumulative = (levels: Array<[number, number]>, side: OrderBookSide): OrderBookLevel[] => {
  let total = 0;
  return levels
    .filter(([, size]) => size > 0)
    .sort((a, b) => (side === "bid" ? b[0] - a[0] : a[0] - b[0]))
    .slice(0, MAX_LEVELS)
    .map(([price, size]) => ({ price, size, cumulative: (total += size) }));
};

export function applyOrderBookDeltas(current: Pick<OrderBookState, "bids" | "asks">, deltas: OrderBookDelta[]): Pick<OrderBookState, "bids" | "asks"> {
  const sides = {
    bid: new Map(current.bids.map((level) => [level.price, level.size])),
    ask: new Map(current.asks.map((level) => [level.price, level.size])),
  };

  for (const delta of deltas) {
    if (!Number.isFinite(delta.price) || !Number.isFinite(delta.size)) continue;
    const bookSide = sides[delta.side];
    if (delta.size <= 0) bookSide.delete(delta.price);
    else bookSide.set(delta.price, delta.size);
  }

  return {
    bids: withCumulative([...sides.bid.entries()], "bid"),
    asks: withCumulative([...sides.ask.entries()], "ask"),
  };
}

function parseMessage(event: MessageEvent<string>): OrderBookMessage | null {
  try {
    return JSON.parse(event.data) as OrderBookMessage;
  } catch {
    return null;
  }
}

export function useOrderBook(market: string, wsFactory: typeof WebSocket = WebSocket) {
  const [book, setBook] = useState<OrderBookState>({ bids: [], asks: [], connected: false });
  const frameRef = useRef<number | null>(null);
  const queueRef = useRef<OrderBookDelta[]>([]);

  useEffect(() => {
    if (!market) return;
    const socket = new wsFactory(`wss://api.agritrust.io/ws/orderbook/${encodeURIComponent(market)}`);

    const flush = () => {
      frameRef.current = null;
      const deltas = queueRef.current.splice(0);
      if (deltas.length === 0) return;
      setBook((current) => ({ ...current, ...applyOrderBookDeltas(current, deltas), lastUpdate: Date.now() }));
    };

    socket.onopen = () => setBook((current) => ({ ...current, connected: true }));
    socket.onclose = () => setBook((current) => ({ ...current, connected: false }));
    socket.onerror = () => setBook((current) => ({ ...current, connected: false }));
    socket.onmessage = (event) => {
      const message = parseMessage(event as MessageEvent<string>);
      if (!message) return;
      if ("type" in message && message.type === "snapshot") {
        setBook({ bids: withCumulative(message.bids ?? [], "bid"), asks: withCumulative(message.asks ?? [], "ask"), connected: true, lastUpdate: Date.now() });
        return;
      }
      const deltas = "deltas" in message && message.deltas ? message.deltas : "side" in message ? [message] : [];
      queueRef.current.push(...deltas);
      if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(flush);
    };

    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      socket.close();
    };
  }, [market, wsFactory]);

  return useMemo(() => book, [book]);
}
