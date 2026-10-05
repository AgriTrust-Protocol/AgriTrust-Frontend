"use client";

// React Flow ships no stylesheet by default; without this import the canvas
// renders with unstyled nodes, handles and controls.
import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  AlertTriangle,
  ArrowRightLeft,
  BadgeCheck,
  Boxes,
  FileCheck2,
  Loader2,
  Radar,
  Server,
  Sprout,
  Unplug,
} from "lucide-react";

import type {
  IntegrityReport,
  LineageSource,
} from "@/lib/AgriTrustLineageService";
import { fetchLineage, verifyGraphIntegrity } from "@/lib/AgriTrustLineageService";
import type { ProvenanceGraph, ProvenanceNode, ProvenanceNodeKind } from "@/lib/types";
import { formatInstant, formatMass, shortHash } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/*  Visual language                                                           */
/* -------------------------------------------------------------------------- */

const KIND_THEME: Record<
  ProvenanceNodeKind,
  { border: string; bg: string; text: string; Icon: typeof Sprout; label: string }
> = {
  Asset: {
    border: "border-sky/50",
    bg: "bg-sky/10",
    text: "text-sky",
    Icon: Boxes,
    label: "Asset",
  },
  Process: {
    border: "border-leaf/50",
    bg: "bg-leaf/10",
    text: "text-leaf",
    Icon: Sprout,
    label: "Process",
  },
  Observation: {
    border: "border-violet/50",
    bg: "bg-violet/10",
    text: "text-violet",
    Icon: Radar,
    label: "Observation",
  },
  Certificate: {
    border: "border-clay/50",
    bg: "bg-clay/10",
    text: "text-clay",
    Icon: FileCheck2,
    label: "Certificate",
  },
};

const EDGE_THEME = {
  aggregatedInto: { color: "#34d399", dash: undefined, animated: true },
  transformedBy: { color: "#34d399", dash: undefined, animated: true },
  producedBy: { color: "#38bdf8", dash: "6 4", animated: false },
  observedBy: { color: "#a78bfa", dash: "2 4", animated: false },
  certifiedBy: { color: "#f59e0b", dash: undefined, animated: false },
} as const;

/* -------------------------------------------------------------------------- */
/*  Deterministic layered layout                                              */
/* -------------------------------------------------------------------------- */

const COLUMN_WIDTH = 280;
const CHAIN_Y = 360;
const EVIDENCE_Y = 40;

/**
 * Assign coordinates from the node's role in the graph.
 *
 * The chain (`:Asset` through `:Process`) is laid out left to right and evidence
 * (`:Observation`, `:Certificate`) is placed above the node it attests to, which
 * keeps the harvest → cooperative → mill → port reading order intact.
 */
function layoutGraph(graph: ProvenanceGraph): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const chain = graph.nodes.filter(
    (node) => node.kind === "Asset" || node.kind === "Process",
  );
  const evidence = graph.nodes.filter(
    (node) => node.kind === "Observation" || node.kind === "Certificate",
  );

  chain.forEach((node, index) => {
    positions.set(node.id, { x: index * COLUMN_WIDTH + 120, y: CHAIN_Y });
  });

  // Bucket evidence by the node each statement points at.
  const perSubject = new Map<string, ProvenanceNode[]>();
  for (const node of evidence) {
    const subject = graph.edges.find(
      (edge) => edge.source === node.id && edge.target !== node.id,
    )?.target;
    if (subject === undefined) continue;

    const bucket = perSubject.get(subject) ?? [];
    bucket.push(node);
    perSubject.set(subject, bucket);
  }

  for (const [subjectId, bucket] of perSubject) {
    const subjectPosition = positions.get(subjectId);
    if (subjectPosition === undefined) continue;

    bucket.forEach((node, index) => {
      positions.set(node.id, {
        x: subjectPosition.x - 90 + index * (COLUMN_WIDTH - 30),
        y: EVIDENCE_Y,
      });
    });
  }

  // Any node the bucketing missed still needs a slot so it cannot overlap.
  for (const node of graph.nodes) {
    if (positions.has(node.id)) continue;
    positions.set(node.id, { x: 40, y: CHAIN_Y + 380 + evidence.length * 20 });
  }

  return positions;
}

/* -------------------------------------------------------------------------- */
/*  Custom node                                                               */
/* -------------------------------------------------------------------------- */

