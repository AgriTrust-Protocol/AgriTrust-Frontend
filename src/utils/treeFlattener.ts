// src/utils/treeFlattener.ts
import type { FlatTier, SupplyChainTier } from "../types/supplychain";

/**
 * Flattens a recursive SupplyChainTier[] into an indexed FlatTier[],
 * skipping the children of any node whose id is NOT in `expandedIds` —
 * i.e. collapsed subtrees never even make it into the flattened array, so
 * the virtualizer never has to know about nodes that aren't visible.
 *
 * This is a pure function with no React/virtualization dependency, kept
 * deliberately separate so it can be unit-tested (including at 10,000+
 * node scale) without touching a DOM.
 */
export function flattenTree(
  roots: SupplyChainTier[],
  expandedIds: ReadonlySet<string>
): FlatTier[] {
  const flat: FlatTier[] = [];

  // Iterative stack-based walk rather than recursive calls — with 8+ tiers
  // and potentially thousands of siblings per tier, a recursive walk risks
  // call-stack depth issues; a stack keeps this O(n) and stack-safe.
  type StackEntry = { tier: SupplyChainTier; depth: number; parentIndex: number | null };
  const stack: StackEntry[] = [];

  // Push roots in reverse so they pop in original order.
  for (let i = roots.length - 1; i >= 0; i--) {
    stack.push({ tier: roots[i], depth: 0, parentIndex: null });
  }

  while (stack.length > 0) {
    const { tier, depth, parentIndex } = stack.pop()!;
    const hasChildren = !!tier.children && tier.children.length > 0;
    const isExpanded = hasChildren && expandedIds.has(tier.id);

    const currentIndex = flat.length;
    flat.push({
      index: currentIndex,
      tier,
      depth,
      parentIndex,
      hasChildren,
      isExpanded,
    });

    if (isExpanded && tier.children) {
      for (let i = tier.children.length - 1; i >= 0; i--) {
        stack.push({ tier: tier.children[i], depth: depth + 1, parentIndex: currentIndex });
      }
    }
  }

  return flat;
}

/** Total node count across the whole tree, expanded or not — useful for the memory-budget check. */
export function countAllNodes(roots: SupplyChainTier[]): number {
  let count = 0;
  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    count += 1;
    if (node.children) stack.push(...node.children);
  }
  return count;
}

/** All ancestor ids of a given tier id — used to expand a path down to a specific node (e.g. search result). */
export function ancestorIds(roots: SupplyChainTier[], targetId: string): string[] {
  const path: string[] = [];

  function walk(nodes: SupplyChainTier[], trail: string[]): boolean {
    for (const node of nodes) {
      if (node.id === targetId) {
        path.push(...trail);
        return true;
      }
      if (node.children && walk(node.children, [...trail, node.id])) {
        return true;
      }
    }
    return false;
  }

  walk(roots, []);
  return path;
}
