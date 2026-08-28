// src/components/trading/RiskMetrics.tsx
import React, { useMemo } from "react";
import "./RiskMetrics.css";

export interface EquityPoint {
  timestamp: number; // ms epoch
  equity: number;
}

interface RiskMetricsProps {
  /** account equity history; needs >= a week of data for a meaningful 7d drawdown */
  equityHistory: EquityPoint[];
  /** portfolio value at risk, used to scale VaR from % to a currency figure */
  portfolioValue: number;
  leverageUsed: number;
  nearestLiquidationPrice: number | null;
}

/**
 * Historical-simulation VaR: sorts daily returns and reads off the loss at
 * the given confidence percentile. Returns a POSITIVE number representing
 * the loss magnitude (e.g. 0.032 = a 3.2% one-day loss at that confidence).
 * Needs at least 2 data points; returns 0 for anything shorter.
 */
export function computeVaR(returns: number[], confidence: 0.95 | 0.99): number {
  if (returns.length < 2) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidence) * sorted.length);
  const worst = sorted[Math.max(0, index)];
  return worst < 0 ? -worst : 0;
}

/** Converts an equity curve into simple day-over-day returns. */
export function toReturns(history: EquityPoint[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1].equity;
    if (prev === 0) continue;
    returns.push((history[i].equity - prev) / prev);
  }
  return returns;
}

/** Max drawdown (as a positive fraction) over the trailing `windowMs`. */
export function computeMaxDrawdown(history: EquityPoint[], windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  const windowed = history.filter((p) => p.timestamp >= cutoff);
  if (windowed.length === 0) return 0;

  let peak = windowed[0].equity;
  let maxDrawdown = 0;

  for (const point of windowed) {
    peak = Math.max(peak, point.equity);
    if (peak > 0) {
      const drawdown = (peak - point.equity) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
  }

  return maxDrawdown;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default function RiskMetrics({
  equityHistory,
  portfolioValue,
  leverageUsed,
  nearestLiquidationPrice,
}: RiskMetricsProps) {
  const { var95, var99, maxDrawdown } = useMemo(() => {
    const returns = toReturns(equityHistory);
    return {
      var95: computeVaR(returns, 0.95),
      var99: computeVaR(returns, 0.99),
      maxDrawdown: computeMaxDrawdown(equityHistory, SEVEN_DAYS_MS),
    };
  }, [equityHistory]);

  const leverageLevel =
    leverageUsed >= 10 ? "high" : leverageUsed >= 5 ? "medium" : "low";

  return (
    <section className="riskmetrics" aria-label="Risk metrics">
      <h3>Risk</h3>
      <dl className="riskmetrics__grid">
        <div>
          <dt>VaR (95%, 1d)</dt>
          <dd>
            {(var95 * 100).toFixed(2)}%
            <span className="riskmetrics__sub">
              {" "}
              (~{(var95 * portfolioValue).toFixed(2)})
            </span>
          </dd>
        </div>
        <div>
          <dt>VaR (99%, 1d)</dt>
          <dd>
            {(var99 * 100).toFixed(2)}%
            <span className="riskmetrics__sub">
              {" "}
              (~{(var99 * portfolioValue).toFixed(2)})
            </span>
          </dd>
        </div>
        <div>
          <dt>Max drawdown (7d)</dt>
          <dd>{(maxDrawdown * 100).toFixed(2)}%</dd>
        </div>
        <div>
          <dt>Leverage used</dt>
          <dd className={`riskmetrics__leverage riskmetrics__leverage--${leverageLevel}`}>
            {leverageUsed.toFixed(1)}x
          </dd>
        </div>
        <div>
          <dt>Nearest liquidation</dt>
          <dd>
            {nearestLiquidationPrice !== null ? nearestLiquidationPrice.toFixed(4) : "—"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
