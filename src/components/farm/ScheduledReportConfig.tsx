// src/components/farm/ScheduledReportConfig.tsx
"use client";

import { useEffect, useState } from "react";
import type {
  ExportFormat,
  ReportConfig,
  ScheduleFrequency,
  ScheduledReportConfig as ScheduledReportConfigType,
} from "@/src/types/farm";

const STORAGE_KEY_PREFIX = "agritrust:scheduledReports:";
const REPORT_CONFIGS_KEY = "agritrust:reportConfigs";

function loadReportConfigs(): ReportConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(REPORT_CONFIGS_KEY);
    return raw ? (JSON.parse(raw) as ReportConfig[]) : [];
  } catch {
    return [];
  }
}

function loadSchedules(farmId: string): ScheduledReportConfigType[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + farmId);
    return raw ? (JSON.parse(raw) as ScheduledReportConfigType[]) : [];
  } catch {
    return [];
  }
}

function saveSchedules(farmId: string, schedules: ScheduledReportConfigType[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY_PREFIX + farmId, JSON.stringify(schedules));
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

interface ScheduledReportConfigProps {
  farmId: string;
}

export default function ScheduledReportConfig({ farmId }: ScheduledReportConfigProps) {
  const [reportConfigs, setReportConfigs] = useState<ReportConfig[]>([]);
  const [schedules, setSchedules] = useState<ScheduledReportConfigType[]>([]);

  const [reportConfigId, setReportConfigId] = useState<string>("");
  const [frequency, setFrequency] = useState<ScheduleFrequency>("weekly");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [recipientInput, setRecipientInput] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setReportConfigs(loadReportConfigs());
    setSchedules(loadSchedules(farmId));
  }, [farmId]);

  function resetForm() {
    setReportConfigId("");
    setFrequency("weekly");
    setFormat("csv");
    setRecipientInput("");
    setRecipients([]);
    setError(null);
    setEditingId(null);
  }

  function addRecipient() {
    const email = recipientInput.trim();
    if (!email) return;
    if (!isValidEmail(email)) {
      setError(`"${email}" doesn't look like a valid email`);
      return;
    }
    if (recipients.includes(email)) {
      setRecipientInput("");
      return;
    }
    setRecipients((prev) => [...prev, email]);
    setRecipientInput("");
    setError(null);
  }

  function removeRecipient(email: string) {
    setRecipients((prev) => prev.filter((r) => r !== email));
  }

  function handleRecipientKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addRecipient();
    }
  }

  function handleSubmit() {
    setError(null);
    if (recipients.length === 0) {
      setError("Add at least one recipient");
      return;
    }

    const schedule: ScheduledReportConfigType = {
      id: editingId ?? `sched_${Date.now()}`,
      farmId,
      reportConfigId: reportConfigId || null,
      frequency,
      recipients,
      format,
    };

    const next = editingId
      ? schedules.map((s) => (s.id === editingId ? schedule : s))
      : [...schedules, schedule];

    setSchedules(next);
    saveSchedules(farmId, next);
    resetForm();
  }

  function handleEdit(schedule: ScheduledReportConfigType) {
    setEditingId(schedule.id);
    setReportConfigId(schedule.reportConfigId ?? "");
    setFrequency(schedule.frequency);
    setFormat(schedule.format);
    setRecipients(schedule.recipients);
    setRecipientInput("");
    setError(null);
  }

  function handleDelete(id: string) {
    const next = schedules.filter((s) => s.id !== id);
    setSchedules(next);
    saveSchedules(farmId, next);
    if (editingId === id) resetForm();
  }

  function reportConfigName(id: string | null): string {
    if (!id) return "All columns (no saved report)";
    return reportConfigs.find((c) => c.id === id)?.name ?? "Unknown report";
  }

  return (
    <div
      className="rounded-lg border border-gray-200 p-4 space-y-4"
      data-testid="scheduled-report-config"
    >
      <h3 className="text-sm font-semibold text-gray-900">
        {editingId ? "Edit scheduled report" : "Schedule a report"}
      </h3>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Report</label>
          <select
            value={reportConfigId}
            onChange={(e) => setReportConfigId(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
          >
            <option value="">All columns (no saved report)</option>
            {reportConfigs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Frequency</label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Format</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
          >
            <option value="csv">CSV</option>
            <option value="pdf">PDF</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Recipients</label>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {recipients.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 rounded-full px-2 py-0.5"
            >
              {email}
              <button
                type="button"
                onClick={() => removeRecipient(email)}
                className="text-gray-400 hover:text-red-600"
                aria-label={`Remove ${email}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="email"
            value={recipientInput}
            onChange={(e) => setRecipientInput(e.target.value)}
            onKeyDown={handleRecipientKeyDown}
            onBlur={addRecipient}
            placeholder="name@example.com"
            className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5"
          />
          <button
            type="button"
            onClick={addRecipient}
            className="text-xs px-2 py-1.5 rounded border border-gray-300"
          >
            Add
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSubmit}
          className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white"
        >
          {editingId ? "Save changes" : "Create schedule"}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={resetForm}
            className="text-sm px-3 py-1.5 rounded border border-gray-300"
          >
            Cancel
          </button>
        )}
      </div>

      {schedules.length > 0 && (
        <div className="pt-3 border-t border-gray-100 space-y-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase">Active schedules</h4>
          {schedules.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between text-sm border border-gray-100 rounded px-3 py-2"
            >
              <div>
                <div className="font-medium text-gray-900">
                  {reportConfigName(s.reportConfigId)}
                </div>
                <div className="text-xs text-gray-500">
                  {s.frequency} · {s.format.toUpperCase()} · {s.recipients.length} recipient
                  {s.recipients.length === 1 ? "" : "s"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleEdit(s)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
