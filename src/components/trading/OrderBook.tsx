// src/components/trading/OrderBook.tsx
import React, { useMemo } from "react";
import { useOrderBook } from "../../hooks/useOrderBook";
import type { DepthLevel } from "../../lib/orderbook";
import "./OrderBook.css";

interface OrderBookProps {
  market: string;
  /** how many rows to show per side; capped to the 100-level max */
  visibleLevels?: number;
  onSelectPrice?: (price: number) => void;
}

function Row({
  level,
  side,
  maxCumulative,
  isBest,
  onSelectPrice,
}: {
  level: DepthLevel;
  side: "bid" | "ask";
  maxCumulative: number;
  isBest: boolean;
  onSelectPrice?: (price: number) => void;
}) {
  const depthPct = maxCumulative > 0 ? (level.cumulative / maxCumulative) * 100 : 0;

  return (
    <button
      type="button"
      className={`ob-row ob-row--${side} ${isBest ? "ob-row--best" : ""}`}
      onClick={() => onSelectPrice?.(level.price)}
      aria-label={`${side === "bid" ? "Bid" : "Ask"} ${level.price} size ${level.size}`}
    >
      <span
        className="ob-row__depth"
        style={{ width: `${depthPct}%` }}
        aria-hidden="true"
      />
      <span className="ob-row__price">{level.price.toFixed(4)}</span>
      <span className="ob-row__size">{level.size.toFixed(2)}</span>
      <span className="ob-row__cumulative">{level.cumulative.toFixed(2)}</span>
    </button>
  );
}

export default function OrderBook({
  market,
  visibleLevels = 20,
  onSelectPrice,
}: OrderBookProps) {
  const { bids, asks, bestBid, bestAsk, spread, connected } = useOrderBook(market);

  const shownBids = useMemo(() => bids.slice(0, visibleLevels), [bids, visibleLevels]);
  const shownAsks = useMemo(() => asks.slice(0, visibleLevels), [asks, visibleLevels]);

  const maxCumulative = Math.max(
    shownBids.at(-1)?.cumulative ?? 0,
    shownAsks.at(-1)?.cumulative ?? 0
  );

  return (
    <section className="orderbook" aria-label={`Order book for ${market}`}>
      <header className="orderbook__header">
        <h3>Order book</h3>
        <span className={`orderbook__status ${connected ? "is-live" : "is-down"}`}>
          {connected ? "Live" : "Reconnecting…"}
        </span>
      </header>

      <div className="orderbook__columns">
        <span>Price</span>
        <span>Size</span>
        <span>Total</span>
      </div>

      <div className="orderbook__asks">
        {shownAsks
          .slice()
          .reverse()
          .map((level) => (
            <Row
              key={`ask-${level.price}`}
              level={level}
              side="ask"
              maxCumulative={maxCumulative}
              isBest={level.price === bestAsk}
              onSelectPrice={onSelectPrice}
            />
          ))}
      </div>

      <div className="orderbook__spread">
        {spread !== null ? `Spread ${spread.toFixed(4)}` : "—"}
      </div>

      <div className="orderbook__bids">
        {shownBids.map((level) => (
          <Row
            key={`bid-${level.price}`}
            level={level}
            side="bid"
            maxCumulative={maxCumulative}
            isBest={level.price === bestBid}
            onSelectPrice={onSelectPrice}
          />
        ))}
      </div>
    </section>
  );
}
