"use client";

import { useMemo } from "react";
import type { AuditRecord, SyncQueueEntry } from "@/src/services/indexedDbStore";

export interface ConflictResolverProps {
  entry: SyncQueueEntry;
  localRecord: AuditRecord;
  onAcceptLocal: (entry: SyncQueueEntry) => void | Promise<void>;
  onAcceptServer: (entry: SyncQueueEntry) => void | Promise<void>;
}

interface DiffRow { field: string; localValue: string; serverValue: string; changed: boolean }

function stringify(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export function buildInspectionDiff(localRecord: AuditRecord, serverRecord?: AuditRecord): DiffRow[] {
  if (!serverRecord) return [];
  const fields = new Set([...Object.keys(localRecord), ...Object.keys(serverRecord)]);
  return [...fields].map((field) => {
    const localValue = (localRecord as unknown as Record<string, unknown>)[field];
    const serverValue = (serverRecord as unknown as Record<string, unknown>)[field];
    return { field, localValue: stringify(localValue), serverValue: stringify(serverValue), changed: JSON.stringify(localValue) !== JSON.stringify(serverValue) };
  });
}

export default function ConflictResolver({ entry, localRecord, onAcceptLocal, onAcceptServer }: ConflictResolverProps) {
  const rows = useMemo(() => buildInspectionDiff(localRecord, entry.serverVersion), [entry.serverVersion, localRecord]);
  const changedRows = rows.filter((row) => row.changed);

  if (entry.status !== "needs_review") return null;

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950/30" aria-label="Offline conflict review">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-amber-900 dark:text-amber-100">Manual review required</h2>
          <p className="text-amber-800 dark:text-amber-200">This inspection changed offline while another version was saved online. Last-write-wins is available, but changed fields are flagged below.</p>
        </div>
        <span className="rounded-full bg-amber-200 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-800 dark:text-amber-50">{changedRows.length} conflicts</span>
      </div>
      <div className="overflow-x-auto rounded border border-amber-200 bg-white dark:border-amber-800 dark:bg-gray-900">
        <table className="min-w-full divide-y divide-amber-200 dark:divide-amber-800">
          <thead><tr><th className="px-3 py-2 text-left">Field</th><th className="px-3 py-2 text-left">Offline value</th><th className="px-3 py-2 text-left">Server value</th></tr></thead>
          <tbody>{changedRows.map((row) => <tr key={row.field} className="align-top"><td className="px-3 py-2 font-medium">{row.field}</td><td className="whitespace-pre-wrap px-3 py-2 text-green-700 dark:text-green-300">{row.localValue}</td><td className="whitespace-pre-wrap px-3 py-2 text-blue-700 dark:text-blue-300">{row.serverValue}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="rounded bg-green-600 px-3 py-1.5 font-medium text-white" onClick={() => void onAcceptLocal(entry)}>Keep offline changes</button>
        <button className="rounded bg-blue-600 px-3 py-1.5 font-medium text-white" onClick={() => void onAcceptServer(entry)}>Use server version</button>
      </div>
    </section>
  );
}
