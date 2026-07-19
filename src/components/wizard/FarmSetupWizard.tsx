"use client";

import { WizardContainer } from "@/src/components/wizard/WizardContainer";
import type { WizardStepComponentProps, WizardStepConfig } from "@/src/components/wizard/types";
import { positiveNumber, required, validateFields } from "@/src/utils/validation";

function TextInput({ data, errors, onUpdate, onBlur, field, label }: WizardStepComponentProps & { field: string; label: string }) {
  const error = errors.find((item) => item.field === field)?.message;
  return <label htmlFor={field}>{label}<input id={field} value={String(data[field] ?? "")} aria-invalid={Boolean(error)} onBlur={() => onBlur(field)} onChange={(event) => onUpdate(field, event.target.value)} />{error ? <span>{error}</span> : null}</label>;
}

function SelectInput({ data, onUpdate, field, label, options }: WizardStepComponentProps & { field: string; label: string; options: string[] }) {
  return <label htmlFor={field}>{label}<select id={field} value={String(data[field] ?? "")} onChange={(event) => onUpdate(field, event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function NumberInput({ data, errors, onUpdate, onBlur, field, label }: WizardStepComponentProps & { field: string; label: string }) {
  const error = errors.find((item) => item.field === field)?.message;
  const value = typeof data[field] === "number" ? data[field] : 0;
  return <label htmlFor={field}>{label}<input id={field} type="number" value={value} aria-invalid={Boolean(error)} onBlur={() => onBlur(field)} onChange={(event) => onUpdate(field, event.target.valueAsNumber)} />{error ? <span>{error}</span> : null}</label>;
}

function FileInput({ onUpdate, field, label }: WizardStepComponentProps & { field: string; label: string }) {
  return <label htmlFor={field}>{label}<input id={field} type="file" multiple onChange={(event) => onUpdate(field, Array.from(event.target.files ?? []))} /></label>;
}

const FarmIdentityStep = (props: WizardStepComponentProps) => <fieldset><legend>Farm identity</legend><TextInput {...props} field="farmName" label="Farm name" /><SelectInput {...props} field="farmType" label="Farm type" options={["crop", "livestock", "mixed"]} /><TextInput {...props} field="region" label="Region" /></fieldset>;
const CropStep = (props: WizardStepComponentProps) => <fieldset><legend>Crop details</legend><SelectInput {...props} field="cropType" label="Crop type" options={["grain", "fruit", "vegetable"]} /><NumberInput {...props} field="acreage" label="Acreage" /></fieldset>;
const LivestockStep = (props: WizardStepComponentProps) => <fieldset><legend>Livestock details</legend><NumberInput {...props} field="herdSize" label="Herd size" /></fieldset>;
const LandDocsStep = (props: WizardStepComponentProps) => <fieldset><legend>Land documents</legend><FileInput {...props} field="deeds" label="Deeds, maps, or permits" /></fieldset>;
const InsuranceStep = (props: WizardStepComponentProps) => <fieldset><legend>Insurance</legend><SelectInput {...props} field="coverage" label="Coverage" options={["basic", "flood", "drought"]} /></fieldset>;
const ReviewStep = (props: WizardStepComponentProps) => <fieldset><legend>Review and submit</legend><label><input type="checkbox" checked={Boolean(props.data.confirmed)} onChange={(event) => props.onUpdate("confirmed", event.target.checked)} />I confirm this farm setup is accurate.</label>{props.errors.map((error) => <p key={error.field}>{error.message}</p>)}</fieldset>;

export const farmSetupSteps: WizardStepConfig[] = [
  { id: "identity", title: "Farm identity", component: FarmIdentityStep, defaults: { farmType: "crop" }, validate: (data) => validateFields("identity", data, { farmName: [required()], farmType: [required()], region: [required()] }) },
  { id: "crop", title: "Crop details", component: CropStep, dependsOn: (data) => data.identity?.farmType !== "livestock", defaults: { cropType: "grain", acreage: 0 }, validate: (data) => validateFields("crop", data, { cropType: [required()], acreage: [positiveNumber()] }) },
  { id: "livestock", title: "Livestock details", component: LivestockStep, dependsOn: (data) => data.identity?.farmType === "livestock" || data.identity?.farmType === "mixed", defaults: { herdSize: 0 }, validate: (data) => validateFields("livestock", data, { herdSize: [positiveNumber()] }) },
  { id: "documents", title: "Land documents", component: LandDocsStep, validate: () => [] },
  { id: "insurance", title: "Insurance", component: InsuranceStep, dependsOn: (data) => data.identity?.region !== "low-risk", defaults: { coverage: "basic" }, validate: (data) => validateFields("insurance", data, { coverage: [required()] }) },
  { id: "review", title: "Review", component: ReviewStep, validate: (data) => data.confirmed ? [] : [{ stepId: "review", field: "confirmed", message: "Confirm the farm setup before submitting." }] },
];

export function FarmSetupWizard({ draftId = "farm-setup", onSubmit }: { draftId?: string; onSubmit?: (payload: import("@/src/components/wizard/types").WizardFormData) => Promise<Response | void> | Response | void }) {
  return <WizardContainer draftId={draftId} steps={farmSetupSteps} onSubmit={onSubmit ?? ((payload) => fetch("/api/farms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }))} />;
}
