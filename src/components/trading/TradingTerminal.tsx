// src/components/trading/TradingTerminal.tsx
import React, { useEffect, useState } from "react";
import OrderBook from "./OrderBook";
import TradeChart, { type Candle } from "./TradeChart";
import OrderPanel from "./OrderPanel";
import PositionsTable, { type Position } from "./PositionsTable";
import RiskMetrics, { type EquityPoint } from "./RiskMetrics";
import { useOrderBook } from "../../hooks/useOrderBook";
import { useTrade } from "../../hooks/useTrade";
import "./TradingTerminal.css";

interface TradingTerminalProps {
  market: string;
  candles: Candle[];
  positions: Position[];
  equityHistory: EquityPoint[];
  portfolioValue: number;
}

export default function TradingTerminal({
  market,
  candles,
  positions,
  equityHistory,
  portfolioValue,
}: TradingTerminalProps) {
  const { bids, asks, bestBid, bestAsk, mid } = useOrderBook(market);
  const { cancelAll } = useTrade(market);
  const [orderBookVisible, setOrderBookVisible] = useState(true);
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);

  // Global shortcuts that aren't owned by a specific field:
  //   O                  toggle order book visibility
  //   Ctrl/Cmd+Shift+X    cancel all open orders
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);

      if (!isTyping && (e.key === "o" || e.key === "O")) {
        setOrderBookVisible((v) => !v);
      }

      if (e.shiftKey && (e.ctrlKey || e.metaKey) && (e.key === "X" || e.key === "x")) {
        e.preventDefault();
        cancelAll();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelAll]);

  const leverageUsed =
    positions.reduce((sum, p) => sum + p.leverage * p.marginUsed, 0) /
      positions.reduce((sum, p) => sum + p.marginUsed, 0) || 0;

  const nearestLiquidation = positions.length
    ? positions
        .map((p) => p.entryPrice - (p.side === "long" ? 1 : -1) * (p.marginUsed / p.size))
        .sort((a, b) => a - b)[0]
    : null;

  return (
    <div className="terminal">
      <div className="terminal__main">
        <TradeChart candles={candles} bids={bids} asks={asks} mid={mid} />
        {orderBookVisible && (
          <OrderBook market={market} onSelectPrice={setSelectedPrice} />
        )}
      </div>

      <div className="terminal__side">
        <OrderPanel
          market={market}
          bestBid={bestBid}
          bestAsk={bestAsk}
          bids={bids}
          asks={asks}
          prefillPrice={selectedPrice}
        />
        <RiskMetrics
          equityHistory={equityHistory}
          portfolioValue={portfolioValue}
          leverageUsed={leverageUsed}
          nearestLiquidationPrice={nearestLiquidation}
        />
      </div>

      <div className="terminal__bottom">
        <PositionsTable positions={positions} />
      </div>
    </div>
  );
}
