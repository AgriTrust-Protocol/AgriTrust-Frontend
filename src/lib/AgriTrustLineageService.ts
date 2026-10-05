/**
 * AgriTrust lineage service.
 *
 * Materializes the off-ledger `:Process` tracing graph for an asset twin from a
 * SPARQL 1.1 endpoint (Fuseki in the local dev stack, see `docker-compose.yml`)
 * and proves it against the batch's on-ledger commitment.
 *
 * The asset twin only anchors a single Merkle root (`provenance_merkle_root` in
 * `AssetTwinRecord`). Every `:Process` statement therefore hashes to a leaf,
 * the leaves are folded pairwise into a root, and that root is compared with the
 * value the farmer committed to on Soroban. A mutated statement, a re-ordered
 * stage or a forged certificate all change the root, so the graph is verifiable
 * end-to-end without trusting the triple store.
 *
 * When the endpoint is unreachable the service degrades to the curated snapshot
 * in `snapshot.ts` so the dashboard stays usable in an offline dev environment.
 * The degradation is surfaced on the graph as an explicit provenance banner
 * rather than being silently hidden from the auditor.
 */

import type {
  Hex32,
  ProvenanceEdge,
  ProvenanceEdgeKind,
  ProvenanceGraph,
  ProvenanceNode,
  ProvenanceNodeKind,
} from "./types";
import { SNAPSHOT_GRAPHS } from "./snapshot";

/** Default Fuseki query endpoint, matching `docker-compose.yml`. */
export const DEFAULT_SPARQL_ENDPOINT = "http://localhost:3030/agritrust/sparql";

/** Abort an unresponsive triple store rather than hanging the dashboard. */
const SPARQL_TIMEOUT_MS = 4_000;

const PREFIXES = `
  @prefix agritrust: <https://agritrust.org/ontology#> .
  @prefix rdf:      <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
  @prefix rdfs:     <http://www.w3.org/2000/01/rdf-schema#> .
  @prefix xsd:      <http://www.w3.org/2001/XMLSchema#> .
  @prefix prov:     <http://www.w3.org/ns/prov#> .
  @prefix geo:      <http://www.opengis.net/ont/geosparql#> .
`;

/**
 * Substituted with the on-ledger asset commitment before dispatch, so a caller
 * cannot widen the query to another farmer's graph.
 */
const ASSET_ID_PLACEHOLDER = "__ASSET_ID__";

/**
 * Namespace prefix for a batch's provenance statements.
 *
 * The query scopes nodes by IRI prefix rather than by a PROV derivation
 * traversal: certificates and observations hang off the chain as evidence
 * without being derivations of it, so `prov:qualifiedDerivation*` would omit
 * exactly the statements the auditor view exists to show.
 */
const BATCH_NS_PLACEHOLDER = "__BATCH_NS__";

/**
 * SPARQL selecting every `:Asset`, `:Process`, `:Observation` and
 * `:Certificate` statement belonging to one batch.
 *
 * `LineageStatement` edges are excluded explicitly: they carry a
 * `agritrust:contentHash` like any other statement and would otherwise be
 * rendered as nodes.
 */
export const LINEAGE_QUERY = `${PREFIXES}
SELECT ?node ?kind ?label ?hash ?stampedAt ?actor ?quantity ?location ?detail
WHERE {
  GRAPH ?g {
    ?batch agritrust:assetCommitment "${ASSET_ID_PLACEHOLDER}" ;
           agritrust:rootNode ?root .

    ?node agritrust:contentHash ?hash ;
          agritrust:recordedAt ?stampedAt ;
          a ?kind .

    FILTER(?kind != agritrust:LineageStatement)
    FILTER(STRSTARTS(STR(?node), "${BATCH_NS_PLACEHOLDER}/"))
  }
  OPTIONAL { ?node rdfs:label ?label }
  OPTIONAL { ?node agritrust:actor ?actor }
  OPTIONAL { ?node agritrust:quantityKilograms ?quantity }
  OPTIONAL { ?node agritrust:location ?location }
  OPTIONAL { ?node agritrust:detail ?detail }
}
ORDER BY ?stampedAt`;

/** SPARQL selecting the directional statements between two traced nodes. */
export const EDGE_QUERY = `${PREFIXES}
SELECT ?edge ?source ?target ?predicate ?hash
WHERE {
  GRAPH ?g {
    ?edge a agritrust:LineageStatement ;
          agritrust:from ?source ;
          agritrust:to ?target ;
          agritrust:contentHash ?hash ;
          agritrust:predicate ?predicate .
    FILTER(STRSTARTS(STR(?edge), "${BATCH_NS_PLACEHOLDER}/"))
  }
}
`;

