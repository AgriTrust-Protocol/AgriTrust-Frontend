"use client";

import { useState, type FormEvent } from "react";
import type { ExportFormat, ReportFrequency } from "@/src/hooks/useFarmData";

export function ScheduledReportConfig({ farmId, reportId }: { farmId: string; reportId?: string }) {
  const [frequency, setFrequency] = useState<ReportFrequency>("weekly");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [recipients, setRecipients] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    await fetch(`/api/farms/${farmId}/scheduled-reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId, frequency, format, recipients: recipients.split(",").map((email) => email.trim()).filter(Boolean) }) });
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-4">
      <label className="grid gap-1 text-sm font-medium">Frequency<select value={frequency} onChange={(event) => setFrequency(event.target.value as ReportFrequency)} className="rounded border px-3 py-2"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
      <label className="grid gap-1 text-sm font-medium">Format<select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)} className="rounded border px-3 py-2"><option value="csv">CSV</option><option value="pdf">PDF</option></select></label>
      <label className="grid gap-1 text-sm font-medium md:col-span-2">Recipients<input value={recipients} onChange={(event) => setRecipients(event.target.value)} className="rounded border px-3 py-2" placeholder="ops@example.com, finance@example.com" type="text" /></label>
      <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white md:col-start-4" type="submit">Schedule report</button>
    </form>
  );
}
