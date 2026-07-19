"use client";

import type { WizardStepConfig, WizardStepData, WizardValidationError } from "@/src/components/wizard/types";

interface StepRendererProps {
  step: WizardStepConfig;
  data: WizardStepData;
  errors: WizardValidationError[];
  onUpdate: (field: string, value: WizardStepData[string]) => void;
  onBlur: (field: string) => void;
}

export function StepRenderer({ step, data, errors, onUpdate, onBlur }: StepRendererProps) {
  const Component = step.component;
  return <Component data={data} errors={errors.filter((error) => error.stepId === step.id)} onUpdate={onUpdate} onBlur={onBlur} />;
}
