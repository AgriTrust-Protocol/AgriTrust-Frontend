import { type ClaimStatus, type ClaimTimelineItem } from "./claimTypes";

const stages: { status: ClaimStatus; label: string }[] = [
  { status: "filed", label: "Filed" }, { status: "evidence_submission", label: "Evidence" }, { status: "under_review", label: "Under review" }, { status: "approved", label: "Approved" }, { status: "paid", label: "Paid" },
];

export function ClaimStatusStepper({ status, timeline }: { status: ClaimStatus; timeline: ClaimTimelineItem[] }) {
  if (status === "rejected") return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 font-semibold text-rose-800">Claim rejected</div>;
  const activeIndex = stages.findIndex((stage) => stage.status === status);
  return <ol className="grid gap-3 sm:grid-cols-5">{stages.map((stage, index) => {
    const done = index < activeIndex || stage.status === "paid" && status === "paid";
    const active = index === activeIndex;
    const completedAt = timeline.find((item) => item.status === stage.status)?.completedAt;
    return <li key={stage.status} className={`rounded-xl border p-3 ${done ? "border-emerald-300 bg-emerald-50" : active ? "border-blue-300 bg-blue-50" : "border-zinc-200 bg-white"}`}><span className="text-xs font-semibold uppercase tracking-wide">{done ? "Completed" : active ? "Active" : "Pending"}</span><p className="font-semibold">{stage.label}</p>{completedAt && <time className="text-xs text-zinc-500">{new Date(completedAt).toLocaleString()}</time>}</li>;
  })}</ol>;
}
