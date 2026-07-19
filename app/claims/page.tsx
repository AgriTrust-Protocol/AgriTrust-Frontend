"use client";

import { ClaimChat } from "@/src/components/claims/ClaimChat";
import { ClaimForm } from "@/src/components/claims/ClaimForm";
import { ClaimStatusStepper } from "@/src/components/claims/ClaimStatusStepper";
import { type InsuranceClaim } from "@/src/components/claims/claimTypes";

const sampleClaim: InsuranceClaim = {
  id: "CLM-2026-0719",
  crop: "Maize",
  field: "North Field",
  geography: "North district",
  damageDescription: "Drought stress across the eastern rows.",
  status: "under_review",
  adjuster: "Maya Okafor",
  documents: [
    { id: "doc-1", fileName: "damage-photo.jpg", fileSize: 2400000, fileType: "image/jpeg", evidenceType: "damage_photos", uploadProgress: 100, chunks: 1 },
    { id: "doc-2", fileName: "rainfall-report.pdf", fileSize: 7400000, fileType: "application/pdf", evidenceType: "weather_reports", uploadProgress: 100, chunks: 2 },
  ],
  timeline: [
    { status: "filed", completedAt: "2026-07-19T09:00:00.000Z" },
    { status: "evidence_submission", completedAt: "2026-07-19T09:08:00.000Z" },
    { status: "under_review", completedAt: "2026-07-19T09:15:00.000Z" },
    { status: "approved" },
    { status: "paid" },
  ],
  messages: [{ id: "msg-1", author: "adjuster", body: "I received the evidence and will review the weather report today.", createdAt: "2026-07-19T09:20:00.000Z" }],
};

export default function ClaimsPage() {
  return <main className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-900"><div className="mx-auto max-w-6xl space-y-8"><header><p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Insurance</p><h1 className="mt-2 text-4xl font-bold">Claims portal</h1><p className="mt-2 max-w-2xl text-zinc-600">File crop insurance claims, upload evidence, track lifecycle status, message adjusters, and receive automatic parametric payouts when oracle triggers are met.</p></header><section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]"><ClaimForm /><div className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">Active claim</h2><ClaimStatusStepper status={sampleClaim.status} timeline={sampleClaim.timeline}/><div className="rounded-xl bg-zinc-50 p-4 text-sm"><p><b>Claim:</b> {sampleClaim.id}</p><p><b>Adjuster:</b> {sampleClaim.adjuster}</p><p><b>Documents:</b> {sampleClaim.documents.length}/10 uploaded</p></div><ClaimChat claimId={sampleClaim.id} initialMessages={sampleClaim.messages}/></div></section></div></main>;
}
