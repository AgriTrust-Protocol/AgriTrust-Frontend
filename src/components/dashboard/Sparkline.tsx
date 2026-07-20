"use client";

/**
 * SVG sparkline mini-chart component.
 *
 * Renders a compact 7-day trend line from an array of numeric data points.
 * Color-coded: green for upward trend, red for downward, gray for flat.
 * Lightweight: pure SVG, no canvas or chart library dependency.
 */

import { useMemo, useId } from "react";

export interface SparklineProps {
  /** Array of numeric data points (typically 7 for a week). */
  data: number[];
  /** Width of the sparkline in pixels. */
  width?: number;
  /** Height of the sparkline in pixels. */
  height?: number;
  /** Stroke color override (defaults to trend-based green/red/gray). */
  color?: string;
  /** Line stroke width. */
  strokeWidth?: number;
  /** CSS class for the wrapper. */
  className?: string;
}

export function Sparkline({
  data,
  width = 80,
  height = 24,
  color,
  strokeWidth = 1.5,
  className = "",
}: SparklineProps) {
  const gradientId = useId();

  const { pathD, trendColor } = useMemo(() => {
    if (data.length < 2) {
      return { pathD: null, trendColor: "#9ca3af" }; // gray-400
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1; // Avoid division by zero

    // Build SVG path
    const points = data.map((value, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    });

    const pathD = `M${points.join(" L")}`;

    // Trend direction based on first vs last
    const first = data[0];
    const last = data[data.length - 1];
    const trendColor =
      last > first ? "#10b981" : last < first ? "#ef4444" : "#9ca3af";

    return { pathD, trendColor };
  }, [data, width, height]);

  const strokeColor = color ?? trendColor;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-label="Sparkline chart"
      role="img"
    >
      {pathD ? (
        <>
          {/* Gradient fill below the line */}
          <defs>
            <linearGradient id={`sparkline-fill-${gradientId}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.2" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Fill area */}
          <path
            d={`${pathD} L${width},${height} L0,${height} Z`}
            fill={`url(#sparkline-fill-${gradientId})`}
          />
          {/* Stroke line */}
          <path
            d={pathD}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Dot at the end */}
          {data.length > 0 && (
            <circle
              cx={(width / (data.length - 1)) * (data.length - 1)}
              cy={
                height -
                ((data[data.length - 1] - Math.min(...data)) /
                  (Math.max(...data) - Math.min(...data) || 1)) *
                  height
              }
              r={2}
              fill={strokeColor}
            />
          )}
        </>
      ) : (
        // Flat line for single/empty data
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray="2 2"
        />
      )}
    </svg>
  );
}
