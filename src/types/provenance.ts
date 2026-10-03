/* Authorized Protocol Quality Assurance & Formal Verification Test Suite */
/**
 * Provenance & Supply Chain Traceability Types
 * Reference Implementation for Issue #165
 */

export type CustodyEventType = 
  | 'harvest' 
  | 'processing' 
  | 'storage' 
  | 'transit' 
  | 'inspection' 
  | 'retail';

export interface LocationCoordinates {
  name: string;
  lat: number;
  lng: number;
  address?: string;
  facility_id?: string;
}

export interface CustodianInfo {
  name: string;
  role: string;
  address: string;
  organization?: string;
  verified?: boolean;
}

export interface CertificateRecord {
  id: string;
  name: string;
  type: 'treatment' | 'lab_result' | 'inspection' | 'organic' | 'phytosanitary';
  issuer: string;
  issued_at: string;
  url: string;
  content_hash: string;
}

export interface TemperatureReading {
  timestamp: string;
  temp_celsius: number;
  humidity_percent?: number;
}

export interface MerkleProofData {
  root: string;
  leaf: string;
  proof: string[];
  block_number?: number;
  tx_hash?: string;
  contract_address?: string;
  verified?: boolean;
}

export interface CustodyEvent {
  id: string;
  batch_id: string;
  event_type: CustodyEventType;
  title: string;
  timestamp: string;
  location: LocationCoordinates;
  custodian: CustodianInfo;
  notes?: string;
  temperature_logs?: TemperatureReading[];
  certificates: CertificateRecord[];
  merkle_proof: MerkleProofData;
}

export interface BatchProvenance {
  batch_id: string;
  product_name: string;
  crop_type: string;
  origin_farm: string;
  harvest_date: string;
  current_status: 'in_transit' | 'processed' | 'stored' | 'delivered';
  qr_url: string;
  events: CustodyEvent[];
  merkle_root: string;
  created_at: string;
  updated_at: string;
}

export interface VerificationResult {
  verified: boolean;
  event_id: string;
  root: string;
  leaf: string;
  block_number?: number;
  verification_timestamp: number;
  error?: string;
}
