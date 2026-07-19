import { OrderBook } from "@/src/components/trading/OrderBook";
import { OrderPanel } from "@/src/components/trading/OrderPanel";
import { PositionsTable } from "@/src/components/trading/PositionsTable";
import { RiskMetrics } from "@/src/components/trading/RiskMetrics";
import { TradeChart } from "@/src/components/trading/TradeChart";

const market = "WHEAT-SEP26";
const positions = [
  { market, side: "long" as const, size: 120, entry_price: 418.25, mark_price: 426.1 },
  { market: "CORN-DEC26", side: "short" as const, size: 80, entry_price: 502.4, mark_price: 498.9 },
];

export default function TradingTerminalPage() {
  return <main className="min-h-screen bg-zinc-100 p-6 text-zinc-950"><div className="mx-auto max-w-7xl space-y-4"><header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold uppercase text-emerald-700">AgriTrust Markets</p><h1 className="text-3xl font-bold">Real-Time Futures Trading Terminal</h1></div><p className="rounded-full bg-white px-4 py-2 text-sm text-zinc-600">Shortcuts: B buy · S sell · O order book · Ctrl+Shift+X cancel all</p></header><div className="grid gap-4 lg:grid-cols-[1fr_360px]"><div className="space-y-4"><TradeChart /><RiskMetrics positions={positions} /><PositionsTable positions={positions} /></div><div className="space-y-4"><OrderPanel market={market} /><OrderBook market={market} /></div></div></div></main>;
}
