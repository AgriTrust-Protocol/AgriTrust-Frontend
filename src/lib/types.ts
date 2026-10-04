/**
 * AgriTrust Protocol domain types.
 *
 * The ledger-facing shapes mirror the Soroban contract in
 * `AgriTrust-Contracts/src/types.rs` so that values returned by the RPC layer
 * can be rendered without an intermediate mapping layer:
 *
 *   AssetTwinRecord   -> {@link AssetTwin}
 *   DataContractRecord-> {@link DataContract}
 *   ODRLPolicyRecord  -> {@link OdrlPolicy}
 *
 * BytesN<32> commitments are surfaced to the UI as lowercase hex so they can be
 * compared against the `:Process` graph returned by the lineage service.
 */

/** W3C Decentralized Identifier. */
export type Did = string;

/** Lowercase hex encoding of a Soroban `BytesN<32>` commitment. */
export type Hex32 = string;

/** Stellar/Soroban account address (`G...`). */
export type StellarAddress = string;

/**
 * Failure modes surfaced by the AgriTrust execution engine.
 *
 * Discriminant values are the `#[repr(u32)]` codes from `ContractError` and are
 * reproduced here so the UI can render an exact enforcement outcome rather than
 * an opaque "transaction failed".
 */
export enum ContractError {
  AlreadyInitialized = 1,
  Unauthorized = 2,
  AssetNotFound = 3,
  ContractExpired = 4,
  PolicyViolation = 5,
  AccessRevoked = 6,
}

export const CONTRACT_ERROR_MESSAGES: Readonly<Record<ContractError, string>> = {
  [ContractError.AlreadyInitialized]: "Protocol administrator already established.",
  [ContractError.Unauthorized]: "Signer is not the sovereign originator of this asset.",
  [ContractError.AssetNotFound]: "Referenced ledger object does not exist.",
  [ContractError.ContractExpired]: "The agreement validity window has elapsed.",
  [ContractError.PolicyViolation]: "ODRL policy is not anchored, or terms are not satisfied.",
  [ContractError.AccessRevoked]: "The farmer has revoked this access grant.",
};

/** `Symbol` commodity classification recorded on the asset twin. */
export type CommodityType = "COFFEE" | "COCOA" | "SOYA" | "CATTLE" | "PALM_OIL";

/**
 * The digital twin of a physical agricultural batch (`AssetTwinRecord`).
 */
export interface AssetTwin {
  /** Commitment matching the physical batch (e.g. a coffee, cocoa or soya lot). */
  readonly assetId: Hex32;
  /** Sovereignty anchor: the only principal permitted to grant or revoke access. */
  readonly originator: StellarAddress;
  /** Resolvable decentralized identifier of the originator. */
  readonly originatorDid: Did;
  readonly commodityType: CommodityType;
  /** Merkle root committing to the off-ledger `:Process` provenance graph. */
  readonly provenanceMerkleRoot: Hex32;
  /** Ledger timestamp at which the twin was anchored. */
  readonly registeredAt: number;
}

/**
 * A decentralized data usage agreement (`:DataContract` / `DataContractRecord`).
 */
export interface DataContract {
  readonly contractId: Hex32;
  /** The `:Asset` twin whose compliance records are licensed. */
  readonly assetId: Hex32;
  /** Entity requesting access to compliance records. */
  readonly dataConsumer: StellarAddress;
  /** Human readable label for the requesting organization. */
  readonly consumerLabel: string;
  /** SHA-256 digest of the machine-readable ODRL usage terms. */
  readonly odrlPolicyHash: Hex32;
  /** Escrow payment required from the consumer for the access window. */
  readonly accessFee: number;
  /** Last ledger sequence at which the grant remains enforceable. */
  readonly validUntilLedger: number;
  /** Set by the farmer to terminate the grant unilaterally. */
  readonly isRevoked: boolean;
}

/** An anchored ODRL usage policy (`:ODRLPolicy` / `ODRLPolicyRecord`). */
export interface OdrlPolicy {
  /** SHA-256 digest of the canonical ODRL permission/constraint set. */
  readonly policyHash: Hex32;
  /** Resolvable location of the ODRL offer / permission document. */
  readonly policyUri: string;
  /** Issuer that committed the policy to the ledger. */
  readonly issuer: StellarAddress;
  readonly registeredAt: number;
  /** Human readable assertions, parsed from the anchored ODRL document. */
  readonly permissions: readonly string[];
  readonly prohibitions: readonly string[];
  /** Retention window the consumer is contractually bound to. */
  readonly retentionLimitDays: number;
}

/* -------------------------------------------------------------------------- */
/*  RDF / SHACL provenance graph                                              */
/* -------------------------------------------------------------------------- */

/** Node classes rendered by the lineage viewer. */
export type ProvenanceNodeKind = "Asset" | "Process" | "Observation" | "Certificate";

/** Directional predicates connecting the node classes above. */
export type ProvenanceEdgeKind =
  | "producedBy"
  | "transformedBy"
  | "observedBy"
  | "certifiedBy"
  | "aggregatedInto";

/**
 * A single node of the `:Process` tracing graph.
 *
 * `hash` is the content commitment for the node: the lineage service verifies it
 * against the batch's `provenanceMerkleRoot` so any mutation of a node changes
 * the root and breaks verification.
 */
