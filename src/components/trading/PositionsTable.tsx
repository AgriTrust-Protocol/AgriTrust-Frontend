export type Position = { market: string; side: "long" | "short"; size: number; entry_price: number; mark_price: number };

export function positionPnL(position: Position) {
  const direction = position.side === "long" ? 1 : -1;
  const pnl = (position.mark_price - position.entry_price) * position.size * direction;
  const roi = pnl / Math.max(position.entry_price * position.size, 1);
  return { pnl, roi };
}

export function PositionsTable({ positions }: { positions: Position[] }) {
  return <section className="rounded-2xl border border-zinc-200 bg-white p-4"><h2 className="mb-3 text-lg font-semibold">Open Positions</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-zinc-500"><th>Market</th><th>Side</th><th>Size</th><th>Entry</th><th>Mark</th><th>P&L</th><th>RoI</th></tr></thead><tbody>{positions.map((position) => { const { pnl, roi } = positionPnL(position); return <tr key={`${position.market}-${position.side}`} className="border-t"><td>{position.market}</td><td>{position.side}</td><td>{position.size}</td><td>{position.entry_price.toFixed(2)}</td><td>{position.mark_price.toFixed(2)}</td><td className={pnl >= 0 ? "text-emerald-600" : "text-red-600"}>{pnl.toFixed(2)}</td><td>{(roi * 100).toFixed(2)}%</td></tr>; })}</tbody></table></div></section>;
}
