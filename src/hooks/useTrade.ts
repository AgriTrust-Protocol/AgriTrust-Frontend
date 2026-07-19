"use client";

import { useCallback, useState } from "react";

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop-limit" | "stop-market" | "iceberg";
export type TradeOrder = { market: string; side: OrderSide; type: OrderType; amount: number; price?: number; stopPrice?: number; visibleAmount?: number };
export type TradeConfirmation = { id: string; status: "accepted" | "filled"; estimatedFillPrice: number; message: string };

type TradeMessage = { type?: "confirmation"; id?: string; status?: "accepted" | "filled"; estimatedFillPrice?: number };

export function useTrade(market: string, wsFactory: typeof WebSocket = WebSocket) {
  const [confirmation, setConfirmation] = useState<TradeConfirmation | null>(null);
  const [pending, setPending] = useState(false);

  const submitOrder = useCallback((order: Omit<TradeOrder, "market">) => {
    setPending(true);
    const payload: TradeOrder = { ...order, market };
    const socket = new wsFactory("wss://api.agritrust.io/ws/trade");
    socket.onopen = () => socket.send(JSON.stringify({ type: "submit_order", order: payload }));
    socket.onmessage = (event) => {
      const message = JSON.parse((event as MessageEvent<string>).data) as TradeMessage;
      if (message.type !== "confirmation") return;
      const next = {
        id: message.id ?? crypto.randomUUID(),
        status: message.status ?? "accepted",
        estimatedFillPrice: message.estimatedFillPrice ?? payload.price ?? 0,
        message: `${payload.side.toUpperCase()} ${payload.amount} ${payload.market} ${message.status ?? "accepted"}`,
      } satisfies TradeConfirmation;
      setConfirmation(next);
      setPending(false);
      socket.close();
    };
    socket.onerror = () => setPending(false);
  }, [market, wsFactory]);

  return { submitOrder, confirmation, pending };
}
