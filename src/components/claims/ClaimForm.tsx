"use client";

import { useState } from "react";
import { useClaim } from "@/src/hooks/useClaim";
import { DocumentUploader } from "./DocumentUploader";
import { type ClaimDraft, type EvidenceType } from "./claimTypes";

const evidenceTypes: { value: EvidenceType; label: string }[] = [
  { value: "damage_photos", label: "Damage photos" }, { value: "weather_reports", label: "Weather reports" }, { value: "police_reports", label: "Police reports" }, { value: "lab_analyses", label: "Lab analyses" },
];

export function ClaimForm() {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<ClaimDraft>({ crop: "", field: "", geography: "", damageDescription: "", evidenceType: "damage_photos", parametricTriggerMet: false, documents: [] });
  const { submitClaim } = useClaim();
  const canContinue = step === 1 ? draft.crop && draft.field && draft.geography : draft.damageDescription && draft.documents.length > 0;
  return <form onSubmit={(event) => { event.preventDefault(); submitClaim.mutate(draft); }} className="rounded-2xl border bg-white p-6 shadow-sm">
    <div className="mb-6 flex gap-2">{[1, 2, 3].map((item) => <span key={item} className={`h-2 flex-1 rounded-full ${item <= step ? "bg-emerald-600" : "bg-zinc-200"}`} />)}</div>
    {step === 1 && <div className="grid gap-4 sm:grid-cols-3"><Input label="Crop" value={draft.crop} onChange={(crop) => setDraft({ ...draft, crop })}/><Input label="Field" value={draft.field} onChange={(field) => setDraft({ ...draft, field })}/><Input label="Geography" value={draft.geography} onChange={(geography) => setDraft({ ...draft, geography })}/></div>}
    {step === 2 && <div className="space-y-4"><label className="block text-sm font-medium">Damage description<textarea value={draft.damageDescription} onChange={(event) => setDraft({ ...draft, damageDescription: event.target.value })} className="mt-1 min-h-28 w-full rounded-lg border px-3 py-2" /></label><label className="block text-sm font-medium">Evidence type<select value={draft.evidenceType} onChange={(event) => setDraft({ ...draft, evidenceType: event.target.value as EvidenceType })} className="mt-1 w-full rounded-lg border px-3 py-2">{evidenceTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label><DocumentUploader files={draft.documents} evidenceType={draft.evidenceType} onChange={(documents) => setDraft({ ...draft, documents })}/><label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.parametricTriggerMet} onChange={(event) => setDraft({ ...draft, parametricTriggerMet: event.target.checked })}/>Oracle confirms drought trigger for instant parametric payout</label></div>}
    {step === 3 && <div className="space-y-3 text-sm"><h2 className="text-xl font-bold">Review claim</h2><p><b>Crop:</b> {draft.crop}</p><p><b>Field:</b> {draft.field}</p><p><b>Evidence:</b> {draft.documents.length} document(s)</p><p><b>Path:</b> {draft.parametricTriggerMet ? "Automatic parametric payout" : "Adjuster review"}</p></div>}
    <div className="mt-6 flex justify-between"><button type="button" onClick={() => setStep(Math.max(1, step - 1))} className="rounded-lg px-4 py-2 text-sm font-semibold">Back</button>{step < 3 ? <button disabled={!canContinue} type="button" onClick={() => setStep(step + 1)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Continue</button> : <button disabled={submitClaim.isPending} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Submit claim</button>}</div>
  </form>;
}
function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-sm font-medium">{label}<input required value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>; }
