/**
 * src/services/formStateMachine.ts
 *
 * Debounced form state machine for multi-step registration wizards
 * (issue #169). Generic over the form data shape `T` so it can back the
 * existing Farm registration wizard or any future flow (e.g. product
 * registration) without duplicating this logic per domain.
 *
 * Responsibilities:
 *   1. A `useReducer`-based state machine over the 7 states from the issue
 *      (`IDLE, FILLING, VALIDATING, SUBMITTING, SUCCESS, ERROR,
 *      DRAFT_RECOVERED`) driven by a discriminated-union action type.
 *   2. Debounced (2000ms after the last keystroke) auto-save of in-progress
 *      form data to IndexedDB via `src/services/cache.ts`.
 *   3. On mount, checks for an existing draft and — if found — transitions
 *      to `DRAFT_RECOVERED` so the UI can prompt the user to resume/discard.
 *   4. A field dependency graph: fields declare `dependsOn`, and changing a
 *      field recomputes all transitive dependents in topological order
 *      (supports up to 50 fields per the issue's bound; cycles are detected
 *      and rejected rather than looping forever).
 */
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { FieldDependency, FieldError, FormDraft, FormMachineStatus } from '@/src/types/registration';
import { clearDraft, loadDraft, saveDraft } from '@/src/services/cache';

export const AUTO_SAVE_DEBOUNCE_MS = 2000;

// ─── State & actions ────────────────────────────────────────────────────────

export interface FormMachineState<T> {
  status: FormMachineStatus;
  data: T;
  errors: FieldError[];
  currentStepId: string | null;
  /** Present only while `status === 'DRAFT_RECOVERED'`. */
  recoveredDraft: FormDraft<T> | null;
  submitError: string | null;
}

export type FormMachineAction<T> =
  | { type: 'DRAFT_FOUND'; draft: FormDraft<T> }
  | { type: 'DRAFT_NOT_FOUND' }
  | { type: 'DRAFT_ACCEPTED' }
  | { type: 'DRAFT_DISCARDED' }
  | { type: 'FIELD_CHANGE'; field: keyof T & string; value: T[keyof T & string] }
  | { type: 'STEP_CHANGE'; stepId: string }
  | { type: 'VALIDATE_START' }
  | { type: 'VALIDATE_SUCCESS' }
  | { type: 'VALIDATE_ERROR'; errors: FieldError[] }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS' }
  | { type: 'SUBMIT_ERROR'; error: string }
  | { type: 'RETRY' }
  | { type: 'RESET'; data: T };

export function createInitialState<T>(data: T, currentStepId: string | null = null): FormMachineState<T> {
  return {
    status: 'IDLE',
    data,
    errors: [],
    currentStepId,
    recoveredDraft: null,
    submitError: null,
  };
}

/**
 * Valid state → action-type transitions. Anything not listed here is a
 * no-op in the reducer (the action is ignored and the previous state is
 * returned unchanged) rather than throwing, so a stray/late async message
 * (e.g. a VALIDATE_SUCCESS that arrives after the user already navigated
 * away) can't corrupt the machine.
 */
const ALLOWED_TRANSITIONS: Record<FormMachineStatus, FormMachineAction<unknown>['type'][]> = {
  IDLE: ['DRAFT_FOUND', 'DRAFT_NOT_FOUND', 'FIELD_CHANGE', 'RESET'],
  FILLING: ['FIELD_CHANGE', 'STEP_CHANGE', 'VALIDATE_START', 'SUBMIT_START', 'RESET'],
  VALIDATING: ['VALIDATE_SUCCESS', 'VALIDATE_ERROR', 'RESET'],
  SUBMITTING: ['SUBMIT_SUCCESS', 'SUBMIT_ERROR', 'RESET'],
  SUCCESS: ['RESET'],
  ERROR: ['RETRY', 'RESET'],
  DRAFT_RECOVERED: ['DRAFT_ACCEPTED', 'DRAFT_DISCARDED', 'RESET'],
};

