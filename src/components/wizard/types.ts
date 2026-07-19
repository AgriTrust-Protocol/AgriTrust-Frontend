import type { ComponentType } from "react";

export type WizardStepStatus = "incomplete" | "complete" | "error" | "skipped";
export type WizardFieldValue = string | number | boolean | null | Blob | Blob[] | string[];
export type WizardStepData = Record<string, WizardFieldValue>;
export type WizardFormData = Record<string, WizardStepData>;

export interface WizardValidationError {
  field: string;
  message: string;
  stepId: string;
}

export interface WizardStepComponentProps {
  data: WizardStepData;
  errors: WizardValidationError[];
  onUpdate: (field: string, value: WizardFieldValue) => void;
  onBlur: (field: string) => void;
}

export interface WizardStepConfig {
  id: string;
  title: string;
  component: ComponentType<WizardStepComponentProps>;
  dependsOn?: (formData: WizardFormData) => boolean;
  validate?: (data: WizardStepData, formData: WizardFormData) => WizardValidationError[];
  defaults?: WizardStepData;
  nextLabel?: string;
}

export interface WizardDraft {
  id: string;
  formData: WizardFormData;
  currentStepId: string;
  updatedAt: number;
}
