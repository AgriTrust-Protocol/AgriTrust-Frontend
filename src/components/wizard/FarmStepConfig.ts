import { validateFarmStep } from "@/src/utils/farmValidation";
import type { FarmStepConfig } from "@/src/types/farmWizard";
import { FarmCropStep, FarmDocumentsStep, FarmFieldStep, FarmIdentityStep, FarmInsuranceStep, FarmLocationStep, FarmReviewStep } from "@/src/components/wizard/FarmSteps";

export const FARM_STEPS: FarmStepConfig[] = [
  { id: "identity", label: "Farm identity", component: FarmIdentityStep, fields: ["farmName", "farmType"], validate: ({ data, attachments }) => validateFarmStep({ data, attachments }, ["farmName", "farmType"]) },
  { id: "location", label: "Location", component: FarmLocationStep, fields: ["region", "address"], validate: ({ data, attachments }) => validateFarmStep({ data, attachments }, ["region", "address"]) },
  { id: "crops", label: "Crops", component: FarmCropStep, fields: ["cropType"], validate: ({ data, attachments }) => validateFarmStep({ data, attachments }, ["cropType"]) },
  { id: "fields", label: "Fields", component: FarmFieldStep, dependsOn: (data) => data.cropType.toLowerCase() !== "livestock", defaults: { fieldType: "pasture", fieldCount: 1 }, fields: ["fieldType", "fieldCount"], validate: ({ data, attachments }) => validateFarmStep({ data, attachments }, ["fieldType", "fieldCount"]) },
  { id: "insurance", label: "Insurance", component: FarmInsuranceStep, dependsOn: (data) => data.region.toLowerCase() !== "remote", defaults: { insuranceRequired: false, insuranceProvider: "" }, fields: ["insuranceRequired", "insuranceProvider"], validate: ({ data, attachments }) => validateFarmStep({ data, attachments }, ["insuranceProvider"]) },
  { id: "documents", label: "Documents", component: FarmDocumentsStep, fields: ["notes"], validate: () => [] },
  { id: "review", label: "Review", component: FarmReviewStep, validate: () => [], nextLabel: "Submit" },
];
