"use client";

/**
 * Certification action buttons gated by the declarative PermissionGate.
 *
 * Demonstrates the audited wiring for the certification workflow:
 *  - "Issue Certificate"   → certificate/issue   (CERTIFICATION_MANAGER+)
 *  - "Verify Inspection"   → certificate/verify  (FIELD_INSPECTOR+)
 *  - "Revoke Certificate"  → certificate/revoke  (CERTIFICATION_MANAGER+)
 *
 * Buttons the current role may not exercise are rendered disabled rather
 * than hidden so operators can see which capabilities exist.
 */

import { PermissionGate } from "@/src/components/common/PermissionGate";

function ActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-400 disabled:hover:bg-transparent dark:border-emerald-500 dark:text-emerald-400 dark:hover:bg-emerald-950/40 dark:disabled:border-zinc-700 dark:disabled:text-zinc-600 dark:disabled:hover:bg-transparent"
    >
      {label}
    </button>
  );
}

export function CertificateActions() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PermissionGate resource="certificate" action="issue" fallback="disable">
        <ActionButton label="Issue Certificate" />
      </PermissionGate>
      <PermissionGate resource="certificate" action="verify" fallback="disable">
        <ActionButton label="Verify Inspection" />
      </PermissionGate>
      <PermissionGate resource="certificate" action="revoke" fallback="disable">
        <ActionButton label="Revoke Certificate" />
      </PermissionGate>
    </div>
  );
}