function isAllowed(status: FormMachineStatus, actionType: FormMachineAction<unknown>['type']): boolean {
  return ALLOWED_TRANSITIONS[status].includes(actionType);
}

export function formStateMachineReducer<T>(
  state: FormMachineState<T>,
  action: FormMachineAction<T>,
  dependencies: FieldDependency<T>[] = []
): FormMachineState<T> {
  if (!isAllowed(state.status, action.type)) return state;

  switch (action.type) {
    case 'DRAFT_FOUND':
      return { ...state, status: 'DRAFT_RECOVERED', recoveredDraft: action.draft };

    case 'DRAFT_NOT_FOUND':
      return { ...state, status: 'FILLING' };

    case 'DRAFT_ACCEPTED':
      if (!state.recoveredDraft) return state;
      return {
        ...state,
        status: 'FILLING',
        data: state.recoveredDraft.data,
        errors: state.recoveredDraft.errors,
        currentStepId: state.recoveredDraft.currentStepId,
        recoveredDraft: null,
      };

    case 'DRAFT_DISCARDED':
      return { ...state, status: 'FILLING', recoveredDraft: null };

    case 'FIELD_CHANGE': {
      const nextData = recomputeDependents({ ...state.data, [action.field]: action.value }, dependencies);
      return {
        ...state,
        status: state.status === 'IDLE' ? 'FILLING' : state.status,
        data: nextData,
        // Clear only the error for the field being edited; other steps'
        // errors are preserved until re-validated.
        errors: state.errors.filter((e) => e.field !== action.field),
      };
    }

    case 'STEP_CHANGE':
      return { ...state, currentStepId: action.stepId };

    case 'VALIDATE_START':
      return { ...state, status: 'VALIDATING' };

    case 'VALIDATE_SUCCESS':
      return { ...state, status: 'FILLING', errors: [] };

    case 'VALIDATE_ERROR':
      return { ...state, status: 'FILLING', errors: action.errors };

    case 'SUBMIT_START':
      return { ...state, status: 'SUBMITTING', submitError: null };

    case 'SUBMIT_SUCCESS':
      return { ...state, status: 'SUCCESS', submitError: null };

    case 'SUBMIT_ERROR':
      return { ...state, status: 'ERROR', submitError: action.error };

    case 'RETRY':
      return { ...state, status: 'FILLING', submitError: null };

    case 'RESET':
      return createInitialState(action.data, state.currentStepId);

    default:
      return state;
  }
}

// ─── Field dependency graph ─────────────────────────────────────────────────

/**
 * Recomputes every field transitively dependent on the fields that just
 * changed, in topological order (Kahn's algorithm), so a chain like
 * A → B → C recomputes B before C. Detects cycles defensively — since a
 * cyclic dependency graph would recompute forever, cyclic edges are simply
 * skipped (the fields involved keep whatever value they last had) rather
 * than hanging the UI.
 */
