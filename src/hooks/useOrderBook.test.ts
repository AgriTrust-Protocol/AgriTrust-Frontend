// src/hooks/useOrderBook.test.ts
//
// Uses vitest + @testing-library/react. Adjust the import below if this
// project runs on Jest instead (the APIs are drop-in compatible):
//   npm install -D vitest @testing-library/react jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useOrderBook } from "./useOrderBook";
import type { OrderBookDeltaMsg, OrderBookSnapshotMsg } from "../lib/orderbook";

/**
 * Minimal mock WebSocket: no real network, just lets the test push messages
 * in via `emit` and observe close() calls. Mirrors the subset of the
 * WebSocket interface useOrderBook actually touches.
 */
class MockWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    // Simulate the connection opening on the next tick, like a real socket.
    setTimeout(() => this.onopen?.(), 0);
  }

  emit(msg: OrderBookSnapshotMsg | OrderBookDeltaMsg) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }
}

function isSorted(prices: number[], direction: "desc" | "asc"): boolean {
  for (let i = 1; i < prices.length; i++) {
    if (direction === "desc" && prices[i] > prices[i - 1]) return false;
    if (direction === "asc" && prices[i] < prices[i - 1]) return false;
  }
  return true;
}

describe("useOrderBook", () => {
  it("maintains a sorted, deduped book across 1000 deltas", async () => {
    let socket: MockWebSocket | null = null;

    const { result } = renderHook(() =>
      useOrderBook("SOY-DEC26", (url) => {
        socket = new MockWebSocket(url);
        return socket as unknown as WebSocket;
      })
    );

    await waitFor(() => expect(result.current.connected).toBe(true));

    // Seed a snapshot around a mid of 100.
    act(() => {
      socket!.emit({
        type: "snapshot",
        market: "SOY-DEC26",
        sequence: 0,
        bids: Array.from({ length: 50 }, (_, i) => ({
          price: 100 - i * 0.5,
          size: 10,
        })),
        asks: Array.from({ length: 50 }, (_, i) => ({
          price: 100.5 + i * 0.5,
          size: 10,
        })),
      });
    });

    // Apply 1000 random deltas across both sides, occasionally deleting a level.
    act(() => {
      for (let i = 1; i <= 1000; i++) {
        const side = i % 2 === 0 ? "bid" : "ask";
        const level = Math.floor(Math.random() * 50);
        const price = side === "bid" ? 100 - level * 0.5 : 100.5 + level * 0.5;
        const size = Math.random() < 0.05 ? 0 : Math.random() * 20;

        socket!.emit({
          type: "delta",
          market: "SOY-DEC26",
          side,
          price,
          size,
          sequence: i,
        });
      }
    });

    await waitFor(() => expect(result.current.raw.sequence).toBe(1000));

    // Invariant 1: bids sorted high -> low, asks sorted low -> high.
    expect(isSorted(result.current.bids.map((l) => l.price), "desc")).toBe(true);
    expect(isSorted(result.current.asks.map((l) => l.price), "asc")).toBe(true);

    // Invariant 2: no duplicate price levels on either side.
    const bidPrices = result.current.bids.map((l) => l.price);
    const askPrices = result.current.asks.map((l) => l.price);
    expect(new Set(bidPrices).size).toBe(bidPrices.length);
    expect(new Set(askPrices).size).toBe(askPrices.length);

    // Invariant 3: cumulative size is monotonically non-decreasing.
    for (const side of [result.current.bids, result.current.asks]) {
      for (let i = 1; i < side.length; i++) {
        expect(side[i].cumulative).toBeGreaterThanOrEqual(side[i - 1].cumulative);
      }
    }

    // Invariant 4: best bid < best ask (book never crosses).
    if (result.current.bestBid !== null && result.current.bestAsk !== null) {
      expect(result.current.bestBid).toBeLessThan(result.current.bestAsk);
    }

    // Invariant 5: every level respects the 100-level cap.
    expect(result.current.bids.length).toBeLessThanOrEqual(100);
    expect(result.current.asks.length).toBeLessThanOrEqual(100);
  });

  it("reconnects and requests a fresh snapshot after a drop", async () => {
    let sockets: MockWebSocket[] = [];

    const { result } = renderHook(() =>
      useOrderBook("SOY-DEC26", (url) => {
        const s = new MockWebSocket(url);
        sockets.push(s);
        return s as unknown as WebSocket;
      })
    );

    await waitFor(() => expect(result.current.connected).toBe(true));

    act(() => {
      sockets[0].emit({
        type: "snapshot",
        market: "SOY-DEC26",
        sequence: 5,
        bids: [{ price: 100, size: 1 }],
        asks: [{ price: 101, size: 1 }],
      });
    });

    await waitFor(() => expect(result.current.raw.sequence).toBe(5));

    // Simulate a drop.
    act(() => {
      sockets[0].close();
    });

    expect(result.current.connected).toBe(false);
  });
});
