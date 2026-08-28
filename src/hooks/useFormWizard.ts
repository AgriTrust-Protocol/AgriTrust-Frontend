/**
 * src/hooks/useFormWizard.ts
 *
 * Step navigation on top of `useFormStateMachine` (issue #169): validates
 * the current step's fields (offloaded to `formValidator.worker.ts`) before
 * advancing, and only allows the final SUBMITTING transition once every
 * step has been visited without outstanding errors.
 *
 * Falls back to synchronous main-thread validation (`runValidation`,
 * imported directly) when `Worker` isn't available — SSR, and the jsdom
 * test environment, both lack a usable Worker constructor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FieldError, FormStep } from '@/src/types/registration';
import { useFormStateMachine, type UseFormStateMachineOptions } from '@/src/services/formStateMachine';
import { runValidation, type ResultMessage, type ValidateMessage } from '@/src/services/formValidator.worker';

export interface UseFormWizardOptions<T> extends Omit<UseFormStateMachineOptions<T>, 'formId'> {
  formId: string;
  steps: FormStep<T>[];
  onSubmit: (data: T) => Promise<void>;
}

export function useFormWizard<T>({ formId, steps, onSubmit, ...machineOptions }: UseFormWizardOptions<T>) {
  const machine = useFormStateMachine<T>({ formId, ...machineOptions });
  const { state, dispatch } = machine;

  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = steps[stepIndex];

  // Keep currentStepId in the machine (and thus in persisted drafts) in
  // sync with local step navigation.
  useEffect(() => {
    if (currentStep && state.currentStepId !== currentStep.id) {
      dispatch({ type: 'STEP_CHANGE', stepId: currentStep.id });
    }
  }, [currentStep, state.currentStepId, dispatch]);

  // If a draft is accepted with a currentStepId that doesn't match
  // `stepIndex`, resume at the draft's step instead of step 0.
  useEffect(() => {
    if (state.status !== 'FILLING' || !state.currentStepId) return;
    const idx = steps.findIndex((s) => s.id === state.currentStepId);
    if (idx >= 0 && idx !== stepIndex) setStepIndex(idx);
    // Only when currentStepId changes out from under us (draft resume),
    // not on every local step change (we drive stepIndex ourselves below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentStepId, state.status]);

  const workerRef = useRef<Worker | null>(null);
  useEffect(() => {
    if (typeof Worker === 'undefined') return;
    const worker = new Worker(new URL('../services/formValidator.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const validateStep = useCallback(
    (step: FormStep<T>): Promise<FieldError[]> => {
      if (!workerRef.current) {
        // Main-thread fallback (SSR / no Worker support in this environment).
        return Promise.resolve(runValidation(state.data as Record<string, unknown>, step.rules));
      }

      const worker = workerRef.current;
      const requestId = `${step.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const message: ValidateMessage = {
        type: 'VALIDATE',
        requestId,
        data: state.data as Record<string, unknown>,
        rules: step.rules,
      };

      return new Promise((resolve) => {
        const handler = (event: MessageEvent<ResultMessage>) => {
          if (event.data.requestId !== requestId) return;
          worker.removeEventListener('message', handler);
          resolve(event.data.errors);
        };
        worker.addEventListener('message', handler);
        worker.postMessage(message);
      });
    },
    [state.data]
  );

  const goNext = useCallback(async () => {
    if (!currentStep) return;
    dispatch({ type: 'VALIDATE_START' });
    const errors = await validateStep(currentStep);

    if (errors.length > 0) {
      dispatch({ type: 'VALIDATE_ERROR', errors });
      return;
    }
    dispatch({ type: 'VALIDATE_SUCCESS' });

    const isLastStep = stepIndex === steps.length - 1;
    if (isLastStep) {
      dispatch({ type: 'SUBMIT_START' });
      try {
        await onSubmit(state.data);
        dispatch({ type: 'SUBMIT_SUCCESS' });
      } catch (err) {
        dispatch({ type: 'SUBMIT_ERROR', error: err instanceof Error ? err.message : 'Submission failed' });
      }
      return;
    }

    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }, [currentStep, dispatch, onSubmit, state.data, stepIndex, steps.length, validateStep]);

  const goBack = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  const retry = useCallback(() => {
    dispatch({ type: 'RETRY' });
  }, [dispatch]);

  const progress = useMemo(
    () => ({ current: stepIndex + 1, total: steps.length, isLastStep: stepIndex === steps.length - 1 }),
    [stepIndex, steps.length]
  );

  return {
    ...machine,
    state,
    currentStep,
    stepIndex,
    progress,
    goNext,
    goBack,
    retry,
  };
}