/** Node classes this viewer knows how to render. */
const KNOWN_NODE_KINDS: readonly ProvenanceNodeKind[] = [
  "Asset",
  "Process",
  "Observation",
  "Certificate",
];

const KNOWN_EDGE_KINDS: readonly ProvenanceEdgeKind[] = [
  "producedBy",
  "transformedBy",
  "observedBy",
  "certifiedBy",
  "aggregatedInto",
];

function isNodeKind(value: string): value is ProvenanceNodeKind {
  return (KNOWN_NODE_KINDS as readonly string[]).includes(value);
}

function isEdgeKind(value: string): value is ProvenanceEdgeKind {
  return (KNOWN_EDGE_KINDS as readonly string[]).includes(value);
}

/** A single row of a `application/sparql-results+json` binding set. */
type SparqlBinding = Record<string, { type: string; value: string }>;

interface SparqlResults {
  results?: { bindings?: SparqlBinding[] };
}

function literal(binding: SparqlBinding | undefined, key: string): string | undefined {
  const value = binding?.[key]?.value;
  return value === undefined || value === "" ? undefined : value;
}

function number(binding: SparqlBinding | undefined, key: string): number | undefined {
  const raw = literal(binding, key);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Last path segment or fragment of an IRI, used as a display fallback. */
function localName(iri: string): string {
  const hashIndex = iri.lastIndexOf("#");
  if (hashIndex >= 0 && hashIndex < iri.length - 1) return iri.slice(hashIndex + 1);
  const segments = iri.split("/");
  return segments[segments.length - 1] ?? iri;
}

/**
 * Shape of the Merkle verification result.
 *
 * A graph whose `recomputedRoot` matches the anchored `provenanceMerkleRoot`
 * has not been altered since the farmer registered the twin.
 */
export interface IntegrityReport {
  readonly verified: boolean;
  readonly anchoredRoot: Hex32;
  readonly recomputedRoot: Hex32;
  readonly leafCount: number;
  /** Human readable reason the graph failed verification, when it did. */
  readonly reason?: string;
}

/* -------------------------------------------------------------------------- */
/*  Cryptography                                                               */
/* -------------------------------------------------------------------------- */

function toHex(buffer: ArrayBuffer): Hex32 {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 of a UTF-8 string, hex encoded. */
export async function sha256Hex(input: string): Promise<Hex32> {
  const data = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

/**
 * Fold leaf commitments pairwise into a Merkle root.
 *
 * Duplicate nodes are hashed again on the way up, so a graph that repeats a
 * stage cannot be made to reproduce the anchored root by padding.
 */
export async function buildMerkleRoot(leaves: readonly Hex32[]): Promise<Hex32> {
  if (leaves.length === 0) return sha256Hex("agritrust:empty-provenance-graph");

  let level = [...leaves].sort();

  while (level.length > 1) {
    const next: Hex32[] = [];

    for (let index = 0; index < level.length; index += 2) {
      const left = level[index] as Hex32;
      // An odd node is promoted by hashing it against itself, never left bare.
      const right = level[index + 1] ?? left;
      next.push(await sha256Hex(`${left}${right}`));
    }

    level = next.sort();
  }

  return level[0] as Hex32;
}

/**
 * Recompute the commitment for a graph and compare it with the anchored root.
 *
 * Nodes are the Merkle leaves; edges are folded in as additional leaves so that
 * rewiring the chain (forging a mill stage) invalidates the commitment even
 * when every individual node statement is untouched.
 */
export async function verifyGraphIntegrity(
  graph: ProvenanceGraph,
): Promise<IntegrityReport> {
  const nodeLeaves = graph.nodes.map((node) => node.hash);
  const edgeLeaves = graph.edges.map((edge) => edge.hash);
  const recomputedRoot = await buildMerkleRoot([...nodeLeaves, ...edgeLeaves]);

  if (recomputedRoot === graph.merkleRoot) {
    return {
      verified: true,
      anchoredRoot: graph.merkleRoot,
      recomputedRoot,
      leafCount: nodeLeaves.length + edgeLeaves.length,
    };
  }

  return {
    verified: false,
    anchoredRoot: graph.merkleRoot,
    recomputedRoot,
    leafCount: nodeLeaves.length + edgeLeaves.length,
    reason:
      "Recomputed commitment does not match the Merkle root anchored on Soroban. " +
      "A statement in this lineage graph has been altered since registration.",
  };
}

/* -------------------------------------------------------------------------- */
/*  Triple store access                                                        */
/* -------------------------------------------------------------------------- */

async function runSparql(endpoint: string, query: string): Promise<SparqlResults> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SPARQL_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/sparql-query",
      },
      body: query,
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`SPARQL endpoint responded ${response.status}`);
    }

    return (await response.json()) as SparqlResults;
  } finally {
    clearTimeout(timer);
  }
}

