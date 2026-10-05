/**
 * Demo ledger state for the operator and farmer sovereignty portal.
 *
 * The values here mirror what the AgriTrust Soroban contract would return from
 * `get_asset_twin`, `get_data_contract` and `get_odrl_policy`, so the portal
 * renders real enforcement outcomes without a live network. Swapping this module
 * for an RPC-backed repository is the only change needed to go on-chain.
 */

import type {
  AssetTwin,
  DataContract,
  EudrAssessment,
  MassBalanceSummary,
  OdrlPolicy,
} from "./types";

/** Commitment matching the snapshot lineage graph in `snapshot.ts`. */
export const ASSET_TWIN: AssetTwin = {
  assetId: "4f2a9c17e5b3d8064af29c1e7d5b03948a6e2c17f0b9d4e83a6c507f1e2b3d49",
  originator: "GA5ZQ7JXH3M2YTK9PLVXBCFN4RDMVBCJLTYQMPH2C5V7W8XNQ4",
  originatorDid: "did:pkh:eafit...ju7ph",
  commodityType: "COFFEE",
  provenanceMerkleRoot: "6754964ce63edb44cf21da33bc88832aece614e42e35aa8be9c02b2867bb79a2",
  registeredAt: 1_725_950_400,
};

/** Signed-in operator / farmer identity shown in the navbar DID badge. */
export const ACTIVE_IDENTITY = {
  address: ASSET_TWIN.originator,
  did: "did:pkh:z6MkuVnJ7GHi7FfQqUyHzrJgQmGmHZ2sSUuqCzXjCzFHnLcUWZ",
  displayHandle: "kamau-coop.agritrust.eth",
  role: "Sovereign Originator",
} as const;

/* -------------------------------------------------------------------------- */
/*  Anchored ODRL policies                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Usage policies committed on-ledger via `register_odrl_policy`.
 *
 * Only policies present in this list can back a `:DataContract`; the contract
 * rejects any other digest with `ContractError.PolicyViolation`.
 */
export const ODRL_POLICIES: readonly OdrlPolicy[] = [
  {
    policyHash: "b1f4c8d2093a5e6784c0d2f19a7b3e5c8d4a6f091c2b3e4d5a6f708192a3b4c5",
    policyUri: "https://agritrust.org/odrl/kamau-coop/carbon-aggregate-v3",
    issuer: ASSET_TWIN.originator,
    registeredAt: 1_725_950_400,
    permissions: [
      "Aggregate seasonal carbon sequestration (tCO2e/ha, 5 ha minimum cell)",
      "Certified export volume and mass balance totals",
      "Polygon geometry aggregated to district level",
    ],
    prohibitions: [
      "Raw soil yield data at plot granularity",
      "Farmer identity, national ID or land tenure records",
      "Per-plot sensor telemetry and irrigation schedules",
    ],
    retentionLimitDays: 180,
  },
  {
    policyHash: "c7e2a91b3d5f6048e1c9a70b2d8f4e6a1c3b5097e2d4c6b8a0f1e3d5c7b9a1f3",
    policyUri: "https://agritrust.org/odrl/kamau-coop/full-traceability-v2",
    issuer: ASSET_TWIN.originator,
    registeredAt: 1_725_950_400,
    permissions: [
      "Full `:Process` lineage graph with node and edge commitments",
      "W3C Verifiable Credentials attached to the batch",
      "Chain of custody records including mill and port transformations",
      "Certified volume per processing stage",
    ],
    prohibitions: [
      "Raw soil yield data at plot granularity",
      "Farmer identity, national ID or land tenure records",
      "Onward redistribution or sub-licensing to third parties",
    ],
    retentionLimitDays: 365,
  },
  {
    policyHash: "a3d9f6b21e4c7059a8b1d3f6e9c2a5b8d1f4e7c0a3b6d9f2e5c8b1a4d7f0e3c6",
    policyUri: "https://agritrust.org/odrl/kamau-coop/third-party-audit-v1",
    issuer: ASSET_TWIN.originator,
    registeredAt: 1_725_950_400,
    permissions: [
      "Read-only access to the anchored Merkle root for spot checks",
      "EUDR due diligence statement and deforestation-free attestation",
      "Mass balance certification for the reporting period",
    ],
    prohibitions: [
      "Bulk export of the `:Process` graph",
      "Raw soil yield data at plot granularity",
      "Any write operation against the asset twin",
    ],
    retentionLimitDays: 90,
  },
];

