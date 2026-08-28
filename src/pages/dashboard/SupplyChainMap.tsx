// src/pages/dashboard/SupplyChainMap.tsx
import React, { useEffect, useState } from "react";
import TierTreeView from "../../components/supplychain/TierTreeView";
import { ancestorIds } from "../../utils/treeFlattener";
import type { SupplyChainTier } from "../../types/supplychain";

interface SupplyChainMapProps {
  /** injected for testability; defaults to a real fetch against the API */
  fetchTiers?: () => Promise<SupplyChainTier[]>;
  /** optional tier id to scroll/expand to on load, e.g. from a search result */
  focusTierId?: string;
}

async function defaultFetchTiers(): Promise<SupplyChainTier[]> {
  const res = await fetch("/api/v1/supplychain/tiers");
  if (!res.ok) throw new Error(`Failed to load supply chain tiers: ${res.status}`);
  return res.json();
}

export default function SupplyChainMap({
  fetchTiers = defaultFetchTiers,
  focusTierId,
}: SupplyChainMapProps) {
  const [tiers, setTiers] = useState<SupplyChainTier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [defaultExpandedIds, setDefaultExpandedIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetchTiers()
      .then((data) => {
        if (cancelled) return;
        setTiers(data);
        if (focusTierId) {
          setDefaultExpandedIds(ancestorIds(data, focusTierId));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load supply chain data.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchTiers, focusTierId]);

  if (error) {
    return (
      <div className="supplychain-map supplychain-map--error">
        <p>{error}</p>
      </div>
    );
  }

  if (!tiers) {
    return (
      <div className="supplychain-map supplychain-map--loading">
        <p>Loading supply chain map…</p>
      </div>
    );
  }

  return (
    <div className="supplychain-map">
      <header className="supplychain-map__header">
        <h1>Supply chain map</h1>
      </header>
      <TierTreeView tiers={tiers} defaultExpandedIds={defaultExpandedIds} />
    </div>
  );
}
