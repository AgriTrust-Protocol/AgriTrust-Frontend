"use client";

import { FormEvent, useEffect, useState } from "react";
import { OrderSide, OrderType, useTrade } from "@/src/hooks/useTrade";

export function OrderPanel({ market }: { market: string }) {
  const [side, setSide] = useState<OrderSide>("buy");
  const [type, setType] = useState<OrderType>("limit");
  const [price, setPrice] = useState("420");
  const [amount, setAmount] = useState("10");
  const [stopPrice, setStopPrice] = useState("415");
  const [visibleAmount, setVisibleAmount] = useState("2");
  const { submitOrder, confirmation, pending } = useTrade(market);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "b") setSide("buy");
      if (event.key.toLowerCase() === "s") setSide("sell");
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "x") window.dispatchEvent(new CustomEvent("agritrust:cancel-all"));
      if (event.key.toLowerCase() === "o") window.dispatchEvent(new CustomEvent("agritrust:toggle-orderbook"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submitOrder({ side, type, amount: Number(amount), price: Number(price), stopPrice: Number(stopPrice), visibleAmount: type === "iceberg" ? Number(visibleAmount) : undefined });
  };

  return <section className="rounded-2xl border border-zinc-200 bg-white p-4"><h2 className="mb-3 text-lg font-semibold">Trade Execution</h2><form onSubmit={onSubmit} className="space-y-3"><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setSide("buy")} className={`rounded-lg p-2 font-semibold ${side === "buy" ? "bg-emerald-600 text-white" : "bg-zinc-100"}`}>Buy (B)</button><button type="button" onClick={() => setSide("sell")} className={`rounded-lg p-2 font-semibold ${side === "sell" ? "bg-red-600 text-white" : "bg-zinc-100"}`}>Sell (S)</button></div><label className="block text-sm">Order type<select value={type} onChange={(e) => setType(e.target.value as OrderType)} className="mt-1 w-full rounded-lg border p-2"><option value="market">Market</option><option value="limit">Limit</option><option value="stop-limit">Stop limit</option><option value="stop-market">Stop market</option><option value="iceberg">Iceberg</option></select></label><label className="block text-sm">Price<input value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1 w-full rounded-lg border p-2" inputMode="decimal" /></label>{type.startsWith("stop") && <label className="block text-sm">Stop price<input value={stopPrice} onChange={(e) => setStopPrice(e.target.value)} className="mt-1 w-full rounded-lg border p-2" inputMode="decimal" /></label>}{type === "iceberg" && <label className="block text-sm">Visible amount<input value={visibleAmount} onChange={(e) => setVisibleAmount(e.target.value)} className="mt-1 w-full rounded-lg border p-2" inputMode="decimal" /></label>}<label className="block text-sm">Amount<input value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-lg border p-2" inputMode="decimal" /></label><button disabled={pending} className="w-full rounded-lg bg-zinc-950 p-3 font-semibold text-white disabled:opacity-60">{pending ? "Submitting…" : `Submit ${side}`}</button></form>{confirmation && <div role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Order {confirmation.id} confirmed. Est. fill ${confirmation.estimatedFillPrice.toFixed(2)}</div>}</section>;
}
