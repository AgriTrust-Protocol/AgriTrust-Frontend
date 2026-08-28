// src/utils/treeFlattener.test.ts
import { describe, expect, it } from "vitest";
import { ancestorIds, countAllNodes, flattenTree } from "./treeFlattener";
import type { SupplyChainTier } from "../types/supplychain";

function buildTier(id: string, children: SupplyChainTier[] = []): SupplyChainTier {
  return { id, name: id, role: "producer", children };
}

/** Builds a tree `depth` levels deep with `branching` children per node. */
function buildDeepTree(depth: number, branching: number, prefix = "n"): SupplyChainTier {
  if (depth === 0) return buildTier(prefix);
  const children = Array.from({ length: branching }, (_, i) =>
    buildDeepTree(depth - 1, branching, `${prefix}-${i}`)
  );
  return buildTier(prefix, children);
}

describe("flattenTree", () => {
  it("returns only root nodes when nothing is expanded", () => {
    const tree = [buildTier("a", [buildTier("a1")]), buildTier("b")];
    const flat = flattenTree(tree, new Set());
    expect(flat.map((f) => f.tier.id)).toEqual(["a", "b"]);
    expect(flat[0].hasChildren).toBe(true);
    expect(flat[0].isExpanded).toBe(false);
  });

  it("includes children only for expanded nodes, preserving order", () => {
    const tree = [
      buildTier("a", [buildTier("a1"), buildTier("a2")]),
      buildTier("b", [buildTier("b1")]),
    ];
    const flat = flattenTree(tree, new Set(["a"]));
    expect(flat.map((f) => f.tier.id)).toEqual(["a", "a1", "a2", "b"]);
  });

  it("sets correct depth and parentIndex for nested expansion", () => {
    const tree = [buildTier("a", [buildTier("a1", [buildTier("a1x")])])];
    const flat = flattenTree(tree, new Set(["a", "a1"]));

    const a = flat.find((f) => f.tier.id === "a")!;
    const a1 = flat.find((f) => f.tier.id === "a1")!;
    const a1x = flat.find((f) => f.tier.id === "a1x")!;

    expect(a.depth).toBe(0);
    expect(a.parentIndex).toBeNull();
    expect(a1.depth).toBe(1);
    expect(a1.parentIndex).toBe(a.index);
    expect(a1x.depth).toBe(2);
    expect(a1x.parentIndex).toBe(a1.index);
  });

  it("collapsing a node removes its descendants from the flattened list", () => {
    const tree = [buildTier("a", [buildTier("a1", [buildTier("a1x")])])];
    const expandedBoth = flattenTree(tree, new Set(["a", "a1"]));
    const collapsedChild = flattenTree(tree, new Set(["a"])); // a1 collapsed

    expect(expandedBoth).toHaveLength(3);
    expect(collapsedChild.map((f) => f.tier.id)).toEqual(["a", "a1"]);
  });

  it("handles >= 10,000 nodes without exceeding a reasonable time budget", () => {
    // 4 levels deep, branching factor 10 => 1 + 10 + 100 + 1000 + 10000 = 11,111 nodes
    const tree = [buildDeepTree(4, 10)];
    const total = countAllNodes(tree);
    expect(total).toBeGreaterThanOrEqual(10_000);

    // Expand every node so all 11,111 rows are flattened at once — the
    // worst case the virtualizer's underlying data structure has to handle.
    const allIds = new Set<string>();
    (function collectIds(nodes: SupplyChainTier[]) {
      for (const n of nodes) {
        if (n.children && n.children.length > 0) allIds.add(n.id);
        if (n.children) collectIds(n.children);
      }
    })(tree);

    const start = performance.now();
    const flat = flattenTree(tree, allIds);
    const elapsed = performance.now() - start;

    expect(flat.length).toBe(total);
    // Generous budget for a CI machine; a real flatten of 11k nodes should
    // take low single-digit milliseconds.
    expect(elapsed).toBeLessThan(200);
  });

  it("stays stack-safe on very deep (not just wide) trees", () => {
    // 5000 levels deep, branching factor 1 — would blow a naive recursive
    // call stack in most JS engines (default limits are usually a few
    // thousand frames). Collect every id along the single chain and expand
    // all of them so flattenTree has to walk the full depth.
    const depth = 5000;
    const deep = buildDeepTree(depth, 1);

    const idsAlongChain = new Set<string>();
    let cursor: SupplyChainTier | undefined = deep;
    while (cursor && cursor.children && cursor.children.length > 0) {
      idsAlongChain.add(cursor.id);
      cursor = cursor.children[0];
    }

    let flat: ReturnType<typeof flattenTree> = [];
    expect(() => {
      flat = flattenTree([deep], idsAlongChain);
    }).not.toThrow();
    expect(flat.length).toBe(depth + 1);
  });
});

describe("countAllNodes", () => {
  it("counts every node regardless of expand state", () => {
    const tree = [buildTier("a", [buildTier("a1"), buildTier("a2", [buildTier("a2x")])])];
    expect(countAllNodes(tree)).toBe(4);
  });
});

describe("ancestorIds", () => {
  it("returns the path of ancestor ids down to (but excluding) the target", () => {
    const tree = [buildTier("a", [buildTier("a1", [buildTier("a1x")])])];
    expect(ancestorIds(tree, "a1x")).toEqual(["a", "a1"]);
  });

  it("returns an empty path for a root-level target", () => {
    const tree = [buildTier("a")];
    expect(ancestorIds(tree, "a")).toEqual([]);
  });
});
