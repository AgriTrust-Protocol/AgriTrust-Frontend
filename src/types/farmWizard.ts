import type { ComponentType } from "react";

export type FarmType = "smallholder" | "commercial" | "cooperative";
export type FarmStepStatus = "incomplete" | "complete" | "error" | "skipped";

export interface FarmAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
}

export interface FarmFormData {
  farmName: string;
  farmType: FarmType | "";
  region: string;
  address: string;
  cropType: string;
  fieldType: string;
  fieldCount: number;
  insuranceRequired: boolean;
  insuranceProvider: string;
  attachments: FarmAttachment[];
  notes: string;
}

export type FarmField = keyof FarmFormData;

export interface FarmFieldError {
  field: string;
  message: string;
}

export interface FarmStepContext {
  data: FarmFormData;
  attachments: File[];
}

export interface FarmStepConfig {
  id: string;
  label: string;
  component: ComponentType<FarmStepComponentProps>;
  dependsOn?: (data: FarmFormData) => boolean;
  defaults?: Partial<FarmFormData> | ((data: FarmFormData) => Partial<FarmFormData>);
  validate: (context: FarmStepContext) => FarmFieldError[];
  nextLabel?: string;
  fields?: FarmField[];
}

export interface FarmStepComponentProps {
  data: FarmFormData;
  errors: FarmFieldError[];
  attachments: File[];
  onUpdate: <TField extends FarmField>(field: TField, value: FarmFormData[TField]) => void;
  onBlur: (field: FarmField) => void;
  onFiles: (files: File[]) => void;
}

export const EMPTY_FARM_FORM: FarmFormData = {
  farmName: "",
  farmType: "",
  region: "",
  address: "",
  cropType: "",
  fieldType: "",
  fieldCount: 0,
  insuranceRequired: false,
  insuranceProvider: "",
  attachments: [],
  notes: "",
};
