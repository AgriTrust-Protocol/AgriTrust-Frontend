import type { WizardStepConfig, WizardStepData, WizardValidationError } from "@/src/components/wizard/types";

export type FieldValidator = (value: unknown, data: WizardStepData) => string | undefined;

export const required = (message = "This field is required"): FieldValidator => (value) => {
  if (value === null || value === undefined || value === "") return message;
  return undefined;
};

export const positiveNumber = (message = "Enter a number greater than zero"): FieldValidator => (value) => {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? undefined : message;
};

export function validateFields(
  stepId: string,
  data: WizardStepData,
  validators: Record<string, FieldValidator[]>
): WizardValidationError[] {
  return Object.entries(validators).flatMap(([field, fieldValidators]) => {
    for (const validator of fieldValidators) {
      const message = validator(data[field], data);
      if (message) return [{ stepId, field, message }];
    }
    return [];
  });
}

export function validateWizardStep(step: WizardStepConfig, data: WizardStepData, formData: Record<string, WizardStepData>): WizardValidationError[] {
  return step.validate?.(data, formData) ?? [];
}
