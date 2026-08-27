// src/hooks/useOrderBook.ts
import { useEffect, useMemo, useReducer, useRef } from "react";
import {
  applyMessage,
  bestAsk,
  bestBid,
  createEmptyBook,
  midPrice,
  spread,
  toDepthLevels,
  type DepthLevel,
  type OrderBookMsg,
  type OrderBookState,
} from "../lib/orderbook";

const WS_BASE = "wss://api.agritrust.io/ws/orderbook";
const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 8_000;

type Action =
  | { kind: "message"; msg: OrderBookMsg }
  | { kind: "connected" }
  | { kind: "disconnected" }
  | { kind: "reset"; market: string };

function reducer(state: OrderBookState, action: Action): OrderBookState {
  switch (action.kind) {
    case "message":
      return applyMessage(state, action.msg);
    case "connected":
      return { ...state, connected: true };
    case "disconnected":
      return { ...state, connected: false };
    case "reset":
      return { ...createEmptyBook(), market: action.market };
    default:
      return state;
  }
}

export interface UseOrderBookResult {
  raw: OrderBookState;
  bids: DepthLevel[];
  asks: DepthLevel[];
  bestBid: number | null;
  bestAsk: number | null;
  mid: number | null;
  spread: number | null;
  connected: boolean;
  /** ms since the last message was applied, or null if none yet */
  staleForMs: number | null;
}

/**
 * Subscribes to `wss://api.agritrust.io/ws/orderbook/{market}` and maintains a
 * local order book via delta application. Reconnects with capped exponential
 * backoff on drop, and requests a fresh snapshot after each reconnect since a
 * gap in the delta sequence can't be safely patched over.
 *
 * Pass `socketFactory` in tests to inject a mock WebSocket implementation
 * instead of hitting the real network (see useOrderBook.test.ts).
 */
export function useOrderBook(
  market: string,
  socketFactory: (url: string) => WebSocket = (url) => new WebSocket(url)
): UseOrderBookResult {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    ...createEmptyBook(),
    market,
  }));

  const attemptRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const closedByUsRef = useRef(false);

  useEffect(() => {
    closedByUsRef.current = false;
    attemptRef.current = 0;
    dispatch({ kind: "reset", market });

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const url = `${WS_BASE}/${encodeURIComponent(market)}`;
      const socket = socketFactory(url);
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        dispatch({ kind: "connected" });
      };

      socket.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as OrderBookMsg;
          dispatch({ kind: "message", msg });
        } catch (err) {
          // Malformed frame: drop it rather than crash the book. A single
          // bad message shouldn't take down the whole terminal.
          console.error("useOrderBook: failed to parse message", err);
        }
      };

      socket.onerror = () => {
        // onclose fires right after in browsers; reconnect logic lives there.
      };

      socket.onclose = () => {
        dispatch({ kind: "disconnected" });
        if (closedByUsRef.current) return;

        const delay = Math.min(
          RECONNECT_BASE_DELAY_MS * 2 ** attemptRef.current,
          RECONNECT_MAX_DELAY_MS
        );
        attemptRef.current += 1;
        timeoutId = setTimeout(() => {
          dispatch({ kind: "reset", market });
          connect();
        }, delay);
      };
    }

    connect();

    return () => {
      closedByUsRef.current = true;
      if (timeoutId) clearTimeout(timeoutId);
      socketRef.current?.close();
    };
  }, [market, socketFactory]);

  const bids = useMemo(() => toDepthLevels(state.bids, "bid"), [state.bids]);
  const asks = useMemo(() => toDepthLevels(state.asks, "ask"), [state.asks]);

  return {
    raw: state,
    bids,
    asks,
    bestBid: bestBid(state),
    bestAsk: bestAsk(state),
    mid: midPrice(state),
    spread: spread(state),
    connected: state.connected,
    staleForMs: state.lastUpdateAt ? Date.now() - state.lastUpdateAt : null,
  };
}
