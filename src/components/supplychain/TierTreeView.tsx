// src/components/supplychain/TierTreeView.tsx
import React, { useCallback, useMemo, useRef, useState } from "react";
import { useTierVirtualizer } from "../../hooks/useVirtualizer";
import { flattenTree } from "../../utils/treeFlattener";
import type { SupplyChainTier } from "../../types/supplychain";
import TierRow from "./TierRow";
import "./TierTreeView.css";

interface TierTreeViewProps {
  tiers: SupplyChainTier[];
  /** ids expanded by default, e.g. to open a path down to a searched node */
  defaultExpandedIds?: string[];
}

export default function TierTreeView({ tiers, defaultExpandedIds = [] }: TierTreeViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(defaultExpandedIds)
  );

  // Re-flattening on every expand/collapse is intentionally cheap: it's an
  // O(visible-after-expansion) walk, not O(whole tree), since collapsed
  // subtrees are skipped entirely rather than flattened-then-hidden.
  const flatTiers = useMemo(() => flattenTree(tiers, expandedIds), [tiers, expandedIds]);

  const { virtualItems, totalSize, measureElement, scrollToIndex } = useTierVirtualizer({
    flatTiers,
    scrollContainerRef,
  });

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div className="tier-tree-view">
      <div className="tier-tree-view__toolbar">
        <span>{flatTiers.length.toLocaleString()} visible tiers</span>
        <button
          type="button"
          className="tier-tree-view__scroll-top"
          onClick={() => scrollToIndex(0, { align: "start" })}
        >
          Scroll to top
        </button>
      </div>

      <div ref={scrollContainerRef} className="tier-tree-view__scroll-container">
        <div
          className="tier-tree-view__spacer"
          style={{ height: `${totalSize}px` }}
        >
          {virtualItems.map((virtualItem) => {
            const flatTier = flatTiers[virtualItem.index];
            if (!flatTier) return null;

            return (
              <TierRow
                key={virtualItem.key}
                flatTier={flatTier}
                onToggleExpand={handleToggleExpand}
                measureElement={measureElement}
                translateY={virtualItem.start}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
