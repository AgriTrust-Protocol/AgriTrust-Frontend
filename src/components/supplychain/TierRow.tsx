// src/components/supplychain/TierRow.tsx
import React from "react";
import type { FlatTier } from "../../types/supplychain";
import "./TierRow.css";

interface TierRowProps {
  flatTier: FlatTier;
  onToggleExpand: (id: string) => void;
  measureElement?: (el: Element | null) => void;
  /** absolute offset from the top of the virtualized list, in px */
  translateY: number;
}

const ROLE_LABEL: Record<string, string> = {
  producer: "Producer",
  processor: "Processor",
  distributor: "Distributor",
  retailer: "Retailer",
};

export default function TierRow({
  flatTier,
  onToggleExpand,
  measureElement,
  translateY,
}: TierRowProps) {
  const { tier, depth, hasChildren, isExpanded } = flatTier;

  return (
    <div
      ref={measureElement}
      data-index={flatTier.index}
      className="tier-row"
      style={{ transform: `translateY(${translateY}px)` }}
    >
      <div
        className="tier-row__content"
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className={`tier-row__toggle ${isExpanded ? "is-expanded" : ""}`}
            onClick={() => onToggleExpand(tier.id)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? `Collapse ${tier.name}` : `Expand ${tier.name}`}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path d="M4 2 L12 8 L4 14 Z" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <span className="tier-row__toggle-spacer" aria-hidden="true" />
        )}

        <span className={`tier-row__role tier-row__role--${tier.role}`}>
          {ROLE_LABEL[tier.role] ?? tier.role}
        </span>
        <span className="tier-row__name">{tier.name}</span>

        {tier.metadata && (
          <div className="tier-row__meta">
            {Object.entries(tier.metadata).map(([key, value]) => (
              <span key={key} className="tier-row__meta-item">
                <span className="tier-row__meta-key">{key}</span>
                <span className="tier-row__meta-value">{String(value)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Animated expand/collapse "shadow" content: a grid track that
          transitions 0fr -> 1fr, per the spec's CSS grid-template-rows
          approach. The actual children are separate virtualized rows —
          this is purely a visual transition cue on the row being toggled,
          not a container for the child rows themselves. */}
      <div className={`tier-row__collapse-hint ${isExpanded ? "is-open" : ""}`}>
        <div className="tier-row__collapse-hint-inner" />
      </div>
    </div>
  );
}