export interface ProvenanceNode {
  readonly id: string;
  readonly kind: ProvenanceNodeKind;
  readonly label: string;
  /** SHA-256 content commitment of the RDF node. */
  readonly hash: Hex32;
  /** True when the node's commitment is included in the anchored Merkle root. */
  readonly tamperProof: boolean;
  /** ISO-8601 instant the statement was recorded. */
  readonly timestamp: string;
  readonly actor: string;
  readonly quantityKg?: number;
  readonly location?: string;
  readonly detail?: string;
}

/** A directional statement between two provenance nodes. */
export interface ProvenanceEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: ProvenanceEdgeKind;
  readonly hash: Hex32;
  readonly tamperProof: boolean;
}

/** The materialized lineage graph for a single asset twin. */
export interface ProvenanceGraph {
  readonly assetId: Hex32;
  /**
   * IRI prefix shared by every node and edge of this batch.
   *
   * The lineage service scopes its SPARQL with this prefix so a shared named
   * graph never leaks one farmer's statements into another's response.
   */
  readonly namespace: string;
  /** Root this graph is verified against (mirrors `provenance_merkle_root`). */
  readonly merkleRoot: Hex32;
  readonly nodes: readonly ProvenanceNode[];
  readonly edges: readonly ProvenanceEdge[];
  /** Set when the graph fails to reconstruct the anchored Merkle root. */
  readonly integrityFailure?: string;
}

/* -------------------------------------------------------------------------- */
/*  EUDR compliance                                                            */
/* -------------------------------------------------------------------------- */

/** Simplified GeoJSON geometry subset required to draw a production plot. */
export type PlotGeometry =
  | { readonly type: "Polygon"; readonly coordinates: number[][][] }
  | { readonly type: "MultiPolygon"; readonly coordinates: number[][][][] };

/** A minimal RFC 7946 FeatureCollection. */
export interface PlotFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: ReadonlyArray<{
    readonly type: "Feature";
    readonly geometry: PlotGeometry;
    readonly properties: Record<string, string | number | boolean>;
  }>;
}

/** Verifiable Credential status per W3C VC Data Model. */
export type CredentialStatus = "valid" | "expired" | "revoked" | "unverified";

/** A signed assertion carried by an EUDR verifiable credential. */
export interface VerifiableCredentialAssertion {
  readonly label: string;
  readonly value: string;
}

/** A W3C Verifiable Credential proving deforestation-free origin. */
export interface VerifiableCredential {
  readonly id: string;
  readonly type: readonly string[];
  readonly issuer: Did;
  readonly issuanceDate: string;
  readonly expirationDate: string;
  readonly status: CredentialStatus;
  /** JSON-LD proof material, rendered in the verification modal. */
  readonly proof: {
    readonly type: string;
    readonly created: string;
    readonly verificationMethod: Did;
    readonly proofPurpose: string;
    readonly proofValue: string;
  };
  readonly credentialSubject: {
    readonly id: Did;
    readonly assertions: readonly VerifiableCredentialAssertion[];
  };
}

/** EUDR (Regulation EU 2023/1115) compliance assessment for one plot. */
export interface EudrAssessment {
  readonly plotId: string;
  readonly farmName: string;
  readonly commodity: CommodityType;
  /** `[latitude, longitude]` representative point. */
  readonly centroid: readonly [number, number];
  readonly geoJson: PlotFeatureCollection;
  readonly areaHectares: number;
  /** ISO-8601 date the deforestation-free cut-off was evaluated against. */
  readonly assessedAt: string;
  /** Post-2020-12-31 conversion evidence required by Art. 10. */
  readonly deforestationFree: boolean;
  /** Art. 10 due-diligence statement reference. */
  readonly dueDiligenceStatementRef: string;
  /** Whether geolocation matches the polygon registered with the authority. */
  readonly geolocationMatch: boolean;
  readonly credential: VerifiableCredential;
}

/* -------------------------------------------------------------------------- */
/*  Mass balance                                                               */
/* -------------------------------------------------------------------------- */

/** One auditable flow contributing to a mass balance ledger period. */
export interface MassBalanceFlow {
  readonly id: string;
  readonly label: string;
  /** Physical volume routed through the chain of custody, in kilograms. */
  readonly inputKg: number;
  /** Volume attributable to certified sustainable sources, in kilograms. */
  readonly certifiedKg: number;
  /** Upstream entity the flow was mixed with. */
  readonly mixedWith: string;
  /** Whether the flow is covered by a mass balance certification. */
  readonly certified: boolean;
  readonly reference: string;
}

/** Aggregate mass balance figures for a reporting period. */
export interface MassBalanceSummary {
  readonly periodLabel: string;
  readonly flows: readonly MassBalanceFlow[];
  /** Sustained by the chain of custody, in kilograms. */
  readonly totalInputKg: number;
  /** Certified sustainable volume, in kilograms. */
  readonly certifiedKg: number;
  /** Standard commodity remainder, in kilograms. */
  readonly conventionalKg: number;
  /** `certifiedKg / totalInputKg`, the auditable mass balance ratio. */
  readonly certifiedRatio: number;
}