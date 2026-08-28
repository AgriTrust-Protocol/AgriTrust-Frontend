// src/components/trading/PositionsTable.tsx
import React, { useMemo } from "react";
import "./PositionsTable.css";

export interface Position {
  market: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  marginUsed: number;
}

export interface PositionWithPnl extends Position {
  pnl: number;
  roi: number; // percent
  liquidationPrice: number;
}

interface PositionsTableProps {
  positions: Position[];
  onClose?: (market: string) => void;
}

/**
 * PnL = (mark - entry) * size for longs, reversed for shorts.
 * RoI is PnL relative to the margin actually put up, so it reflects leverage.
 */
export function computePnl(p: Position): PositionWithPnl {
  const direction = p.side === "long" ? 1 : -1;
  const pnl = (p.markPrice - p.entryPrice) * p.size * direction;
  const roi = p.marginUsed > 0 ? (pnl / p.marginUsed) * 100 : 0;

  // Simplified isolated-margin liquidation price: the price at which
  // accumulated loss consumes the full margin.
  // long:  entry - (margin / size)   |   short: entry + (margin / size)
  const liquidationPrice =
    p.size > 0
      ? p.entryPrice - direction * (p.marginUsed / p.size)
      : p.entryPrice;

  return { ...p, pnl, roi, liquidationPrice };
}

export default function PositionsTable({ positions, onClose }: PositionsTableProps) {
  const rows = useMemo(() => positions.map(computePnl), [positions]);

  if (rows.length === 0) {
    return (
      <section className="positions positions--empty">
        <h3>Positions</h3>
        <p>No open positions. Orders you fill will show up here.</p>
      </section>
    );
  }

  return (
    <section className="positions" aria-label="Open positions">
      <h3>Positions</h3>
      <table className="positions__table">
        <thead>
          <tr>
            <th>Market</th>
            <th>Side</th>
            <th>Size</th>
            <th>Entry</th>
            <th>Mark</th>
            <th>PnL</th>
            <th>RoI</th>
            <th>Liq. price</th>
            <th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={`${p.market}-${p.side}`}>
              <td>{p.market}</td>
              <td className={p.side === "long" ? "is-long" : "is-short"}>
                {p.side === "long" ? "Long" : "Short"}
              </td>
              <td>{p.size.toFixed(4)}</td>
              <td>{p.entryPrice.toFixed(4)}</td>
              <td>{p.markPrice.toFixed(4)}</td>
              <td className={p.pnl >= 0 ? "is-profit" : "is-loss"}>
                {p.pnl >= 0 ? "+" : ""}
                {p.pnl.toFixed(2)}
              </td>
              <td className={p.roi >= 0 ? "is-profit" : "is-loss"}>
                {p.roi >= 0 ? "+" : ""}
                {p.roi.toFixed(2)}%
              </td>
              <td>{p.liquidationPrice.toFixed(4)}</td>
              <td>
                {onClose && (
                  <button
                    type="button"
                    className="positions__close"
                    onClick={() => onClose(p.market)}
                  >
                    Close
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
