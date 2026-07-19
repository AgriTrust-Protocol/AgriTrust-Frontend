export type ClaimStatus = "filed" | "evidence_submission" | "under_review" | "approved" | "paid" | "rejected";
export type EvidenceType = "damage_photos" | "weather_reports" | "police_reports" | "lab_analyses";

export interface ClaimDocument {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  evidenceType: EvidenceType;
  uploadProgress: number;
  chunks: number;
}

export interface ClaimMessage {
  id: string;
  author: "farmer" | "adjuster" | "system";
  body: string;
  createdAt: string;
}

export interface ClaimTimelineItem {
  status: ClaimStatus;
  completedAt?: string;
}

export interface InsuranceClaim {
  id: string;
  crop: string;
  field: string;
  geography: string;
  damageDescription: string;
  status: ClaimStatus;
  documents: ClaimDocument[];
  adjuster?: string;
  payoutCents?: number;
  parametricTriggerMet?: boolean;
  timeline: ClaimTimelineItem[];
  messages: ClaimMessage[];
}

export interface ClaimDraft {
  crop: string;
  field: string;
  geography: string;
  damageDescription: string;
  evidenceType: EvidenceType;
  parametricTriggerMet: boolean;
  documents: ClaimDocument[];
}
