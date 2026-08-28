// src/types/supplychain.ts

export type TierRole = "producer" | "processor" | "distributor" | "retailer" | string;

export interface SupplyChainTier {
  id: string;
  name: string;
  role: TierRole;
  /** free-form fields shown in the row — location, cert status, volume, etc. */
  metadata?: Record<string, string | number>;
  children?: SupplyChainTier[];
}

/**
 * A single flattened row ready for virtualization: the recursive tree
 * collapsed into an indexed array, with enough metadata (depth, parent,
 * whether it has children) that a row component never needs to walk the
 * tree itself.
 */
export interface FlatTier {
  /** index into the flattened array — stable for a given expand/collapse state */
  index: number;
  tier: SupplyChainTier;
  depth: number;
  /** index of the parent row in the SAME flattened array, or null for roots */
  parentIndex: number | null;
  hasChildren: boolean;
  /** convenience flag so a row can render its own expand affordance without a Set lookup */
  isExpanded: boolean;
}
