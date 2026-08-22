"use client";

import type { FarmStepComponentProps } from "@/src/types/farmWizard";

function FieldError({ message }: { message?: string }) {
  return message ? <span role="alert">{message}</span> : null;
}

function errorFor(props: FarmStepComponentProps, field: string) {
  return props.errors.find((error) => error.field === field)?.message;
}

export function FarmIdentityStep(props: FarmStepComponentProps) {
  return (
    <fieldset>
      <legend>Farm identity</legend>
      <label>Farm name<input value={props.data.farmName} onChange={(event) => props.onUpdate("farmName", event.target.value)} onBlur={() => props.onBlur("farmName")} /> <FieldError message={errorFor(props, "farmName")} /></label>
      <label>Farm type<select value={props.data.farmType} onChange={(event) => props.onUpdate("farmType", event.target.value as typeof props.data.farmType)} onBlur={() => props.onBlur("farmType")}><option value="">Select type</option><option value="smallholder">Smallholder</option><option value="commercial">Commercial</option><option value="cooperative">Cooperative</option></select> <FieldError message={errorFor(props, "farmType")} /></label>
    </fieldset>
  );
}

export function FarmLocationStep(props: FarmStepComponentProps) {
  return (
    <fieldset>
      <legend>Location</legend>
      <label>Region<input value={props.data.region} onChange={(event) => props.onUpdate("region", event.target.value)} onBlur={() => props.onBlur("region")} /> <FieldError message={errorFor(props, "region")} /></label>
      <label>Address<textarea value={props.data.address} onChange={(event) => props.onUpdate("address", event.target.value)} onBlur={() => props.onBlur("address")} /> <FieldError message={errorFor(props, "address")} /></label>
    </fieldset>
  );
}

export function FarmCropStep(props: FarmStepComponentProps) {
  return (
    <fieldset>
      <legend>Crops</legend>
      <label>Primary crop<input value={props.data.cropType} onChange={(event) => props.onUpdate("cropType", event.target.value)} onBlur={() => props.onBlur("cropType")} /> <FieldError message={errorFor(props, "cropType")} /></label>
    </fieldset>
  );
}

export function FarmFieldStep(props: FarmStepComponentProps) {
  return (
    <fieldset>
      <legend>Fields</legend>
      <label>Field type<input value={props.data.fieldType} onChange={(event) => props.onUpdate("fieldType", event.target.value)} onBlur={() => props.onBlur("fieldType")} /> <FieldError message={errorFor(props, "fieldType")} /></label>
      <label>Number of fields<input type="number" min="1" value={props.data.fieldCount || ""} onChange={(event) => props.onUpdate("fieldCount", event.target.valueAsNumber)} onBlur={() => props.onBlur("fieldCount")} /> <FieldError message={errorFor(props, "fieldCount")} /></label>
    </fieldset>
  );
}

export function FarmInsuranceStep(props: FarmStepComponentProps) {
  return (
    <fieldset>
      <legend>Insurance</legend>
      <label><input type="checkbox" checked={props.data.insuranceRequired} onChange={(event) => props.onUpdate("insuranceRequired", event.target.checked)} /> Insurance is required</label>
      {props.data.insuranceRequired ? <label>Provider<input value={props.data.insuranceProvider} onChange={(event) => props.onUpdate("insuranceProvider", event.target.value)} onBlur={() => props.onBlur("insuranceProvider")} /> <FieldError message={errorFor(props, "insuranceProvider")} /></label> : null}
    </fieldset>
  );
}

export function FarmDocumentsStep(props: FarmStepComponentProps) {
  return (
    <fieldset>
      <legend>Documents</legend>
      <label>Maps, deeds, or permits<input type="file" multiple onChange={(event) => props.onFiles(Array.from(event.target.files ?? []))} /></label>
      {props.attachments.length ? <ul>{props.attachments.map((file) => <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>)}</ul> : null}
      <label>Notes<textarea value={props.data.notes} onChange={(event) => props.onUpdate("notes", event.target.value)} /></label>
    </fieldset>
  );
}

export function FarmReviewStep(props: FarmStepComponentProps) {
  return <section aria-labelledby="farm-review-heading"><h2 id="farm-review-heading">Review farm registration</h2><dl><dt>Name</dt><dd>{props.data.farmName}</dd><dt>Type</dt><dd>{props.data.farmType}</dd><dt>Region</dt><dd>{props.data.region}</dd><dt>Crop</dt><dd>{props.data.cropType}</dd></dl></section>;
}
