"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clearWizardDraft, loadWizardDraft, saveWizardStepDraft } from "@/src/components/wizard/DraftManager";
import type { WizardFormData, WizardStepConfig, WizardStepData, WizardStepStatus, WizardValidationError } from "@/src/components/wizard/types";
import { validateWizardStep } from "@/src/utils/validation";

const AUTOSAVE_MS = 30_000;

interface UseWizardOptions {
  draftId: string;
  steps: WizardStepConfig[];
  initialData?: WizardFormData;
  onSubmit?: (payload: WizardFormData) => Promise<Response | void> | Response | void;
}

function applySkippedDefaults(steps: WizardStepConfig[], data: WizardFormData): WizardFormData {
  return steps.reduce((next, step) => {
    if (step.dependsOn?.(next) === false) next[step.id] = { ...(step.defaults ?? {}) };
    return next;
  }, { ...data });
}

export function useWizard({ draftId, steps, initialData = {}, onSubmit }: UseWizardOptions) {
  const [formData, setFormData] = useState<WizardFormData>(initialData);
  const [currentStepId, setCurrentStepId] = useState(steps[0]?.id ?? "");
  const [errors, setErrors] = useState<WizardValidationError[]>([]);
  const [resumeDraft, setResumeDraft] = useState<WizardFormData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const visibleSteps = useMemo(() => steps.filter((step) => step.dependsOn?.(formData) !== false), [formData, steps]);
  const currentStep = visibleSteps.find((step) => step.id === currentStepId) ?? visibleSteps[0];
  const currentIndex = visibleSteps.findIndex((step) => step.id === currentStep?.id);

  const saveCurrentStep = useCallback(async () => {
    if (!currentStep) return;
    await saveWizardStepDraft({ draftId, stepId: currentStep.id, stepData: formData[currentStep.id] ?? {}, currentStepId: currentStep.id });
  }, [currentStep, draftId, formData]);

  useEffect(() => {
    let active = true;
    void loadWizardDraft(draftId).then((draft) => {
      if (!active || !draft) return;
      setResumeDraft(draft.formData);
      setCurrentStepId(draft.currentStepId);
    });
    return () => { active = false; };
  }, [draftId]);

  useEffect(() => {
    const timer = window.setInterval(() => { void saveCurrentStep(); }, AUTOSAVE_MS);
    return () => window.clearInterval(timer);
  }, [saveCurrentStep]);

  const updateField = useCallback((field: string, value: WizardStepData[string]) => {
    if (!currentStep) return;
    setFormData((previous) => ({ ...previous, [currentStep.id]: { ...(previous[currentStep.id] ?? {}), [field]: value } }));
    setErrors((previous) => previous.filter((error) => !(error.stepId === currentStep.id && error.field === field)));
  }, [currentStep]);

  const validateField = useCallback((field: string): boolean => {
    if (!currentStep) return true;
    const stepErrors = validateWizardStep(currentStep, formData[currentStep.id] ?? {}, formData).filter((error) => error.field === field);
    setErrors((previous) => [...previous.filter((error) => !(error.stepId === currentStep.id && error.field === field)), ...stepErrors]);
    return stepErrors.length === 0;
  }, [currentStep, formData]);

  const validateStep = useCallback((step = currentStep): boolean => {
    if (!step) return true;
    const stepErrors = validateWizardStep(step, formData[step.id] ?? {}, formData);
    setErrors((previous) => [...previous.filter((error) => error.stepId !== step.id), ...stepErrors]);
    return stepErrors.length === 0;
  }, [currentStep, formData]);

  const goToStep = useCallback(async (stepId: string) => {
    await saveCurrentStep();
    setCurrentStepId(stepId);
  }, [saveCurrentStep]);

  const next = useCallback(async () => {
    if (!currentStep || !validateStep(currentStep)) return false;
    await saveCurrentStep();
    const nextData = applySkippedDefaults(steps, formData);
    setFormData(nextData);
    const nextStep = visibleSteps[currentIndex + 1];
    if (nextStep) setCurrentStepId(nextStep.id);
    return true;
  }, [currentIndex, currentStep, formData, saveCurrentStep, steps, validateStep, visibleSteps]);

  const previous = useCallback(async () => {
    await saveCurrentStep();
    const previousStep = visibleSteps[currentIndex - 1];
    if (previousStep) setCurrentStepId(previousStep.id);
  }, [currentIndex, saveCurrentStep, visibleSteps]);

  const stepStatuses = useMemo<Record<string, WizardStepStatus>>(() => Object.fromEntries(steps.map((step) => {
    if (step.dependsOn?.(formData) === false) return [step.id, "skipped"];
    if (errors.some((error) => error.stepId === step.id)) return [step.id, "error"];
    return [step.id, validateWizardStep(step, formData[step.id] ?? {}, formData).length === 0 ? "complete" : "incomplete"];
  })), [errors, formData, steps]);

  const acceptDraft = useCallback(() => { if (resumeDraft) setFormData(resumeDraft); setResumeDraft(null); }, [resumeDraft]);
  const discardDraft = useCallback(async () => { await clearWizardDraft(draftId); setResumeDraft(null); }, [draftId]);
  const submit = useCallback(async () => {
    const payload = applySkippedDefaults(steps, formData);
    const allErrors = steps.flatMap((step) => step.dependsOn?.(payload) === false ? [] : validateWizardStep(step, payload[step.id] ?? {}, payload));
    setErrors(allErrors);
    if (allErrors.length) return false;
    setIsSubmitting(true);
    try { const response = await onSubmit?.(payload); if (response instanceof Response && response.status !== 201) return false; await clearWizardDraft(draftId); return true; }
    finally { setIsSubmitting(false); }
  }, [draftId, formData, onSubmit, steps]);

  return { steps, visibleSteps, currentStep, currentStepId: currentStep?.id ?? "", currentIndex, formData, errors, stepStatuses, canGoBack: currentIndex > 0, isLastStep: currentIndex === visibleSteps.length - 1, isSubmitting, resumeDraftAvailable: resumeDraft !== null, updateField, validateField, validateStep, goToStep, next, previous, acceptDraft, discardDraft, submit };
}
