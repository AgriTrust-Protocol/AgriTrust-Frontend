// src/hooks/useVirtualScroller.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RowHeightEstimator, measureAndApply } from "../utils/rowHeightEstimator";

export interface VirtualItem {
  index: number;
  style: {
    position: "absolute";
    top: 0;
    left: 0;
    width: "100%";
    transform: string;
  };
}

export interface UseVirtualScrollerOptions {
  totalCount: number;
  /** initial per-row estimate in px before anything is measured (default 64) */
  estimatedHeight?: number;
  /** rows rendered above/below the visible window (default 5, per spec) */
  overscan?: number;
  alpha?: number;
  /** fires when the user scrolls within one viewport height of the bottom */
  onLoadMoreNext?: () => void;
  /** fires when the user scrolls within one viewport height of the top */
  onLoadMorePrevious?: () => void;
}

export interface UseVirtualScrollerResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  totalHeight: number;
  getVirtualItems: () => VirtualItem[];
  measureElement: (index: number) => (el: Element | null) => void;
  /**
   * Call after prepending `count` items to the front of the data array, in
   * the SAME render that updates totalCount. Keeps the user's visual scroll
   * position stable by shifting scrollTop by exactly the height the new
   * leading rows occupy, so prepending never causes a visible jump.
   */
  onItemsPrepended: (count: number) => void;
  /** Call after totalCount grows from appending (forward loading). */
  onItemsAppended: (newTotalCount: number) => void;
}

const SCROLL_DEBOUNCE_MS = 16; // aligned to a single animation frame at 60fps
const LOAD_MORE_THRESHOLD_VIEWPORTS = 1;

export function useVirtualScroller({
  totalCount,
  estimatedHeight = 64,
  overscan = 5,
  alpha = 0.3,
  onLoadMoreNext,
  onLoadMorePrevious,
}: UseVirtualScrollerOptions): UseVirtualScrollerResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const estimatorRef = useRef<RowHeightEstimator>(
    new RowHeightEstimator(totalCount, estimatedHeight, alpha)
  );

  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [, forceRender] = useState(0);

  const rafRef = useRef<number | null>(null);
  const lastScrollDispatchRef = useRef(0);
  const loadingNextRef = useRef(false);
  const loadingPreviousRef = useRef(false);

  // Track container size so visible-range math has a real viewport height.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerHeight(entry.contentRect.height);
    });
    observer.observe(el);
    setContainerHeight(el.clientHeight);

    return () => observer.disconnect();
  }, []);

  // rAF-aligned scroll handling: at most one state update per ~16ms, so a
  // burst of native scroll events (which can fire far more often than 60/s)
  // doesn't trigger more re-renders than the display can actually show.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleScroll() {
      const now = performance.now();
      if (now - lastScrollDispatchRef.current < SCROLL_DEBOUNCE_MS) {
        if (rafRef.current !== null) return;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          lastScrollDispatchRef.current = performance.now();
          setScrollTop(el!.scrollTop);
        });
        return;
      }
      lastScrollDispatchRef.current = now;
      setScrollTop(el!.scrollTop);
    }

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Keep the estimator sized to totalCount. Growing (append) is handled
  // here automatically; prepend must go through onItemsPrepended instead,
  // since a prepend needs the scroll-position compensation below.
  useEffect(() => {
    if (totalCount > estimatorRef.current.size) {
      estimatorRef.current.resize(totalCount);
    }
  }, [totalCount]);

  // Bidirectional infinite-load triggers, checked against the current
  // scroll position rather than on every render.
  useEffect(() => {
    const estimator = estimatorRef.current;
    const total = estimator.totalHeight();

    const nearBottom =
      total - (scrollTop + containerHeight) < containerHeight * LOAD_MORE_THRESHOLD_VIEWPORTS;
    const nearTop = scrollTop < containerHeight * LOAD_MORE_THRESHOLD_VIEWPORTS;

    if (nearBottom && !loadingNextRef.current && onLoadMoreNext) {
      loadingNextRef.current = true;
      Promise.resolve(onLoadMoreNext()).finally(() => {
        loadingNextRef.current = false;
      });
    }

    if (nearTop && !loadingPreviousRef.current && onLoadMorePrevious) {
      loadingPreviousRef.current = true;
      Promise.resolve(onLoadMorePrevious()).finally(() => {
        loadingPreviousRef.current = false;
      });
    }
  }, [scrollTop, containerHeight, onLoadMoreNext, onLoadMorePrevious]);

  const getVirtualItems = useCallback((): VirtualItem[] => {
    const estimator = estimatorRef.current;
    if (estimator.size === 0 || containerHeight === 0) return [];

    const startIndex = Math.max(0, estimator.indexAtOffset(scrollTop) - overscan);
    const endOffset = scrollTop + containerHeight;
    let endIndex = estimator.indexAtOffset(endOffset) + overscan;
    endIndex = Math.min(estimator.size - 1, endIndex);

    const items: VirtualItem[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      items.push({
        index: i,
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          transform: `translateY(${estimator.offsetOf(i)}px)`,
        },
      });
    }
    return items;
  }, [scrollTop, containerHeight, overscan]);

  const measureElement = useCallback(
    (index: number) => (el: Element | null) => {
      if (!el) return;
      const before = estimatorRef.current.getEstimate(index);
      measureAndApply(estimatorRef.current, index, el);
      const after = estimatorRef.current.getEstimate(index);
      // Only force a re-render if the measurement actually changed the
      // estimate enough to matter — avoids a render storm while 40+ rows
      // all mount and measure themselves in the same frame.
      if (Math.abs(after - before) > 0.5) {
        forceRender((n) => n + 1);
      }
    },
    []
  );

  const onItemsPrepended = useCallback((count: number) => {
    const el = containerRef.current;
    if (!el || count <= 0) return;

    const estimator = estimatorRef.current;
    // Height the new leading rows will occupy, based on the default
    // estimate (they haven't been measured yet, since they don't exist in
    // the DOM until after this call).
    const addedHeight = count * estimatedHeight;

    estimator.prepend(count);

    // Shift scrollTop by exactly the height that was inserted above the
    // current view, so the rows the user was already looking at stay in
    // the same visual position — this is the "scroll position integrity"
    // requirement from the spec.
    el.scrollTop = el.scrollTop + addedHeight;
    setScrollTop(el.scrollTop);
  }, [estimatedHeight]);

  const onItemsAppended = useCallback((newTotalCount: number) => {
    estimatorRef.current.resize(newTotalCount);
    forceRender((n) => n + 1);
  }, []);

  const totalHeight = useMemo(
    () => estimatorRef.current.totalHeight(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally
    // recomputed whenever scroll or count changes, since the estimator's
    // internal state isn't itself reactive.
    [scrollTop, totalCount]
  );

  return {
    containerRef,
    totalHeight,
    getVirtualItems,
    measureElement,
    onItemsPrepended,
    onItemsAppended,
  };
}
