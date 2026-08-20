"use client";

import { useCallback, useState } from "react";

export type ClaimStatus = "filed" | "evidence_submission" | "under_review" | "approved" | "paid" | "rejected";
export type EvidenceType = "Damage photos" | "Weather report" | "Police report" | "Lab analysis";

export interface ClaimDocument {
  id: string;
  name: string;
  size: number;
  type: string;
  evidenceType: EvidenceType;
  progress: number;
}

export interface ClaimMessage {
  id: string;
  sender: "farmer" | "adjuster";
  body: string;
  createdAt: string;
}

export interface Claim {
  id: string;
  crop: string;
  field: string;
  location: string;
  incidentDate: string;
  description: string;
  status: ClaimStatus;
  createdAt: string;
  updatedAt: string;
  adjuster: { name: string; region: string };
  documents: ClaimDocument[];
  messages: ClaimMessage[];
  parametric: boolean;
}

const STORAGE_KEY = "agritrust.claims";

const demoClaim: Claim = {
  id: "CLM-2026-00418",
  crop: "Winter wheat",
  field: "North 40",
  location: "Kisumu County, Kenya",
  incidentDate: "2026-08-12",
  description: "Extended drought has damaged the crop during flowering.",
  status: "under_review",
  createdAt: "2026-08-13T08:30:00.000Z",
  updatedAt: "2026-08-18T14:10:00.000Z",
  adjuster: { name: "Amina Otieno", region: "Western Kenya" },
  documents: [],
  messages: [
    { id: "m1", sender: "adjuster", body: "I have your claim and will review the field evidence today.", createdAt: "2026-08-18T14:10:00.000Z" },
  ],
  parametric: true,
};

function readClaims(): Claim[] {
  if (typeof window === "undefined") return [demoClaim];
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return [demoClaim];
  try {
    return JSON.parse(stored) as Claim[];
  } catch {
    return [demoClaim];
  }
}

function persistClaims(claims: Claim[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(claims));
}

export function useClaims() {
  const [claims, setClaims] = useState<Claim[]>(readClaims);

  const createClaim = useCallback((input: Pick<Claim, "crop" | "field" | "location" | "incidentDate" | "description"> & { documents: ClaimDocument[]; parametric: boolean }) => {
    const now = new Date().toISOString();
    const claim: Claim = {
      ...input,
      id: `CLM-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
      status: input.documents.length ? "evidence_submission" : "filed",
      createdAt: now,
      updatedAt: now,
      adjuster: { name: "Pending assignment", region: input.location },
      messages: [],
    };
    setClaims((current) => {
      const next = [claim, ...current];
      persistClaims(next);
      return next;
    });
    return claim;
  }, []);

  const updateClaim = useCallback((claimId: string, update: Partial<Claim>) => {
    setClaims((current) => {
      const next = current.map((claim) => claim.id === claimId ? { ...claim, ...update, updatedAt: new Date().toISOString() } : claim);
      persistClaims(next);
      return next;
    });
  }, []);

  return { claims, createClaim, updateClaim };
}

export function useClaim(claimId?: string) {
  const result = useClaims();
  return { ...result, claim: result.claims.find((claim) => claim.id === claimId) ?? result.claims[0] };
}