import type { ClaimStatus } from "@/src/hooks/useClaim";

const stages: { id: ClaimStatus; label: string }[] = [
  { id: "filed", label: "Filed" }, { id: "evidence_submission", label: "Evidence" }, { id: "under_review", label: "Under review" }, { id: "approved", label: "Approved" }, { id: "paid", label: "Paid" },
];

export function ClaimStatusStepper({ status, updatedAt }: { status: ClaimStatus; updatedAt: string }) {
  const current = stages.findIndex((stage) => stage.id === status);
  const rejected = status === "rejected";
  return <div aria-label={`Claim status: ${rejected ? "Rejected" : stages[current]?.label}`} className="flex w-full flex-wrap gap-y-4">
    {stages.map((stage, index) => <div key={stage.id} className="flex min-w-[110px] flex-1 items-start">
      <div><div className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${rejected && index === current ? "bg-red-600 text-white" : index < current || status === stage.id ? "bg-emerald-600 text-white" : "bg-zinc-200 text-zinc-500"}`}>{index < current ? "✓" : index + 1}</div><p className="mt-2 text-xs font-semibold text-zinc-700">{stage.label}</p><p className="mt-1 text-[11px] text-zinc-500">{index < current || status === stage.id ? new Date(updatedAt).toLocaleDateString() : "Pending"}</p></div>
      {index < stages.length - 1 && <div className={`mt-4 h-0.5 flex-1 ${index < current ? "bg-emerald-600" : "bg-zinc-200"}`} />}
    </div>)}
    {rejected && <p className="basis-full rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">This claim was rejected. Contact your adjuster for the decision details.</p>}
  </div>;
}