type ProvenanceNodeData = {
  record: ProvenanceNode;
  compromised: boolean;
};

type FlowNode = Node<ProvenanceNodeData, "provenance">;

function ProvenanceCard({ data, selected }: NodeProps<FlowNode>) {
  const { record, compromised } = data;
  const theme = KIND_THEME[record.kind];
  const { Icon } = theme;

  return (
    <div
      className={`w-56 rounded-xl border bg-surface-2/95 px-3 py-2.5 shadow-lg shadow-black/40 backdrop-blur transition-colors ${
        compromised ? "border-rose/60" : theme.border
      } ${selected ? "ring-2 ring-sky/70" : ""}`}
    >
      {/* Evidence points travel downward into the statement they support. */}
      <Handle
        id="out-bottom"
        type="source"
        position={Position.Bottom}
        className="!bg-ink-faint"
      />
      <Handle id="in-top" type="target" position={Position.Top} className="!bg-ink-faint" />
      <Handle id="in-bottom" type="target" position={Position.Bottom} className="!bg-ink-faint" />

      <div className="flex items-start gap-2">
        <span className={`grid size-6 shrink-0 place-items-center rounded-md ${theme.bg}`}>
          <Icon className={`size-3.5 ${theme.text}`} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-faint">
            {theme.label}
          </p>
          <p className="truncate text-xs font-semibold text-ink" title={record.label}>
            {record.label}
          </p>
        </div>
      </div>

      <dl className="mt-2 space-y-0.5 text-[10px]">
        {record.quantityKg !== undefined && (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-faint">Quantity</dt>
            <dd className="text-ink-muted">{formatMass(record.quantityKg)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-ink-faint">Recorded</dt>
          <dd className="truncate text-ink-muted">{formatInstant(record.timestamp)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-faint">Commitment</dt>
          <dd className="font-mono text-ink-muted">{shortHash(record.hash, 8, 4)}</dd>
        </div>
      </dl>

      <div className="mt-2 flex items-center gap-1.5 border-t border-line pt-2">
        {compromised ? (
          <>
            <AlertTriangle className="size-3 text-rose" aria-hidden="true" />
            <span className="text-[10px] font-medium text-rose">Commitment broken</span>
          </>
        ) : (
          <>
            <BadgeCheck className="size-3 text-leaf" aria-hidden="true" />
            <span className="text-[10px] font-medium text-leaf">In Merkle commitment</span>
          </>
        )}
      </div>
    </div>
  );
}

const NODE_TYPES = { provenance: ProvenanceCard };

/**
 * Flip the final nibble of a commitment so a mutation is visible in the
 * inspector while remaining a well-formed 64-character hex digest.
 */
function mutateCommitment(hash: string): string {
  const last = hash.slice(-1);
  const flipped = last === "0" ? "1" : "0";
  return `${hash.slice(0, -1)}${flipped}`;
}

/* -------------------------------------------------------------------------- */
/*  Viewer                                                                     */
/* -------------------------------------------------------------------------- */

export interface ProvenanceGraphViewerProps {
  /** Rendered immediately; the triplestore refresh replaces it when reachable. */
  readonly initialGraph: ProvenanceGraph;
}

export default function ProvenanceGraphViewer({
  initialGraph,
}: ProvenanceGraphViewerProps) {
  const [graph, setGraph] = useState<ProvenanceGraph>(initialGraph);
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [checking, setChecking] = useState(true);
  const [source, setSource] = useState<LineageSource>("snapshot");
  const [warning, setWarning] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tamperedId, setTamperedId] = useState<string | null>(null);

  // Background refresh against the SPARQL endpoint; the snapshot stays visible
  // until the triplestore actually answers.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result = await fetchLineage({
          assetId: initialGraph.assetId,
          namespace: initialGraph.namespace,
        });
        if (cancelled) return;

        setGraph(result.graph);
        setSource(result.source);
        setWarning(result.warning ?? null);
      } catch {
        if (!cancelled) setSource("snapshot");
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialGraph.assetId, initialGraph.namespace]);

  /**
   * The graph as currently presented, with the demo tamper applied.
   *
   * The mutation has to change the commitment itself, not just a display flag:
   * flipping the low nibble changes the node's Merkle leaf, so the recomputed
   * root genuinely diverges from the value anchored on Soroban.
   */
  const effectiveGraph = useMemo<ProvenanceGraph>(() => {
    if (tamperedId === null) return graph;

    return {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === tamperedId ? { ...node, hash: mutateCommitment(node.hash) } : node,
      ),
    };
  }, [graph, tamperedId]);

  // Re-derive the Merkle commitment whenever the graph or the demo tamper changes.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await verifyGraphIntegrity(effectiveGraph);
      if (!cancelled) setReport(result);
    })();

    return () => {
      cancelled = true;
    };
  }, [effectiveGraph]);

  const verified = report?.verified === true;

  const { nodes, edges } = useMemo(() => {
    const positions = layoutGraph(effectiveGraph);

    const flowNodes: FlowNode[] = effectiveGraph.nodes.map((record) => ({
      id: record.id,
      type: "provenance",
      position: positions.get(record.id) ?? { x: 0, y: 0 },
      data: { record, compromised: tamperedId === record.id || !verified },
      selected: selectedId === record.id,
    }));

    const flowEdges: Edge[] = effectiveGraph.edges.map((record) => {
      const theme = EDGE_THEME[record.kind];
      // The back-reference producedBy edge is routed below the chain so it does
      // not overlap the collinear harvest -> cooperative -> mill -> port links.
      const isBackReference = record.kind === "producedBy";

      return {
        id: record.id,
        source: record.source,
        target: record.target,
        ...(isBackReference ? { sourceHandle: "out-bottom", targetHandle: "in-top" } : {}),
        type: isBackReference ? "smoothstep" : "bezier",
        animated: theme.animated,
        label: record.kind,
        labelStyle: { fill: theme.color, fontSize: 9, fontWeight: 600 },
        labelBgStyle: { fill: "#0c1218", fillOpacity: 0.85 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
        style: {
          stroke: theme.color,
          strokeWidth: 1.6,
          ...(theme.dash !== undefined ? { strokeDasharray: theme.dash } : {}),
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: theme.color, width: 14, height: 14 },
      };
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, [effectiveGraph, selectedId, tamperedId, verified]);

  const selectedNode = useMemo(
    () => effectiveGraph.nodes.find((node) => node.id === selectedId) ?? null,
    [effectiveGraph.nodes, selectedId],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: FlowNode) => {
    setSelectedId((current) => (current === node.id ? null : node.id));
  }, []);

  // Demo control: mutate one node's commitment so the auditor can observe the
  // Merkle root diverge from the value anchored on Soroban.
  const onToggleTamper = useCallback(() => {
    setTamperedId((current) => {
      if (current !== null) return null;
      // Mutate a transformation stage, which is what an auditor would expect a
      // forger to target.
      const target =
        graph.nodes.find((node) => node.kind === "Process") ?? graph.nodes[0] ?? null;
      return target?.id ?? null;
    });
  }, [graph.nodes]);

  return (
    <section className="panel" aria-label="Supply chain provenance graph">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="size-4 text-leaf" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-ink">Provenance Lineage Graph</h2>
          <span className="hidden text-[11px] text-ink-faint sm:inline">
            :Asset · :Process · :Observation · :Certificate
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-ink-muted"
            title={
              source === "triplestore"
                ? "Materialized from the SPARQL endpoint"
                : "Locally cached lineage snapshot"
            }
          >
            {source === "triplestore" ? (
              <Server className="size-3 text-sky" aria-hidden="true" />
            ) : (
              <Unplug className="size-3 text-clay" aria-hidden="true" />
            )}
            {source === "triplestore" ? "SPARQL" : "Snapshot"}
          </span>

          {checking ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-faint">
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              verifying
            </span>
          ) : verified ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-leaf/40 bg-leaf/12 px-2.5 py-1 text-[11px] font-semibold text-leaf">
              <BadgeCheck className="size-3" aria-hidden="true" />
              Tamper-proof
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose/45 bg-rose/12 px-2.5 py-1 text-[11px] font-semibold text-rose">
              <AlertTriangle className="size-3" aria-hidden="true" />
              Integrity failed
            </span>
          )}
        </div>
      </div>

      {/* Merkle commitment banner */}
      <div className="border-b border-line bg-surface-2/60 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
          <span className="text-ink-faint">
            Anchored root
            <span className="ml-2 font-mono text-ink">{shortHash(graph.merkleRoot, 14, 10)}</span>
          </span>
          {report !== null && (
            <>
              <span className="text-ink-faint">
                Recomputed
                <span
                  className={`ml-2 font-mono ${verified ? "text-leaf" : "text-rose"}`}
                >
                  {shortHash(report.recomputedRoot, 14, 10)}
                </span>
              </span>
              <span className="text-ink-faint">
                Leaves
                <span className="ml-2 text-ink-muted">{report.leafCount}</span>
              </span>
            </>
          )}
        </div>

        {report !== null && !verified && (
          <p className="mt-2 flex items-start gap-2 rounded-lg border border-rose/40 bg-rose/10 p-2 text-[11px] text-rose">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {report.reason}
          </p>
        )}

        {warning !== null && (
          <p className="mt-2 flex items-start gap-2 rounded-lg border border-clay/35 bg-clay/8 p-2 text-[11px] text-clay">
            <Unplug className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {warning}
          </p>
        )}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="h-[460px] bg-surface-0/40">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodeClick={onNodeClick}
            onPaneClick={() => setSelectedId(null)}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.3}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
          >
            <Background color="#1e2d38" gap={18} size={1} />
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              maskColor="rgb(7 11 15 / 0.72)"
              nodeColor={(node) => KIND_THEME[(node.data as ProvenanceNodeData).record.kind].text}
              nodeStrokeWidth={0}
            />
          </ReactFlow>
        </div>

        {/* Node inspector */}
        <aside className="thin-scroll max-h-[460px] overflow-y-auto border-t border-line p-4 lg:border-l lg:border-t-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Node inspector
          </h3>

          {selectedNode === null ? (
            <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
              Select a node to inspect its content commitment, provenance actor and
              tamper-evidence status.
            </p>
          ) : (
            <NodeInspector
              record={selectedNode}
              compromised={tamperedId === selectedNode.id || !verified}
            />
          )}

          <div className="mt-5 border-t border-line pt-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Auditor controls
            </h3>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
              Mutate a transformation statement to confirm the graph fails verification
              against the on-ledger commitment.
            </p>
            <button
              type="button"
              onClick={onToggleTamper}
              className={`mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                tamperedId === null
                  ? "border-rose/45 bg-rose/10 text-rose hover:bg-rose/20"
                  : "border-line-strong bg-surface-2 text-ink-muted hover:bg-surface-3"
              }`}
            >
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              {tamperedId === null ? "Simulate tampering" : "Restore commitments"}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function NodeInspector({
  record,
  compromised,
}: {
  readonly record: ProvenanceNode;
  readonly compromised: boolean;
}) {
  const theme = KIND_THEME[record.kind];
  const { Icon } = theme;

  return (
    <div className="mt-2 space-y-3">
      <div className="flex items-start gap-2">
        <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${theme.bg}`}>
          <Icon className={`size-4 ${theme.text}`} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-faint">
            {theme.label}
          </p>
          <p className="text-xs font-semibold leading-snug text-ink">{record.label}</p>
        </div>
      </div>

      <dl className="space-y-1.5 text-[11px]">
        <Row label="IRI" value={record.id} mono breakAll />
        <Row label="Actor" value={record.actor} />
        <Row label="Recorded" value={formatInstant(record.timestamp)} />
        {record.location !== undefined && <Row label="Location" value={record.location} />}
        {record.quantityKg !== undefined && (
          <Row label="Quantity" value={formatMass(record.quantityKg)} />
        )}
      </dl>

      {record.detail !== undefined && (
        <p className="rounded-lg border border-line bg-surface-2 p-2.5 text-[11px] leading-relaxed text-ink-muted">
          {record.detail}
        </p>
      )}

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
          Content commitment
        </p>
        <p className="mt-1 break-all rounded-lg border border-line bg-surface-2 p-2 font-mono text-[10px] text-ink-muted">
          {record.hash}
        </p>
      </div>

      <div
        className={`flex items-center gap-2 rounded-lg border p-2 text-[11px] ${
          compromised
            ? "border-rose/40 bg-rose/10 text-rose"
            : "border-leaf/40 bg-leaf/10 text-leaf"
        }`}
      >
        {compromised ? (
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <BadgeCheck className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        {compromised
          ? "Commitment does not match the anchored Merkle root"
          : "Commitment verified against the anchored Merkle root"}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
  breakAll = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
  readonly breakAll?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-ink-faint">{label}</dt>
      <dd
        className={`min-w-0 text-right text-ink-muted ${mono ? "font-mono text-[10px]" : ""} ${
          breakAll ? "break-all" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}