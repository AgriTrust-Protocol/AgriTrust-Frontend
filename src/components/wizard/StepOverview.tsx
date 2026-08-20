"use client";

import type { FarmStepConfig, FarmStepStatus } from "@/src/types/farmWizard";

export function StepOverview({ steps, statuses, currentStepId, onSelect }: { steps: FarmStepConfig[]; statuses: Map<string, FarmStepStatus>; currentStepId: string; onSelect: (id: string) => void }) {
  return (
    <aside aria-label="Farm registration steps">
      <ol>
        {steps.map((step) => {
          const status = statuses.get(step.id) ?? "incomplete";
          return <li key={step.id} data-status={status}><button type="button" aria-current={currentStepId === step.id ? "step" : undefined} disabled={status === "skipped"} onClick={() => onSelect(step.id)}>{step.label} <span aria-label={status}>{status}</span></button></li>;
        })}
      </ol>
    </aside>
  );
}
