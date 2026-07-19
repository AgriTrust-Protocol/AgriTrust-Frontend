export type ProvenanceStatus = "verified" | "pending" | "failed" | "in_transit";

export interface ProvenanceCertificate {
  id: string;
  label: string;
  type: "pdf" | "image" | "link";
  uri: string;
}

export interface ProvenanceLocation {
  name: string;
  latitude: number;
  longitude: number;
}

export interface ProvenanceEvent {
  id: string;
  event_type: string;
  timestamp: string;
  location: ProvenanceLocation;
  custodian: string;
  status: ProvenanceStatus;
  certificates: ProvenanceCertificate[];
  temperatureLogs?: Array<{ timestamp: string; celsius: number }>;
  merkleRoot?: string;
  leafHash?: string;
}

export interface ProvenanceBatch {
  batch_id: string;
  productName: string;
  events: ProvenanceEvent[];
}

export interface VerificationResult {
  status: "idle" | "loading" | "verified" | "failed";
  message?: string;
  transactionHash?: string;
}
