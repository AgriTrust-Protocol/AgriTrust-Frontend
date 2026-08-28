// src/components/trading/TradeChart.tsx
//
// Requires the `lightweight-charts` package (already implied by the brief):
//   npm install lightweight-charts
import React, { useEffect, useRef } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type AreaData,
  type UTCTimestamp,
} from "lightweight-charts";
import type { DepthLevel } from "../../lib/orderbook";
import "./TradeChart.css";

export interface Candle {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface TradeChartProps {
  candles: Candle[];
  bids: DepthLevel[];
  asks: DepthLevel[];
  mid: number | null;
  /** target render fps for depth-overlay updates; chart itself renders on its own RAF loop */
  depthUpdateFps?: number;
}

const CHART_OPTIONS = {
  layout: {
    background: { color: "#0e1116" },
    textColor: "#d9dee3",
  },
  grid: {
    vertLines: { color: "#1a2029" },
    horzLines: { color: "#1a2029" },
  },
  rightPriceScale: { borderColor: "#1f2733" },
  timeScale: { borderColor: "#1f2733", timeVisible: true, secondsVisible: false },
  crosshair: { mode: 0 },
};

/**
 * Converts current order-book depth into two area series (bid-depth,
 * ask-depth) anchored at the chart's latest timestamp, plotted against a
 * secondary (left) price scale so depth and price never fight for the same
 * axis. This gives a "wall" visual pinned to the right edge of the chart.
 */
function depthToAreaData(
  levels: DepthLevel[],
  anchorTime: UTCTimestamp
): AreaData[] {
  return levels.map((level, i) => ({
    time: (anchorTime + i) as UTCTimestamp,
    value: level.cumulative,
  }));
}

export default function TradeChart({
  candles,
  bids,
  asks,
  mid,
  depthUpdateFps = 30,
}: TradeChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const bidDepthSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const askDepthSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const lastDepthFrameRef = useRef(0);

  // Chart + series lifecycle
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      ...CHART_OPTIONS,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });
    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#1fae6b",
      downColor: "#e0524d",
      borderVisible: false,
      wickUpColor: "#1fae6b",
      wickDownColor: "#e0524d",
    });
    candleSeriesRef.current = candleSeries;

    // Depth overlay lives on its own scale ("depth") so it never rescales
    // the candlesticks' price axis.
    const bidDepth = chart.addAreaSeries({
      priceScaleId: "depth",
      lineColor: "rgba(31,174,107,0.6)",
      topColor: "rgba(31,174,107,0.25)",
      bottomColor: "rgba(31,174,107,0.0)",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const askDepth = chart.addAreaSeries({
      priceScaleId: "depth",
      lineColor: "rgba(224,82,77,0.6)",
      topColor: "rgba(224,82,77,0.25)",
      bottomColor: "rgba(224,82,77,0.0)",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale("depth").applyOptions({
      scaleMargins: { top: 0.75, bottom: 0 }, // pin the depth overlay to the bottom strip
      visible: false,
    });
    bidDepthSeriesRef.current = bidDepth;
    askDepthSeriesRef.current = askDepth;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      chart.applyOptions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      bidDepthSeriesRef.current = null;
      askDepthSeriesRef.current = null;
    };
  }, []);

  // Candle data — cheap enough to set directly whenever it changes.
  useEffect(() => {
    candleSeriesRef.current?.setData(candles as CandlestickData[]);
  }, [candles]);

  // Depth overlay — throttled to depthUpdateFps so a fast order-book stream
  // (60fps deltas) doesn't force the chart to redraw more than it needs to.
  useEffect(() => {
    const minFrameMs = 1000 / depthUpdateFps;
    const now = performance.now();
    if (now - lastDepthFrameRef.current < minFrameMs) return;
    lastDepthFrameRef.current = now;

    const anchorTime = (candles.at(-1)?.time ?? (Math.floor(Date.now() / 1000) as UTCTimestamp));
    bidDepthSeriesRef.current?.setData(depthToAreaData(bids, anchorTime));
    askDepthSeriesRef.current?.setData(depthToAreaData(asks, anchorTime));
  }, [bids, asks, candles, depthUpdateFps]);

  return (
    <div className="tradechart">
      <div className="tradechart__header">
        <span className="tradechart__mid">
          {mid !== null ? mid.toFixed(4) : "—"}
        </span>
      </div>
      <div ref={containerRef} className="tradechart__canvas" />
    </div>
  );
}
