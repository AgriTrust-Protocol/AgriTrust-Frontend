"use client";

import type { WizardStepConfig, WizardStepStatus } from "@/src/components/wizard/types";

interface StepOverviewProps {
  steps: WizardStepConfig[];
  currentStepId: string;
  statuses: Record<string, WizardStepStatus>;
  onSelectStep?: (stepId: string) => void;
}

const LABELS: Record<WizardStepStatus, string> = {
  incomplete: "Incomplete",
  complete: "Complete",
  error: "Error",
  skipped: "Skipped",
};

export function StepOverview({ steps, currentStepId, statuses, onSelectStep }: StepOverviewProps) {
  return (
    <aside aria-label="Step overview">
      <ol>
        {steps.map((step) => {
          const status = statuses[step.id] ?? "incomplete";
          return (
            <li key={step.id} data-status={status} aria-current={step.id === currentStepId ? "step" : undefined}>
              <button type="button" disabled={status === "skipped"} onClick={() => onSelectStep?.(step.id)}>
                <span>{step.title}</span>
                <span>{LABELS[status]}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
