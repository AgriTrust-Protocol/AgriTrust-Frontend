import type { FarmField, FarmFieldError, FarmFormData, FarmStepContext } from "@/src/types/farmWizard";

export function validateFarmField(field: FarmField, data: FarmFormData): FarmFieldError[] {
  const value = data[field];
  if (["farmName", "farmType", "region", "address", "cropType", "fieldType"].includes(field) && typeof value === "string" && !value.trim()) {
    return [{ field, message: "This field is required" }];
  }
  if (field === "fieldCount" && (typeof value !== "number" || !Number.isInteger(value) || value < 1)) {
    return [{ field, message: "Enter at least one field" }];
  }
  if (field === "insuranceProvider" && data.insuranceRequired && typeof value === "string" && !value.trim()) {
    return [{ field, message: "Insurance provider is required" }];
  }
  return [];
}

export function validateFarmStep(context: FarmStepContext, fields: FarmField[]): FarmFieldError[] {
  return fields.flatMap((field) => validateFarmField(field, context.data));
}
