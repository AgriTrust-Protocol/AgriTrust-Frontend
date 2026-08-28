// src/components/trading/OrderPanel.tsx
import React, { useEffect, useState } from "react";
import { estimateFillPrice, useTrade, type OrderRequest, type OrderSide, type OrderType } from "../../hooks/useTrade";
import type { DepthLevel } from "../../lib/orderbook";
import "./OrderPanel.css";

interface OrderPanelProps {
  market: string;
  bestBid: number | null;
  bestAsk: number | null;
  bids: DepthLevel[];
  asks: DepthLevel[];
  /** externally set price, e.g. from clicking a row in OrderBook */
  prefillPrice?: number | null;
}

const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: "market", label: "Market" },
  { value: "limit", label: "Limit" },
  { value: "stop-limit", label: "Stop-limit" },
  { value: "stop-market", label: "Stop-market" },
  { value: "iceberg", label: "Iceberg" },
];

export default function OrderPanel({
  market,
  bestBid,
  bestAsk,
  bids,
  asks,
  prefillPrice,
}: OrderPanelProps) {
  const [side, setSide] = useState<OrderSide>("buy");
  const [type, setType] = useState<OrderType>("limit");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [visibleAmount, setVisibleAmount] = useState("");
  const [toast, setToast] = useState<{ text: string; kind: "ok" | "error" } | null>(null);

  const { submit, submitting, error } = useTrade(market);

  useEffect(() => {
    if (prefillPrice !== undefined && prefillPrice !== null) {
      setPrice(prefillPrice.toFixed(4));
    }
  }, [prefillPrice]);

  // Keyboard shortcuts: B = focus buy side, S = focus sell side.
  // Only fire when the user isn't typing in a text field elsewhere on the page.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (isTyping) return;

      if (e.key === "b" || e.key === "B") setSide("buy");
      if (e.key === "s" || e.key === "S") setSide("sell");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const order: OrderRequest = {
      market,
      side,
      type,
      amount: Number(amount),
      price: price ? Number(price) : undefined,
      stopPrice: stopPrice ? Number(stopPrice) : undefined,
      visibleAmount: visibleAmount ? Number(visibleAmount) : undefined,
    };

    const book = side === "buy" ? asks : bids;
    const estimate = estimateFillPrice(side, order.amount || 0, book);

    const confirmation = await submit(order);

    if (confirmation.status === "accepted") {
      const fill = confirmation.estimatedFillPrice ?? estimate;
      setToast({
        text: `${side === "buy" ? "Buy" : "Sell"} order accepted${
          fill ? ` · est. fill ${fill.toFixed(4)}` : ""
        }`,
        kind: "ok",
      });
    } else {
      setToast({ text: confirmation.reason ?? "Order rejected", kind: "error" });
    }

    setTimeout(() => setToast(null), 4000);
  }

  const showPrice = type === "limit" || type === "stop-limit" || type === "iceberg";
  const showStopPrice = type === "stop-limit" || type === "stop-market";
  const showIceberg = type === "iceberg";

  return (
    <section className="orderpanel" aria-label={`Order entry for ${market}`}>
      <div className="orderpanel__side-toggle" role="tablist" aria-label="Order side">
        <button
          type="button"
          role="tab"
          aria-selected={side === "buy"}
          className={`orderpanel__side orderpanel__side--buy ${side === "buy" ? "is-active" : ""}`}
          onClick={() => setSide("buy")}
        >
          Buy <kbd>B</kbd>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={side === "sell"}
          className={`orderpanel__side orderpanel__side--sell ${side === "sell" ? "is-active" : ""}`}
          onClick={() => setSide("sell")}
        >
          Sell <kbd>S</kbd>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="orderpanel__form">
        <label className="orderpanel__field">
          <span>Order type</span>
          <select value={type} onChange={(e) => setType(e.target.value as OrderType)}>
            {ORDER_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {showPrice && (
          <label className="orderpanel__field">
            <span>Price</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={side === "buy" ? bestAsk?.toFixed(4) : bestBid?.toFixed(4)}
            />
          </label>
        )}

        {showStopPrice && (
          <label className="orderpanel__field">
            <span>Stop price</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={stopPrice}
              onChange={(e) => setStopPrice(e.target.value)}
            />
          </label>
        )}

        <label className="orderpanel__field">
          <span>Amount</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        {showIceberg && (
          <label className="orderpanel__field">
            <span>Visible amount</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={visibleAmount}
              onChange={(e) => setVisibleAmount(e.target.value)}
            />
          </label>
        )}

        <button
          type="submit"
          disabled={submitting}
          className={`orderpanel__submit orderpanel__submit--${side}`}
        >
          {submitting ? "Submitting…" : `${side === "buy" ? "Buy" : "Sell"} ${market}`}
        </button>

        {error && <p className="orderpanel__error">{error}</p>}
      </form>

      {toast && (
        <div className={`orderpanel__toast orderpanel__toast--${toast.kind}`} role="status">
          {toast.text}
        </div>
      )}
    </section>
  );
}
