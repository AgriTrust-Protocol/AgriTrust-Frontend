import { Edge, Node } from '@xyflow/react';

export interface LineageHighlightResult {
  highlightedNodeIds: Set<string>;
  highlightedEdgeIds: Set<string>;
  upstreamCount: number;
  downstreamCount: number;
}

export function getConnectedLineage(
  selectedNodeId: string | null,
  nodes: Node[],
  edges: Edge[]
): LineageHighlightResult {
  if (!selectedNodeId) {
    return {
      highlightedNodeIds: new Set(),
      highlightedEdgeIds: new Set(),
      upstreamCount: 0,
      downstreamCount: 0,
    };
  }

  const upstreamNodeIds = new Set<string>();
  const downstreamNodeIds = new Set<string>();
  const highlightedEdgeIds = new Set<string>();

  const incomingEdgesByTarget = new Map<string, Edge[]>();
  const outgoingEdgesBySource = new Map<string, Edge[]>();

  for (const edge of edges) {
    if (!incomingEdgesByTarget.has(edge.target)) {
      incomingEdgesByTarget.set(edge.target, []);
    }
    incomingEdgesByTarget.get(edge.target)!.push(edge);

    if (!outgoingEdgesBySource.has(edge.source)) {
      outgoingEdgesBySource.set(edge.source, []);
    }
    outgoingEdgesBySource.get(edge.source)!.push(edge);
  }

  const upstreamQueue: string[] = [selectedNodeId];
  while (upstreamQueue.length > 0) {
    const currentId = upstreamQueue.shift()!;
    const incoming = incomingEdgesByTarget.get(currentId) || [];

    for (const edge of incoming) {
      highlightedEdgeIds.add(edge.id);
      if (!upstreamNodeIds.has(edge.source) && edge.source !== selectedNodeId) {
        upstreamNodeIds.add(edge.source);
        upstreamQueue.push(edge.source);
      }
    }
  }

  const downstreamQueue: string[] = [selectedNodeId];
  while (downstreamQueue.length > 0) {
    const currentId = downstreamQueue.shift()!;
    const outgoing = outgoingEdgesBySource.get(currentId) || [];

    for (const edge of outgoing) {
      highlightedEdgeIds.add(edge.id);
      if (!downstreamNodeIds.has(edge.target) && edge.target !== selectedNodeId) {
        downstreamNodeIds.add(edge.target);
        downstreamQueue.push(edge.target);
      }
    }
  }

  const highlightedNodeIds = new Set<string>([
    selectedNodeId,
    ...upstreamNodeIds,
    ...downstreamNodeIds,
  ]);

  return {
    highlightedNodeIds,
    highlightedEdgeIds,
    upstreamCount: upstreamNodeIds.size,
    downstreamCount: downstreamNodeIds.size,
  };
}
