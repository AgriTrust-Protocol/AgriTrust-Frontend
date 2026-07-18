export type ParcelStatus = "owned" | "listed" | "in_dispute";

export interface TitleDocument {
  id: string;
  label: string;
  type: "pdf" | "image" | "link";
  uri: string;
}

export interface TransferRecord {
  from: string;
  to: string;
  timestamp: string;
  txHash: string;
}

export interface LandTitle {
  tokenId: string;
  parcelId: string;
  name: string;
  owner: string;
  status: ParcelStatus;
  coordinates: [number, number][];
  location: string;
  areaHectares: number;
  cropType: string;
  soilClassification: string;
  marketValue: number;
  tokenUri?: string;
  documents: TitleDocument[];
  history: TransferRecord[];
}

export const titleStatus = {
  owned: { label: "Verified owner", color: "#16a34a" },
  listed: { label: "Listed for sale", color: "#d97706" },
  in_dispute: { label: "Under dispute", color: "#dc2626" },
} as const;
