"use client";

/**
 * Minimal fixed-size virtual scroller for high-volume feeds.
 *
 * Renders only the rows intersecting the viewport (plus `overscan`
 * padding) inside an absolutely-positioned spacer, keeping the DOM small
 * for lists that grow into the hundreds of entries during certification
 * sprints. Row height is fixed and supplied by the caller, so windowing
 * math is pure arithmetic with no runtime measurements.
 */

import { useState, type ReactNode } from "react";

export interface VirtualListProps<T> {
  items: readonly T[];
  /** Fixed row height in px. */
  itemHeight: number;
  /** Viewport height in px. Pass `items.length * itemHeight` to render everything (tests). */
  height: number;
  /** Extra rows rendered above/below the viewport. Default 3. */
  overscan?: number;
  getItemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
}

export function VirtualList<T>({
  items,
  itemHeight,
  height,
  overscan = 3,
  getItemKey,
  renderItem,
  className = "",
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);

  const firstVisible = Math.floor(scrollTop / itemHeight);
  const startIndex = Math.max(0, firstVisible - overscan);
  const visibleCount = Math.ceil(height / itemHeight) + 1;
  const endIndex = Math.min(items.length, firstVisible + visibleCount + overscan);

  const slice = items.slice(startIndex, endIndex);

  return (
    <div
      role="list"
      data-testid="virtual-list"
      className={`overflow-y-auto ${className}`}
      style={{ height }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * itemHeight, position: "relative" }}>
        <div style={{ transform: `translateY(${startIndex * itemHeight}px)` }}>
          {slice.map((item, offset) => {
            const index = startIndex + offset;
            return (
              <div
                role="listitem"
                key={getItemKey(item, index)}
                style={{ height: itemHeight }}
              >
                {renderItem(item, index)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
