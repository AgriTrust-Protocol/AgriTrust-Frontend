import { describe, expect, it } from "vitest";
import { applyOrderBookDeltas } from "./useOrderBook";

describe("applyOrderBookDeltas", () => {
  it("keeps a 100-level sorted level 2 book after 1000 deltas", () => {
    let book = { bids: [], asks: [] } as ReturnType<typeof applyOrderBookDeltas>;
    const deltas = Array.from({ length: 1000 }, (_, i) => ({ side: (i % 2 === 0 ? "bid" : "ask") as const, price: i % 2 === 0 ? 500 - i / 10 : 501 + i / 10, size: (i % 17) + 1 }));
    book = applyOrderBookDeltas(book, deltas);
    expect(book.bids).toHaveLength(100);
    expect(book.asks).toHaveLength(100);
    expect(book.bids.every((level, index, levels) => index === 0 || levels[index - 1].price >= level.price)).toBe(true);
    expect(book.asks.every((level, index, levels) => index === 0 || levels[index - 1].price <= level.price)).toBe(true);
    expect(book.bids.at(-1)?.cumulative).toBeGreaterThan(book.bids[0].size);
  });
});
