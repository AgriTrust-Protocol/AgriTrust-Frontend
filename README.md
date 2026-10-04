# AgriTrust-Frontend

Operator and farmer sovereignty portal for the
[AgriTrust Protocol](https://github.com/AgriTrust-Protocol).

A Next.js (App Router) dashboard exposing two perspectives over a single
on-ledger commodity batch:

* **Farmer Sovereignty Console** — the corporate access requests against the
  farmer's asset twin, the ODRL rules attached to each one, and one-click
  grant / revoke of an executable data contract.
* **Supply Chain Auditor View** — the interactive `:Process` lineage graph,
  EUDR compliance certification for the geolocated plot, and mass balance
  reconciliation.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict |
| Styling | Tailwind CSS v4 (CSS-first `@theme` tokens) |
| Graph | `@xyflow/react` |
| Charts | `recharts` |
| Map | `leaflet` (CARTO dark basemap, RFC 7946 GeoJSON) |
| Wallet | `@stellar/freighter-api` against a Soroban network |
| Icons | `lucide-react` |

## Getting started

```bash
npm install
npm run dev            # http://localhost:3000
```

```bash
npm run build          # production build (type-checks)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
```

### Local infrastructure

```bash
docker compose up -d                 # soroban-network, triplestore, compliance-api
./seed_fuseki.sh --reset             # load ontology + :Process provenance graph
./test_agritrust_eudr_e2e.sh         # build, lineage, EUDR and governance checks
```

The portal **degrades gracefully**. With Fuseki and the compliance API stopped it
falls back to the cached lineage snapshot in `src/lib/snapshot.ts` and discloses
that on the graph banner — the commitments are still verified against the
on-ledger anchor either way.

## How tamper-evidence works

`AssetTwinRecord` on Soroban anchors a single `provenance_merkle_root`. Each
`:Process` statement carries a `agritrust:contentHash`, which is a SHA-256 digest
of its own IRI, and those digests are the Merkle leaves. The portal folds them
pairwise and compares the result with the anchored root:

```
node commitments + edge commitments → Merkle root == provenance_merkle_root ?
```

Edges are folded in as leaves too, so rewiring the chain (forging a mill stage)
breaks verification even when every individual node statement is untouched.
Odd nodes are promoted by hashing against themselves, so the graph cannot be
padded into reproducing the root.

The auditor view's **Simulate tampering** control mutates one commitment so the
divergence can be observed directly: the recomputed root stops matching the
anchor and the graph is marked as failing.

To keep the seeded triple store and the offline snapshot byte-identical, the
instance graph is generated from the snapshot:

```bash
node infra/generate-provenance-ttl.mjs   # writes infra/fuseki/batch-COF-LOT-2024-0892.ttl
node infra/verify-merkle-root.mjs --file infra/fuseki/batch-COF-LOT-2024-0892.ttl
```

## Layout

```
src/
├── app/
│   ├── layout.tsx            root shell
│   ├── page.tsx              dual-perspective dashboard
│   └── globals.css           Tailwind v4 theme + React Flow overrides
├── components/
│   ├── Navbar.tsx            branding, DID badge, Freighter connector
│   ├── ProvenanceGraphViewer.tsx   :Asset/:Process/:Observation/:Certificate graph
│   ├── EudrComplianceBadge.tsx     Art. 10 status + VC verification modal
│   ├── DataContractManager.tsx     grant / revoke with ODRL rules
│   ├── MassBalanceChart.tsx        certified vs conventional volume
│   └── GeoJsonMiniMap.tsx          Leaflet plot overlay
└── lib/
    ├── AgriTrustLineageService.ts  SPARQL lineage + Merkle verification
    ├── types.ts                    contract-aligned domain types
    ├── protocolState.ts            demo ledger state
    ├── snapshot.ts                 offline lineage mirror
    ├── wallet.ts                   Freighter session + signing
    └── format.ts                   presentation helpers

infra/
├── compliance-api/            EUDR due-diligence service (node:http, no deps)
├── fuseki/                    ontology + generated provenance graph
├── generate-provenance-ttl.mjs
└── verify-merkle-root.mjs
```

## Contract alignment

The ledger-facing types in `src/lib/types.ts` mirror
`AgriTrust-Contracts/src/types.rs`, including the `#[repr(u32)]`
`ContractError` discriminants, so the portal renders exact enforcement outcomes
instead of an opaque failure. The UI respects the contract's semantics:

* revocation is **terminal** — a revoked grant exposes no way back;
* `valid_until_ledger` is enforced against the current ledger sequence;
* grant and revoke are refused unless the connected wallet is the asset's
  `originator` (the contract would reject it as `Unauthorized`);
* only digests anchored via `register_odrl_policy` can back a data contract
  (`PolicyViolation` otherwise).

## Known limitations

* Ledger reads are served from `src/lib/protocolState.ts`, not a live Soroban
  RPC. Replacing that module with an RPC-backed repository is the only change
  needed to go on-chain.
* The credential check in the verification modal is **structural**: it confirms
  well-formedness, validity dates and expected issuer, but does not verify the
  issuer's signature. The modal states this explicitly.
* `npm audit` reports 5 high-severity advisories, all transitive and dev-only,
  via `eslint-config-next` → `fast-glob` → `micromatch` → `braces`. The suggested
  fix downgrades `eslint-config-next` to v14, so it is not applied.