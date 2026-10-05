/**
 * Locally cached lineage snapshots.
 *
 * These graphs are the offline mirror of the `:Process` triples held in Fuseki.
 * `merkleRoot` is the commitment the farmer anchored on Soroban as
 * `provenance_merkleRoot`; it was produced by folding the node and edge hashes
 * below with the algorithm in `AgriTrustLineageService.buildMerkleRoot`.
 *
 * Because the root is a genuine commitment rather than a placeholder, editing
 * any node or edge here makes `verifyGraphIntegrity` fail — which is exactly the
 * tamper-evidence the auditor view claims to provide.
 */

import type { Hex32, ProvenanceGraph } from "./types";

const COFFEE_ASSET_ID: Hex32 =
  "4f2a9c17e5b3d8064af29c1e7d5b03948a6e2c17f0b9d4e83a6c507f1e2b3d49";

/** Commitment anchored on Soroban for `COFFEE_ASSET_ID`. */
const COFFEE_MERKLE_ROOT: Hex32 =
  "6754964ce63edb44cf21da33bc88832aece614e42e35aa8be9c02b2867bb79a2";

const NS = "https://agritrust.org/id/batch/COF-LOT-2024-0892";

const COFFEE_GRAPH: ProvenanceGraph = {
  assetId: COFFEE_ASSET_ID,
  namespace: NS,
  merkleRoot: COFFEE_MERKLE_ROOT,
  nodes: [
    {
      id: `${NS}/harvest`,
      kind: "Asset",
      label: "Farm Harvest · Plot 7B",
      hash: "a0b7456f07f0f4d605d85e3a70c6c97409739116b12ebe7e44872741f649c787",
      tamperProof: true,
      timestamp: "2024-08-14T06:20:00Z",
      actor: "Kamau Cooperative · Farmer Group 12",
      quantityKg: 12_000,
      location: "Nyeri County, Kenya · 0.4231°S 36.9512°E",
      detail:
        "Selective hand-picking of ripe cherries across 4.2 ha. Cherries weighed " +
        "at the plot edge and moved to the washing station within 6 hours.",
    },
    {
      id: `${NS}/cooperative-aggregation`,
      kind: "Process",
      label: "Cooperative Aggregation",
      hash: "269d34859b6d8c7251dadc0b757b3d3d11274340544a0e6efb8646270c1b70c5",
      tamperProof: true,
      timestamp: "2024-08-14T18:45:00Z",
      actor: "Kamau Cooperative · Aggregation Hall",
      quantityKg: 12_000,
      location: "Nyeri County, Kenya",
      detail:
        "Cherry lots from 31 member farms merged into a single traceable mass. " +
        "Each contributing lot retained its own sub-batch identifier.",
    },
    {
      id: `${NS}/wet-mill`,
      kind: "Process",
      label: "Washing Station · Wet Mill",
      hash: "fde162a8f233579c3c748488bb15ddff8a5dab86fbe975441a0d57e3c772dd25",
      tamperProof: true,
      timestamp: "2024-08-16T09:10:00Z",
      actor: "Kamau Cooperative · Wet Mill",
      quantityKg: 2_040,
      location: "Nyeri County, Kenya",
      detail:
        "Pulping, 36-hour underwater fermentation and washing. Mass fell from " +
        "12,000 kg cherry to 2,040 kg parchment (17.0% recovery).",
    },
    {
      id: `${NS}/dry-mill`,
      kind: "Process",
      label: "Dry Mill · Grading & Hulling",
      hash: "b35cd6dc694b2410e8766bbb131fac5902df6230312ad07dfd27921b75345082",
      tamperProof: true,
      timestamp: "2024-09-02T13:30:00Z",
      actor: "Meru Dry Mills Ltd.",
      quantityKg: 1_860,
      location: "Meru, Kenya",
      detail:
        "Sun-dried to 10.8% moisture, hulled and graded AA. Optical sorting " +
        "removed 180 kg of defectives, which left the certified chain of custody.",
    },
    {
      id: `${NS}/export-port`,
      kind: "Process",
      label: "Export Port · Mombasa",
      hash: "5689f23a44ec6a29455beefb837a8c6b5340a0fc92ba42d0566ba371bf823e27",
      tamperProof: true,
      timestamp: "2024-10-05T07:55:00Z",
      actor: "Kenya Ports Authority · Mombasa",
      quantityKg: 1_860,
      location: "Port of Mombasa, Kenya",
      detail:
        "Container MSDU-7741209 sealed and manifested to Rotterdam. Seal number " +
        "recorded so custody can be proven unbroken at destination.",
    },
    {
      id: `${NS}/obs-soil-moisture`,
      kind: "Observation",
      label: "Soil Moisture Telemetry",
      hash: "cd4eb5bc86718bb919da01f55e428f80dcded2877c3eb63dba6209b5c95fd997",
      tamperProof: true,
      timestamp: "2024-08-09T00:00:00Z",
      actor: "Plot 7B IoT Array",
      location: "Plot 7B",
      detail:
        "Volumetric water content held between 21% and 34% across the growth " +
        "season; no irrigation was applied to this plot.",
    },
    {
      id: `${NS}/obs-ndvi`,
      kind: "Observation",
      label: "Sentinel-2 NDVI Composite",
      hash: "4db4b782cf78661ce63aebb7c5e7bff3e98e61a85f7dbfe0bd6c17bd8e730438",
      tamperProof: true,
      timestamp: "2024-08-31T10:15:00Z",
      actor: "AgriTrust Remote Sensing Indexer",
      detail:
        "Mean NDVI 0.81 over the harvest window, indicating continuous canopy " +
        "cover with no bare-soil fallow period.",
    },
    {
      id: `${NS}/cert-eudr`,
      kind: "Certificate",
      label: "EUDR Deforestation-Free VC",
      hash: "03f825873a5af4f2895ca587b44519959e22d13d84e437e5c5bab9d23c70dbfa",
      tamperProof: true,
      timestamp: "2024-10-06T11:00:00Z",
      actor: "AgriTrust Compliance Authority",
      detail:
        "W3C Verifiable Credential asserting no conversion of plot 7B to cropland " +
        "after 31 December 2020, per Regulation (EU) 2023/1115 Article 10.",
    },
    {
      id: `${NS}/cert-organic`,
      kind: "Certificate",
      label: "EU Organic Certification",
      hash: "716ab2d2f249914fdef3114f9b6438095bf0bb00028020188eaa8d3e8893e13d",
      tamperProof: true,
      timestamp: "2024-07-22T08:00:00Z",
      actor: "Kofipro · Certifier KE-BIO-149",
      detail:
        "Organic production certified for the 2024 season. No synthetic " +
        "pesticides recorded against the plot during the audit window.",
    },
  ],
  edges: [
    {
      id: `${NS}/e-harvest-coop`,
      source: `${NS}/harvest`,
      target: `${NS}/cooperative-aggregation`,
      kind: "aggregatedInto",
      hash: "0b753cfed7eb8d7b906ee912674eeec8697b7b14dbde785e7b701fbffc395aee",
      tamperProof: true,
    },
    {
      id: `${NS}/e-coop-wet`,
      source: `${NS}/cooperative-aggregation`,
      target: `${NS}/wet-mill`,
      kind: "transformedBy",
      hash: "2c3735badf14eb53202fc2eb6ac6ba099bf99f1c73ba48b64670981c4b28ca20",
      tamperProof: true,
    },
    {
      id: `${NS}/e-wet-dry`,
      source: `${NS}/wet-mill`,
      target: `${NS}/dry-mill`,
      kind: "transformedBy",
      hash: "c80ca08a9523fb6f3f7d171a6f04602cd24ff9344c002bcf433f0daacd082262",
      tamperProof: true,
    },
    {
      id: `${NS}/e-dry-port`,
      source: `${NS}/dry-mill`,
      target: `${NS}/export-port`,
      kind: "transformedBy",
      hash: "12463caadd5b7c011fcb9614ac5fec7b450a8869e4d88eb9b24ca8c9f9e66a43",
      tamperProof: true,
    },
    {
      id: `${NS}/e-soil-harvest`,
      source: `${NS}/obs-soil-moisture`,
      target: `${NS}/harvest`,
      kind: "observedBy",
      hash: "58e67c21b6ab81d81d3d6513a21bd3fff613d61dc6f8b6c4e4cdd431d44c693e",
      tamperProof: true,
    },
    {
      id: `${NS}/e-ndvi-harvest`,
      source: `${NS}/obs-ndvi`,
      target: `${NS}/harvest`,
      kind: "observedBy",
      hash: "5c55035fa533c044f636bfcdac9caab7b5ae782b03d3d89308290bdb1daa2be7",
      tamperProof: true,
    },
    {
      id: `${NS}/e-eudr-harvest`,
      source: `${NS}/cert-eudr`,
      target: `${NS}/harvest`,
      kind: "certifiedBy",
      hash: "bf79b98f5ee685486ee60f4860cf01f0b8b0ad894040a7d02d63b5578bc23ddd",
      tamperProof: true,
    },
    {
      id: `${NS}/e-organic-dry`,
      source: `${NS}/cert-organic`,
      target: `${NS}/dry-mill`,
      kind: "certifiedBy",
      hash: "40f673657bfda1903d72e6389b88623fba5cd526a455e8e36b91d06a9a8348a5",
      tamperProof: true,
    },
    {
      id: `${NS}/e-wet-harvest`,
      source: `${NS}/wet-mill`,
      target: `${NS}/harvest`,
      kind: "producedBy",
      hash: "09ec2d745a161be45db2b2da44e971b92ca153ba0f241e16f73f4dce4e7013a5",
      tamperProof: true,
    },
  ],
};

/** Offline lineage mirror keyed by on-ledger asset commitment. */
export const SNAPSHOT_GRAPHS: Readonly<Record<Hex32, ProvenanceGraph>> = {
  [COFFEE_ASSET_ID]: COFFEE_GRAPH,
};

export const SNAPSHOT_ASSET_ID = COFFEE_ASSET_ID;

/**
 * Resolve a snapshot graph by asset commitment.
 *
 * Throws for an unknown batch so a missing mirror surfaces as an explicit error
 * rather than an empty graph that would silently pass verification.
 */
export function getSnapshotGraph(assetId: Hex32): ProvenanceGraph {
  const graph = SNAPSHOT_GRAPHS[assetId];
  if (graph === undefined) {
    throw new Error(`No lineage snapshot cached for asset ${assetId}`);
  }
  return graph;
}