export function recomputeDependents<T>(data: T, dependencies: FieldDependency<T>[]): T {
  if (dependencies.length === 0) return data;

  const byField = new Map<string, FieldDependency<T>>(dependencies.map((d) => [d.field, d]));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const dep of dependencies) {
    inDegree.set(dep.field, inDegree.get(dep.field) ?? 0);
    for (const parent of dep.dependsOn) {
      inDegree.set(dep.field, (inDegree.get(dep.field) ?? 0) + 1);
      const list = dependents.get(parent) ?? [];
      list.push(dep.field);
      dependents.set(parent, list);
    }
  }

  const queue: string[] = [];
  for (const dep of dependencies) {
    // A dependency whose parents aren't themselves computed fields has
    // in-degree contributed only by parents that ARE computed fields.
    const computedParentCount = dep.dependsOn.filter((p) => byField.has(p)).length;
    if (computedParentCount === 0) queue.push(dep.field);
  }

  const remainingInDegree = new Map<string, number>();
  for (const dep of dependencies) {
    remainingInDegree.set(
      dep.field,
      dep.dependsOn.filter((p) => byField.has(p)).length
    );
  }

  let result = data;
  const visited = new Set<string>();
  const order: string[] = [];

  while (queue.length > 0) {
    const field = queue.shift()!;
    if (visited.has(field)) continue;
    visited.add(field);
    order.push(field);

    for (const child of dependents.get(field) ?? []) {
      const remaining = (remainingInDegree.get(child) ?? 0) - 1;
      remainingInDegree.set(child, remaining);
      if (remaining <= 0) queue.push(child);
    }
  }

  // Cyclic fields (never reached in-degree 0) are left untouched.
  for (const field of order) {
    const dep = byField.get(field)!;
    result = { ...result, [field]: dep.compute(result) };
  }

  return result;
}

// ─── React hook ──────────────────────────────────────────────────────────────

export interface UseFormStateMachineOptions<T> {
  formId: string;
  initialData: T;
  dependencies?: FieldDependency<T>[];
  /** Set to false to skip the mount-time draft lookup (e.g. in tests). */
  checkForDraft?: boolean;
}

export interface UseFormStateMachineResult<T> {
  state: FormMachineState<T>;
  dispatch: (action: FormMachineAction<T>) => void;
  setField: <K extends keyof T & string>(field: K, value: T[K]) => void;
  acceptDraft: () => void;
  discardDraft: () => void;
  discardPersistedDraft: () => Promise<void>;
}

export function useFormStateMachine<T>({
  formId,
  initialData,
  dependencies = [],
  checkForDraft = true,
}: UseFormStateMachineOptions<T>): UseFormStateMachineResult<T> {
  const [state, dispatchRaw] = useReducer(
    (s: FormMachineState<T>, a: FormMachineAction<T>) => formStateMachineReducer(s, a, dependencies),
    initialData,
    (data) => createInitialState(data)
  );

  const dispatch = useCallback((action: FormMachineAction<T>) => dispatchRaw(action), []);

  // ── Mount-time draft recovery check ────────────────────────────────────
  useEffect(() => {
    if (!checkForDraft) return;
    let cancelled = false;

    loadDraft<T>(formId).then((draft) => {
      if (cancelled) return;
      if (draft) {
        dispatch({ type: 'DRAFT_FOUND', draft });
      } else {
        dispatch({ type: 'DRAFT_NOT_FOUND' });
      }
    });

    return () => {
      cancelled = true;
    };
    // Intentionally only re-runs if the form identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId, checkForDraft]);

  // ── Debounced auto-save while FILLING ──────────────────────────────────
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state.status !== 'FILLING') return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveDraft(formId, state.currentStepId ?? '', state.data, state.errors);
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [formId, state.status, state.data, state.errors, state.currentStepId]);

  // Clear the persisted draft once the form has been submitted successfully.
  useEffect(() => {
    if (state.status === 'SUCCESS') {
      clearDraft(formId);
    }
  }, [formId, state.status]);

  const setField = useCallback(
    <K extends keyof T & string>(field: K, value: T[K]) => {
      dispatch({ type: 'FIELD_CHANGE', field, value: value as T[keyof T & string] });
    },
    [dispatch]
  );

  const acceptDraft = useCallback(() => dispatch({ type: 'DRAFT_ACCEPTED' }), [dispatch]);
  const discardDraft = useCallback(() => dispatch({ type: 'DRAFT_DISCARDED' }), [dispatch]);
  const discardPersistedDraft = useCallback(async () => {
    await clearDraft(formId);
    dispatch({ type: 'DRAFT_DISCARDED' });
  }, [dispatch, formId]);

  return { state, dispatch, setField, acceptDraft, discardDraft, discardPersistedDraft };
}
