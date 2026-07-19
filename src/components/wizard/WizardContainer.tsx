"use client";

import { useWizard } from "@/src/hooks/useWizard";
import { StepOverview } from "@/src/components/wizard/StepOverview";
import { StepRenderer } from "@/src/components/wizard/StepRenderer";
import type { WizardFormData, WizardStepConfig } from "@/src/components/wizard/types";

interface WizardContainerProps {
  draftId: string;
  steps: WizardStepConfig[];
  initialData?: WizardFormData;
  onSubmit?: (payload: WizardFormData) => Promise<Response | void> | Response | void;
}

export function WizardContainer({ draftId, steps, initialData, onSubmit }: WizardContainerProps) {
  const wizard = useWizard({ draftId, steps, initialData, onSubmit });
  if (!wizard.currentStep) return null;

  return (
    <form onSubmit={(event) => { event.preventDefault(); void wizard.submit(); }}>
      {wizard.resumeDraftAvailable ? (
        <section role="dialog" aria-live="polite" aria-label="Resume draft">
          <p>Resume where you left off?</p>
          <button type="button" onClick={wizard.acceptDraft}>Resume</button>
          <button type="button" onClick={() => { void wizard.discardDraft(); }}>Start over</button>
        </section>
      ) : null}
      <StepOverview steps={steps} currentStepId={wizard.currentStepId} statuses={wizard.stepStatuses} onSelectStep={(stepId) => { void wizard.goToStep(stepId); }} />
      <StepRenderer step={wizard.currentStep} data={wizard.formData[wizard.currentStep.id] ?? {}} errors={wizard.errors} onUpdate={wizard.updateField} onBlur={wizard.validateField} />
      <nav aria-label="Wizard navigation">
        <button type="button" disabled={!wizard.canGoBack || wizard.isSubmitting} onClick={() => { void wizard.previous(); }}>Back</button>
        {wizard.isLastStep ? (
          <button type="submit" disabled={wizard.isSubmitting}>Submit</button>
        ) : (
          <button type="button" onClick={() => { void wizard.next(); }}>{wizard.currentStep.nextLabel ?? "Next"}</button>
        )}
      </nav>
    </form>
  );
}
