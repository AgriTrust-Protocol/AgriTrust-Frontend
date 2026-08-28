// src/hooks/useVirtualizer.ts
import { useMemo, type RefObject } from "react";
import { useVirtualizer as useTanstackVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import type { FlatTier } from "../types/supplychain";

const VISIBLE_WINDOW = 20;
const OVERSCAN = 10;
/** Fallback row height before a row has actually been measured (px). */
const ESTIMATED_ROW_HEIGHT = 44;

export interface UseTierVirtualizerOptions {
  flatTiers: FlatTier[];
  scrollContainerRef: RefObject<HTMLElement | null>;
  /** override the default estimate, e.g. if most rows are known to be taller */
  estimateSize?: (index: number) => number;
}

export interface UseTierVirtualizerResult {
  virtualItems: VirtualItem[];
  totalSize: number;
  measureElement: (el: Element | null) => void;
  scrollToIndex: (index: number, opts?: { align?: "start" | "center" | "end" }) => void;
}

/**
 * Thin wrapper around @tanstack/react-virtual configured for the tier tree:
 * a fixed 20-row visible window with 10 rows overscanned above/below (per
 * the spec), dynamic per-row measurement (rows vary in height depending on
 * how much metadata a tier has), and keyed by tier id rather than array
 * index so expand/collapse doesn't scramble measured heights.
 *
 * Keeping this as its own hook (rather than calling useVirtualizer directly
 * in TierTreeView) means the 20/10 window tuning and measurement strategy
 * live in exactly one place.
 */
export function useTierVirtualizer({
  flatTiers,
  scrollContainerRef,
  estimateSize,
}: UseTierVirtualizerOptions): UseTierVirtualizerResult {
  const virtualizer = useTanstackVirtualizer({
    count: flatTiers.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: estimateSize ?? (() => ESTIMATED_ROW_HEIGHT),
    overscan: OVERSCAN,
    // Stable per-tier keys mean React and the virtualizer don't re-measure
    // (or worse, misattribute a measured height to the wrong row) when rows
    // above an expand/collapse point shift index.
    getItemKey: (index) => flatTiers[index]?.tier.id ?? index,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return useMemo(
    () => ({
      virtualItems,
      totalSize: virtualizer.getTotalSize(),
      measureElement: virtualizer.measureElement,
      scrollToIndex: (index, opts) => virtualizer.scrollToIndex(index, opts),
    }),
    // virtualItems is a new array each render by design (tanstack recomputes
    // it off scroll position), so it's the right dependency to key off of;
    // virtualizer itself is referentially stable across renders.
    [virtualItems, virtualizer]
  );
}

export const TIER_VIRTUALIZER_CONFIG = {
  visibleWindow: VISIBLE_WINDOW,
  overscan: OVERSCAN,
  estimatedRowHeight: ESTIMATED_ROW_HEIGHT,
};
