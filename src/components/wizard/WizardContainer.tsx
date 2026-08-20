"use client";

import { useEffect } from "react";
import { useWizard } from "@/src/hooks/useWizard";
import { StepOverview } from "@/src/components/wizard/StepOverview";
import { StepRenderer } from "@/src/components/wizard/StepRenderer";
import type { FarmFormData } from "@/src/types/farmWizard";

export function WizardContainer({ draftId, initialData, onSubmit }: { draftId: string; initialData?: FarmFormData; onSubmit?: (data: FarmFormData) => Promise<Response> }) {
  const wizard = useWizard({ draftId, initialData, post: onSubmit });
  const { currentStep } = wizard;

  useEffect(() => {
    if (!currentStep) return;
    void import("@/src/components/wizard/DraftManager").then(({ draftManager }) => draftManager.saveStep(draftId, currentStep.id, Object.fromEntries((currentStep.fields ?? []).map((field) => [field, wizard.data[field]])), wizard.files, currentStep.id));
  }, [currentStep, draftId, wizard.data, wizard.files]);

  if (wizard.isLoading || !currentStep) return <p role="status">Loading farm registration...</p>;

  return (
    <section>
      {wizard.resumeDraft ? <section role="dialog" aria-label="Resume farm registration"><p>Resume where you left off?</p><button type="button" onClick={wizard.chooseResume}>Resume</button><button type="button" onClick={() => void wizard.discardResume()}>Start over</button></section> : null}
      <div>
        <StepOverview steps={wizard.steps} statuses={wizard.statuses} currentStepId={wizard.currentStepId} onSelect={wizard.setCurrentStepId} />
        <main>
          <StepRenderer step={currentStep} props={{ data: wizard.data, errors: wizard.errors, attachments: wizard.files, onUpdate: wizard.update, onBlur: wizard.blur, onFiles: wizard.onFiles }} />
          {wizard.errors.map((error) => <p key={`${error.field}-${error.message}`} role="alert">{error.message}</p>)}
          <nav>
            <button type="button" disabled={wizard.currentIndex === 0 || wizard.isSubmitting} onClick={wizard.previous}>Back</button>
            {wizard.currentIndex < wizard.visibleSteps.length - 1 ? <button type="button" onClick={() => void wizard.next()}>{currentStep.nextLabel ?? "Next"}</button> : <button type="button" disabled={wizard.isSubmitting} onClick={() => void wizard.submit()}>{wizard.isSubmitting ? "Submitting..." : "Submit"}</button>}
          </nav>
          {wizard.submitted ? <p role="status">Farm registered.</p> : null}
        </main>
      </div>
    </section>
  );
}
