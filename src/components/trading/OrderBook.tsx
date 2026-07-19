"use client";

import { OrderBookLevel, useOrderBook } from "@/src/hooks/useOrderBook";

function Levels({ levels, side }: { levels: OrderBookLevel[]; side: "bid" | "ask" }) {
  const max = Math.max(...levels.map((level) => level.cumulative), 1);
  return <div className="space-y-1">{levels.slice(0, 16).map((level, index) => <div key={`${side}-${level.price}`} className="relative grid grid-cols-3 overflow-hidden rounded px-2 py-1 text-xs"><span className={`absolute inset-y-0 ${side === "bid" ? "right-0 bg-emerald-500/15" : "left-0 bg-red-500/15"}`} style={{ width: `${(level.cumulative / max) * 100}%` }} /><span className={`relative font-mono ${index === 0 ? "font-bold" : ""} ${side === "bid" ? "text-emerald-600" : "text-red-600"}`}>{level.price.toFixed(2)}</span><span className="relative text-right font-mono">{level.size.toFixed(2)}</span><span className="relative text-right font-mono text-zinc-500">{level.cumulative.toFixed(2)}</span></div>)}</div>;
}

export function OrderBook({ market }: { market: string }) {
  const { bids, asks, connected } = useOrderBook(market);
  const spread = asks[0] && bids[0] ? asks[0].price - bids[0].price : 0;
  return <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-zinc-100 shadow-xl"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Level 2 Order Book</h2><span className={connected ? "text-emerald-400" : "text-amber-400"}>{connected ? "Live" : "Connecting"}</span></div><div className="grid grid-cols-3 px-2 text-[11px] uppercase text-zinc-500"><span>Price</span><span className="text-right">Size</span><span className="text-right">Cum.</span></div><Levels levels={asks} side="ask" /><div className="my-2 rounded bg-zinc-900 px-2 py-2 text-center text-sm text-zinc-300">Spread {spread.toFixed(2)}</div><Levels levels={bids} side="bid" /></section>;
}
