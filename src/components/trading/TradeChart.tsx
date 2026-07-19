"use client";

export type Candle = { time: string; open: number; high: number; low: number; close: number; depth: number };

const demoCandles: Candle[] = Array.from({ length: 30 }, (_, index) => {
  const base = 410 + Math.sin(index / 3) * 12 + index * 0.8;
  return { time: `${index + 1}`, open: base - 3, high: base + 8, low: base - 7, close: base + (index % 2 ? 4 : -2), depth: 30 + Math.cos(index / 4) * 18 };
});

export function TradeChart({ candles = demoCandles }: { candles?: Candle[] }) {
  const min = Math.min(...candles.map((c) => c.low));
  const max = Math.max(...candles.map((c) => c.high));
  const range = Math.max(max - min, 1);
  const y = (price: number) => 220 - ((price - min) / range) * 180;
  const step = 760 / candles.length;
  const depthPath = candles.map((c, i) => `${i === 0 ? "M" : "L"} ${i * step + step / 2} ${220 - c.depth * 2}`).join(" ") + " L 760 220 L 0 220 Z";

  return <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Real-time Price Chart</h2><span className="text-xs text-zinc-500">Candles + depth overlay (30fps target)</span></div><svg viewBox="0 0 760 240" className="h-72 w-full rounded-xl bg-zinc-950"><path d={depthPath} fill="rgba(34,197,94,.16)" stroke="rgba(34,197,94,.45)"/><g>{candles.map((c, i) => { const x = i * step + step / 2; const up = c.close >= c.open; return <g key={c.time}><line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={up ? "#22c55e" : "#ef4444"}/><rect x={x - 5} y={Math.min(y(c.open), y(c.close))} width="10" height={Math.max(Math.abs(y(c.open) - y(c.close)), 2)} fill={up ? "#22c55e" : "#ef4444"}/></g>; })}</g></svg></section>;
}