function policyByHash(hash: string): OdrlPolicy {
  const policy = ODRL_POLICIES.find((candidate) => candidate.policyHash === hash);
  if (policy === undefined) {
    throw new Error(`No anchored ODRL policy for digest ${hash}`);
  }
  return policy;
}

/* -------------------------------------------------------------------------- */
/*  Data contracts (buyer access requests)                                     */
/* -------------------------------------------------------------------------- */

/**
 * Ledger sequence used as "now" so expiry states in the demo are stable.
 * Mirrors a Soroban testnet ledger close rather than wall-clock time.
 */
export const CURRENT_LEDGER = 6_412_880;

/**
 * Buyer access requests and standing grants.
 *
 * `isRevoked` is terminal: `revoke_data_access` is irreversible, so a revoked
 * grant can never be returned to an active state.
 */
export const DATA_CONTRACTS: readonly DataContract[] = [
  {
    contractId: "0a91c4e7b2d85f3619a0c7e4b8d2f561a3c9e0b7d4f2a68c1e5b9d3f7a0c2e46",
    assetId: ASSET_TWIN.assetId,
    dataConsumer: "GB5KJ4XGQMR7YN2XT3ZQ6PJVKCTW2VZQ2S4FGNQBE3MWCXH7A2VD",
    consumerLabel: "Verdant Roasters B.V. · Rotterdam, NL",
    odrlPolicyHash: ODRL_POLICIES[1]!.policyHash,
    accessFee: 450_000_000,
    validUntilLedger: CURRENT_LEDGER + 4_200_000,
    isRevoked: false,
  },
  {
    contractId: "7d2e5f9a1b3c8046d5e7f0a2b4c6d8e9f1a3b5c7d9e0f2a4b6c8d0e1f3a5b7c9d",
    assetId: ASSET_TWIN.assetId,
    dataConsumer: "GC7XQ4MNP2VRT8KYB6D3H9WZLF5A1CEJ2U4X7YB6NKM9P3R8WT5",
    consumerLabel: "Nordkap Kaffehandel GmbH · Hamburg, DE",
    odrlPolicyHash: ODRL_POLICIES[0]!.policyHash,
    accessFee: 180_000_000,
    validUntilLedger: CURRENT_LEDGER + 1_150_000,
    isRevoked: false,
  },
  {
    contractId: "e1b3d5f7092a4c68b0d3f7a15e9c2b4d6a8f0c2e4b6d8a0f2c4e6b8d0a2f4c6e8",
    assetId: ASSET_TWIN.assetId,
    dataConsumer: "GD4KM6P3RQ8WN2VY5TL9CXB1ZE7HA6J2SD8FG3KD6LP0WZ9QYN",
    consumerLabel: "SustainCert Analytics · Nairobi, KE",
    odrlPolicyHash: ODRL_POLICIES[2]!.policyHash,
    accessFee: 90_000_000,
    validUntilLedger: CURRENT_LEDGER + 720_000,
    isRevoked: false,
  },
  {
    contractId: "3f8a1c5e709b2d46e0f3a7c9b1d5e8f2a4c6b0d9e1f3a5c7b9d2e4f6a8c0b1d3",
    assetId: ASSET_TWIN.assetId,
    dataConsumer: "GA9TR7WQ2MK5XD8PL3ZF6BNV0JC4YHS7WD2XQF8LNR5MT3BVG",
    consumerLabel: "Global Commodity Index · Singapore, SG",
    odrlPolicyHash: ODRL_POLICIES[1]!.policyHash,
    accessFee: 320_000_000,
    validUntilLedger: CURRENT_LEDGER + 900_000,
    isRevoked: true,
  },
];

/** Requests that have not yet been licensed by the farmer. */
export const PENDING_REQUESTS: readonly DataContract[] = [
  {
    contractId: "5c7e9a1b3d5f7082a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0",
    assetId: ASSET_TWIN.assetId,
    dataConsumer: "GB8YR2TQ4WN6XD0PL3ZF5BMV9KC7YHS2WD4XQF6LNR8MT0BVG3",
    consumerLabel: "Terra Nova Imports · Antwerp, BE",
    odrlPolicyHash: ODRL_POLICIES[0]!.policyHash,
    accessFee: 150_000_000,
    validUntilLedger: CURRENT_LEDGER + 2_400_000,
    isRevoked: false,
  },
];

/** Every request visible to the farmer, granted and pending alike. */
export const ALL_REQUESTS: readonly DataContract[] = [
  ...DATA_CONTRACTS,
  ...PENDING_REQUESTS,
];