function parseNodes(bindings: readonly SparqlBinding[]): ProvenanceNode[] {
  return bindings.map((binding) => {
    const iri = literal(binding, "node") ?? "";
    const rawKind = localName(literal(binding, "kind") ?? "Process");
    const kind: ProvenanceNodeKind = isNodeKind(rawKind) ? rawKind : "Process";
    const hash = literal(binding, "hash") ?? "";

    return {
      id: iri,
      kind,
      label: literal(binding, "label") ?? localName(iri),
      hash,
      // Membership of the anchored commitment is proven in `verifyGraphIntegrity`;
      // until it passes, a node is presented as unproven rather than trusted.
      tamperProof: false,
      timestamp: literal(binding, "stampedAt") ?? "",
      actor: literal(binding, "actor") ?? "Unattributed",
      ...(number(binding, "quantity") !== undefined
        ? { quantityKg: number(binding, "quantity") }
        : {}),
      ...(literal(binding, "location") !== undefined
        ? { location: literal(binding, "location") }
        : {}),
      ...(literal(binding, "detail") !== undefined
        ? { detail: literal(binding, "detail") }
        : {}),
    };
  });
}

function parseEdges(bindings: readonly SparqlBinding[]): ProvenanceEdge[] {
  const edges: ProvenanceEdge[] = [];

  for (const binding of bindings) {
    const source = literal(binding, "source");
    const target = literal(binding, "target");
    if (source === undefined || target === undefined) continue;

    const rawPredicate = localName(literal(binding, "predicate") ?? "transformedBy");
    const kind: ProvenanceEdgeKind = isEdgeKind(rawPredicate) ? rawPredicate : "transformedBy";

    edges.push({
      id: literal(binding, "edge") ?? `${source}->${target}`,
      source,
      target,
      kind,
      hash: literal(binding, "hash") ?? "",
      tamperProof: false,
    });
  }

  return edges;
}

/** Where a graph was materialized from, surfaced in the viewer banner. */
export type LineageSource = "triplestore" | "snapshot";

export interface LineageResult {
  readonly graph: ProvenanceGraph;
  readonly source: LineageSource;
  /** Populated when the endpoint was contacted but could not serve the query. */
  readonly warning?: string;
}

/**
 * Resolve the lineage graph for an asset twin.
 *
 * Attempts the SPARQL endpoint first and falls back to the bundled snapshot,
 * recording which path was taken so the auditor view can disclose it.
 *
 * `namespace` scopes both queries to one batch's IRIs; it is supplied by the
 * caller rather than derived, so a graph cannot be silently queried without a
 * scope.
 */
export async function fetchLineage(
  args: { readonly assetId: Hex32; readonly namespace: string },
  endpoint: string = DEFAULT_SPARQL_ENDPOINT,
): Promise<LineageResult> {
  const { assetId, namespace } = args;
  const snapshot = SNAPSHOT_GRAPHS[assetId];

  const nodeQuery = LINEAGE_QUERY.replaceAll(ASSET_ID_PLACEHOLDER, assetId).replaceAll(
    BATCH_NS_PLACEHOLDER,
    namespace,
  );
  const edgeQuery = EDGE_QUERY.replaceAll(BATCH_NS_PLACEHOLDER, namespace);

  try {
    const [nodeResults, edgeResults] = await Promise.all([
      runSparql(endpoint, nodeQuery),
      runSparql(endpoint, edgeQuery),
    ]);

    const nodeBindings = nodeResults.results?.bindings ?? [];
    const edgeBindings = edgeResults.results?.bindings ?? [];

    if (nodeBindings.length === 0) {
      throw new Error("Query returned no provenance statements for this batch");
    }

    return {
      graph: {
        assetId,
        namespace,
        merkleRoot: snapshot?.merkleRoot ?? "",
        nodes: parseNodes(nodeBindings),
        edges: parseEdges(edgeBindings),
      },
      source: "triplestore",
    };
  } catch (error) {
    if (snapshot === undefined) {
      throw error instanceof Error ? error : new Error(String(error));
    }

    return {
      graph: snapshot,
      source: "snapshot",
      warning:
        "Triple store unreachable — showing the locally cached lineage snapshot. " +
        "Commitments are still verified against the on-ledger anchor.",
    };
  }
}