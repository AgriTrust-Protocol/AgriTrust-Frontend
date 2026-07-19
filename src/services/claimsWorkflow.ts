import { type ClaimDraft, type ClaimMessage, type ClaimStatus, type InsuranceClaim } from "@/src/components/claims/claimTypes";

export const adjusterPool = [
  { name: "Maya Okafor", geography: "North", activeClaims: 12 },
  { name: "Luis Rivera", geography: "South", activeClaims: 8 },
  { name: "Amina Yusuf", geography: "East", activeClaims: 19 },
  { name: "Jon Bell", geography: "West", activeClaims: 15 },
];

export function assignAdjuster(geography: string) {
  const eligible = adjusterPool.filter((adjuster) => adjuster.activeClaims < 20);
  const local = eligible.filter((adjuster) => geography.toLowerCase().includes(adjuster.geography.toLowerCase()));
  return [...(local.length ? local : eligible)].sort((a, b) => a.activeClaims - b.activeClaims)[0]?.name ?? "Claims desk";
}

export function claimTimeline(status: ClaimStatus, completedAt = new Date().toISOString()) {
  const statuses: ClaimStatus[] = ["filed", "evidence_submission", "under_review", "approved", "paid"];
  return statuses.map((item) => ({ status: item, completedAt: statuses.indexOf(item) <= statuses.indexOf(status) ? completedAt : undefined }));
}

export function buildSubmittedClaim(draft: ClaimDraft, now = new Date()) {
  const status: ClaimStatus = draft.parametricTriggerMet ? "paid" : "under_review";
  const systemMessage: ClaimMessage = { id: `msg-${now.getTime()}`, author: "system", body: draft.parametricTriggerMet ? "Oracle confirmed drought trigger. Parametric payout released automatically." : "Claim filed and assigned to an adjuster for review.", createdAt: now.toISOString() };
  const claim: InsuranceClaim = { id: `CLM-${now.getTime()}`, ...draft, status, adjuster: draft.parametricTriggerMet ? undefined : assignAdjuster(draft.geography), payoutCents: draft.parametricTriggerMet ? 250000 : undefined, timeline: claimTimeline(status, now.toISOString()), messages: [systemMessage] };
  return claim;
}