/** Resolve the anchored ODRL policy backing a request. */
export function resolvePolicy(contract: DataContract): OdrlPolicy {
  return policyByHash(contract.odrlPolicyHash);
}

/* -------------------------------------------------------------------------- */
/*  EUDR compliance                                                            */
/* -------------------------------------------------------------------------- */

/**
 * EUDR assessment for the producing plot.
 *
 * Regulation (EU) 2023/1115 Article 10 requires operators to geolocate each
 * plot and evidence that no land was converted to cropland after 31 Dec 2020.
 */
export const EUDR_ASSESSMENT: EudrAssessment = {
  plotId: "KE-NY-007B",
  farmName: "Kamau Cooperative · Plot 7B",
  commodity: "COFFEE",
  centroid: [-0.4231, 36.9512],
  geoJson: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          // RFC 7946 orders positions as [longitude, latitude].
          coordinates: [
            [
              [36.95035, -0.42235],
              [36.95135, -0.4222],
              [36.95225, -0.42275],
              [36.95205, -0.42375],
              [36.95105, -0.42405],
              [36.95025, -0.42365],
              [36.95035, -0.42235],
            ],
          ],
        },
        properties: {
          plotId: "KE-NY-007B",
          commodity: "COFFEE",
          areaHectares: 4.2,
          deforestationFree: true,
          cutOffDate: "2020-12-31",
        },
      },
    ],
  },
  areaHectares: 4.2,
  assessedAt: "2024-10-06T11:00:00Z",
  deforestationFree: true,
  dueDiligenceStatementRef: "EUDR/DD/KE/2024/007B-114",
  geolocationMatch: true,
  credential: {
    id: "urn:uuid:3f2a9c17-e5b3-4d80-64af-29c1e7d5b039",
    type: ["VerifiableCredential", "EudrDeforestationFreeAttestation"],
    issuer: "did:web:compliance.agritrust.org",
    issuanceDate: "2024-10-06T11:00:00Z",
    expirationDate: "2025-10-06T11:00:00Z",
    status: "valid",
    proof: {
      type: "DataIntegrityProof",
      created: "2024-10-06T11:00:00Z",
      verificationMethod: "did:web:compliance.agritrust.org#key-1",
      proofPurpose: "assertionMethod",
      proofValue:
        "z3M2QmF6oDg8sPLh4tKcR1bN0eJ5wX7yA9uC3vF2gH8kL1mN4pQ6rS8tU0vW2xY4zA6bC8",
    },
    credentialSubject: {
      id: "did:pkh:GA5ZQ7JXH3M2YTK9PLVXBCFN4RDMVBCJLTYQMPH2C5V7W8XNQ4",
      assertions: [
        { label: "Deforestation free", value: "Yes — no conversion after 2020-12-31" },
        { label: "Geolocation match", value: "Yes — plot geometry matches authority record" },
        { label: "Commodity", value: "COFFEE · Arabica" },
        { label: "Due diligence statement", value: "EUDR/DD/KE/2024/007B-114" },
        { label: "Regulation", value: "Regulation (EU) 2023/1115, Article 10" },
      ],
    },
  },
};

/* -------------------------------------------------------------------------- */
/*  Mass balance                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Mass balance for the reporting period.
 *
 * Physical volume that stayed inside a documented chain of custody is what
 * makes a "certified sustainable" claim auditable; only the certified numerator
 * may be sold as certified product.
 */
export const MASS_BALANCE: MassBalanceSummary = {
  periodLabel: "Q3 2024 · 1 Jul – 30 Sep",
  totalInputKg: 135_000,
  certifiedKg: 42_000,
  conventionalKg: 93_000,
  certifiedRatio: 42_000 / 135_000,
  flows: [
    {
      id: "flow-1",
      label: "Kamau Cooperative · Plot 7B",
      inputKg: 42_000,
      certifiedKg: 42_000,
      mixedWith: "Meru Dry Mill · Grading",
      certified: true,
      reference: "MB-2024-Q3-001",
    },
    {
      id: "flow-2",
      label: "Nyeri Regional Aggregator · Mixed Arabica",
      inputKg: 68_000,
      certifiedKg: 0,
      mixedWith: "Meru Dry Mill · Grading",
      certified: false,
      reference: "MB-2024-Q3-002",
    },
    {
      id: "flow-3",
      label: "Embu Rainfed Lots · Unverified origin",
      inputKg: 25_000,
      certifiedKg: 0,
      mixedWith: "Meru Dry Mill · Grading",
      certified: false,
      reference: "MB-2024-Q3-003",
    },
  ],
};