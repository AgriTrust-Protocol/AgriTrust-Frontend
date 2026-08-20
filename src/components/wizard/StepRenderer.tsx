"use client";

import type { FarmStepComponentProps, FarmStepConfig } from "@/src/types/farmWizard";

export function StepRenderer({ step, props }: { step: FarmStepConfig; props: FarmStepComponentProps }) {
  const Component = step.component;
  return <Component {...props} />;
}
