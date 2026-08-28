// src/hooks/useTrade.ts
import { useCallback, useRef, useState } from "react";

export type OrderType = "market" | "limit" | "stop-limit" | "stop-market" | "iceberg";
export type OrderSide = "buy" | "sell";

export interface OrderRequest {
  market: string;
  side: OrderSide;
  type: OrderType;
  amount: number; // total size
  price?: number; // required for limit / stop-limit
  stopPrice?: number; // required for stop-limit / stop-market
  visibleAmount?: number; // iceberg only: the slice shown to the book, <= amount
}

export interface OrderConfirmation {
  orderId: string;
  status: "accepted" | "rejected";
  estimatedFillPrice: number | null;
  reason?: string;
  submittedAt: number;
}

export interface UseTradeResult {
  submit: (order: OrderRequest) => Promise<OrderConfirmation>;
  cancelAll: () => Promise<void>;
  submitting: boolean;
  lastConfirmation: OrderConfirmation | null;
  error: string | null;
}

function validate(order: OrderRequest): string | null {
  if (order.amount <= 0) return "Amount must be greater than 0.";

  if ((order.type === "limit" || order.type === "stop-limit") && !order.price) {
    return "A limit price is required for this order type.";
  }

  if ((order.type === "stop-limit" || order.type === "stop-market") && !order.stopPrice) {
    return "A stop price is required for this order type.";
  }

  if (order.type === "iceberg") {
    if (!order.visibleAmount || order.visibleAmount <= 0) {
      return "Iceberg orders need a visible amount greater than 0.";
    }
    if (order.visibleAmount > order.amount) {
      return "Visible amount can't exceed the total order amount.";
    }
  }

  return null;
}

/**
 * Estimates a fill price by walking the provided book depth until `amount`
 * is filled — a simple VWAP-style estimate, good enough for the confirmation
 * toast. Falls back to the best price if the book doesn't have enough depth.
 */
export function estimateFillPrice(
  side: OrderSide,
  amount: number,
  book: { price: number; size: number }[]
): number | null {
  if (book.length === 0) return null;

  let remaining = amount;
  let notional = 0;
  let filled = 0;

  for (const level of book) {
    const take = Math.min(remaining, level.size);
    notional += take * level.price;
    filled += take;
    remaining -= take;
    if (remaining <= 0) break;
  }

  if (filled === 0) return null;
  return notional / filled;
}

/**
 * Submits orders to the trading backend and tracks confirmation/toast state.
 * `endpoint` defaults to the real API but can be overridden in tests.
 */
export function useTrade(
  market: string,
  endpoint: string = `https://api.agritrust.io/api/${market}/orders`
): UseTradeResult {
  const [submitting, setSubmitting] = useState(false);
  const [lastConfirmation, setLastConfirmation] = useState<OrderConfirmation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const submit = useCallback(
    async (order: OrderRequest): Promise<OrderConfirmation> => {
      const validationError = validate(order);
      if (validationError) {
        const rejected: OrderConfirmation = {
          orderId: `local-${Date.now()}`,
          status: "rejected",
          estimatedFillPrice: null,
          reason: validationError,
          submittedAt: Date.now(),
        };
        setError(validationError);
        setLastConfirmation(rejected);
        return rejected;
      }

      const requestId = ++requestIdRef.current;
      setSubmitting(true);
      setError(null);

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(order),
        });

        if (!res.ok) {
          throw new Error(`Order submission failed with status ${res.status}`);
        }

        const data = await res.json();
        const confirmation: OrderConfirmation = {
          orderId: data.orderId,
          status: data.status ?? "accepted",
          estimatedFillPrice: data.estimatedFillPrice ?? null,
          submittedAt: Date.now(),
        };

        // Ignore stale responses if a newer submit has already landed.
        if (requestId === requestIdRef.current) {
          setLastConfirmation(confirmation);
        }
        return confirmation;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Order submission failed.";
        const rejected: OrderConfirmation = {
          orderId: `failed-${Date.now()}`,
          status: "rejected",
          estimatedFillPrice: null,
          reason: message,
          submittedAt: Date.now(),
        };
        setError(message);
        if (requestId === requestIdRef.current) {
          setLastConfirmation(rejected);
        }
        return rejected;
      } finally {
        if (requestId === requestIdRef.current) {
          setSubmitting(false);
        }
      }
    },
    [endpoint]
  );

  const cancelAll = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${endpoint}/cancel-all`, { method: "POST" });
      if (!res.ok) {
        throw new Error(`Cancel-all failed with status ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel-all failed.");
    } finally {
      setSubmitting(false);
    }
  }, [endpoint]);

  return { submit, cancelAll, submitting, lastConfirmation, error };
}
