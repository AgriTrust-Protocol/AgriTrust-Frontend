import { Position, positionPnL } from "./PositionsTable";

export function RiskMetrics({ positions }: { positions: Position[] }) {
  const equity = positions.reduce((sum, p) => sum + p.entry_price * p.size + positionPnL(p).pnl, 0);
  const exposure = positions.reduce((sum, p) => sum + p.mark_price * p.size, 0);
  const leverage = exposure / Math.max(equity, 1);
  const var95 = exposure * 0.018;
  const var99 = exposure * 0.031;
  const maxDrawdown = Math.min(12.4, leverage * 3.2);
  const liquidationPrice = positions[0] ? positions[0].entry_price * (positions[0].side === "long" ? 0.72 : 1.28) : 0;
  return <section className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-5"><Metric label="VaR 95%" value={`$${var95.toFixed(0)}`} /><Metric label="VaR 99%" value={`$${var99.toFixed(0)}`} /><Metric label="Max DD 7d" value={`${maxDrawdown.toFixed(1)}%`} /><Metric label="Leverage" value={`${leverage.toFixed(2)}x`} /><Metric label="Liq. price" value={`$${liquidationPrice.toFixed(2)}`} /></section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-zinc-50 p-3"><div className="text-xs text-zinc-500">{label}</div><div className="text-xl font-bold text-zinc-900">{value}</div></div>; }
