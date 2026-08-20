"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { draftManager, type FarmDraftFields } from "@/src/components/wizard/DraftManager";
import { FARM_STEPS } from "@/src/components/wizard/FarmStepConfig";
import { EMPTY_FARM_FORM, type FarmField, type FarmFormData, type FarmStepConfig, type FarmStepStatus, type FarmFieldError, type FarmAttachment } from "@/src/types/farmWizard";
import { validateFarmField } from "@/src/utils/farmValidation";

export const WIZARD_AUTOSAVE_INTERVAL_MS = 30_000;

interface UseWizardOptions {
  draftId: string;
  initialData?: FarmFormData;
  steps?: FarmStepConfig[];
  post?: (data: FarmFormData) => Promise<Response>;
}

export function useWizard({ draftId, initialData, steps = FARM_STEPS, post }: UseWizardOptions) {
  const [data, setData] = useState<FarmFormData>(initialData ?? { ...EMPTY_FARM_FORM });
  const [files, setFiles] = useState<File[]>([]);
  const [currentStepId, setCurrentStepId] = useState(steps[0]?.id ?? "");
  const [errors, setErrors] = useState<FarmFieldError[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [stepErrors, setStepErrors] = useState<Set<string>>(new Set());
  const [resumeDraft, setResumeDraft] = useState<{ fields: FarmDraftFields; currentStep: string; files: File[] }>();
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const visibleSteps = useMemo(() => steps.filter((step) => step.dependsOn?.(data) ?? true), [data, steps]);
  const currentStep = visibleSteps.find((step) => step.id === currentStepId) ?? visibleSteps[0];
  const currentIndex = Math.max(0, visibleSteps.findIndex((step) => step.id === currentStep?.id));

  useEffect(() => {
    let active = true;
    void draftManager.load(draftId).then((saved) => {
      if (active && saved) setResumeDraft({ fields: saved.draft.fields, currentStep: saved.draft.currentStep, files: saved.files });
      if (active) setLoaded(true);
    });
    return () => { active = false; };
  }, [draftId]);

  useEffect(() => {
    setData((previous) => {
      let next = previous;
      for (const step of steps) {
        if (!(step.dependsOn?.(previous) ?? true) && step.defaults) {
          const defaults = typeof step.defaults === "function" ? step.defaults(previous) : step.defaults;
          next = { ...next, ...Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, previous[key as FarmField] || value])) };
        }
      }
      return next;
    });
  }, [data.cropType, data.region, steps]);

  const saveCurrentStep = useCallback(async (step: FarmStepConfig | undefined, values: FarmFormData, currentStep: string) => {
    if (!step) return;
    const fields = Object.fromEntries((step.fields ?? []).map((field) => [field, values[field]])) as FarmDraftFields;
    await draftManager.saveStep(draftId, step.id, fields, files, currentStep);
  }, [draftId, files]);

  useEffect(() => {
    if (!loaded || !currentStep) return;
    const timer = window.setInterval(() => void saveCurrentStep(currentStep, data, currentStep.id), WIZARD_AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [currentStep, data, loaded, saveCurrentStep]);

  const update = useCallback(<TField extends FarmField>(field: TField, value: FarmFormData[TField]) => {
    setData((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => previous.filter((error) => error.field !== field));
  }, []);

  const blur = useCallback((field: FarmField) => {
    setErrors((previous) => [...previous.filter((error) => error.field !== field), ...validateFarmField(field, data)]);
  }, [data]);

  const validateStep = useCallback((step: FarmStepConfig | undefined) => {
    const nextErrors = step?.validate({ data, attachments: files }) ?? [];
    setErrors((previous) => [...previous.filter((error) => !step?.fields?.includes(error.field as FarmField)), ...nextErrors]);
    if (step) setStepErrors((previous) => { const next = new Set(previous); nextErrors.length ? next.add(step.id) : next.delete(step.id); return next; });
    return nextErrors.length === 0;
  }, [data, files]);

  const next = useCallback(async () => {
    if (!currentStep || !validateStep(currentStep)) return false;
    await saveCurrentStep(currentStep, data, visibleSteps[currentIndex + 1]?.id ?? currentStep.id);
    setCompleted((previous) => new Set(previous).add(currentStep.id));
    const following = visibleSteps[currentIndex + 1];
    if (following) setCurrentStepId(following.id);
    return true;
  }, [currentIndex, currentStep, data, saveCurrentStep, validateStep, visibleSteps]);

  const previous = useCallback(() => {
    const prior = visibleSteps[currentIndex - 1];
    if (prior) setCurrentStepId(prior.id);
  }, [currentIndex, visibleSteps]);

  const chooseResume = useCallback(() => {
    if (!resumeDraft) return;
    setData((previousData) => ({ ...previousData, ...resumeDraft.fields, attachments: resumeDraft.files.map((file) => ({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, lastModified: file.lastModified })) }));
    setFiles(resumeDraft.files);
    setCurrentStepId(resumeDraft.currentStep);
    setResumeDraft(undefined);
  }, [resumeDraft]);

  const discardResume = useCallback(async () => {
    await draftManager.clear(draftId);
    setResumeDraft(undefined);
  }, [draftId]);

  const submit = useCallback(async () => {
    for (const step of visibleSteps) if (!validateStep(step)) return false;
    setSubmitting(true);
    try {
      const response = await (post ?? ((payload) => fetch("/api/farms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })))(data);
      if (response.status !== 201) throw new Error("Farm registration failed");
      await draftManager.clear(draftId);
      setSubmitted(true);
      return true;
    } finally {
      setSubmitting(false);
    }
  }, [data, draftId, post, validateStep, visibleSteps]);

  const onFiles = useCallback((nextFiles: File[]) => {
    setFiles((previous) => [...previous, ...nextFiles]);
    setData((previous) => ({ ...previous, attachments: [...previous.attachments, ...nextFiles.map((file): FarmAttachment => ({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, lastModified: file.lastModified }))] }));
  }, []);

  const statuses = useMemo(() => new Map(steps.map((step) => [step.id, !(step.dependsOn?.(data) ?? true) ? "skipped" : stepErrors.has(step.id) ? "error" : completed.has(step.id) ? "complete" : "incomplete"] as [string, FarmStepStatus])), [completed, data, stepErrors, steps]);

  return { data, files, steps, visibleSteps, currentStep, currentIndex, currentStepId, errors, statuses, resumeDraft, isLoading: !loaded, isSubmitting: submitting, submitted, update, blur, onFiles, next, previous, submit, chooseResume, discardResume, setCurrentStepId };
}
