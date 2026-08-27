/**
 * tests/unit/formStateMachine.test.ts
 *
 * Covers every transition path of the debounced form state machine
 * (issue #169): IDLE → FILLING → VALIDATING → SUBMITTING → SUCCESS/ERROR,
 * plus the DRAFT_RECOVERED branch and the field dependency graph.
 */
import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  formStateMachineReducer,
  recomputeDependents,
  type FormMachineState,
} from '@/src/services/formStateMachine';
import type { FieldDependency, FormDraft } from '@/src/types/registration';

interface TestForm {
  name: string;
  quantity: number;
  unit: string;
  displayLabel: string;
}

const emptyForm: TestForm = { name: '', quantity: 0, unit: '', displayLabel: '' };

describe('formStateMachineReducer', () => {
  it('starts in IDLE with the provided initial data', () => {
    const state = createInitialState(emptyForm);
    expect(state.status).toBe('IDLE');
    expect(state.data).toEqual(emptyForm);
    expect(state.errors).toEqual([]);
  });

  it('IDLE -> FILLING on the first field change', () => {
    const state = createInitialState(emptyForm);
    const next = formStateMachineReducer(state, { type: 'FIELD_CHANGE', field: 'name', value: 'Maize' });
    expect(next.status).toBe('FILLING');
    expect(next.data.name).toBe('Maize');
  });

  it('IDLE -> DRAFT_RECOVERED when a draft is found', () => {
    const state = createInitialState(emptyForm);
    const draft: FormDraft<TestForm> = {
      id: 'form-draft-1',
      currentStepId: 'basic-info',
      data: { ...emptyForm, name: 'Recovered' },
      errors: [],
      updatedAt: Date.now(),
    };
    const next = formStateMachineReducer(state, { type: 'DRAFT_FOUND', draft });
    expect(next.status).toBe('DRAFT_RECOVERED');
    expect(next.recoveredDraft).toEqual(draft);
  });

  it('IDLE -> FILLING when no draft is found', () => {
    const state = createInitialState(emptyForm);
    const next = formStateMachineReducer(state, { type: 'DRAFT_NOT_FOUND' });
    expect(next.status).toBe('FILLING');
  });

  it('DRAFT_RECOVERED -> FILLING with restored data on DRAFT_ACCEPTED', () => {
    const draft: FormDraft<TestForm> = {
      id: 'form-draft-1',
      currentStepId: 'basic-info',
      data: { ...emptyForm, name: 'Recovered' },
      errors: [{ field: 'name', message: 'stale error' }],
      updatedAt: Date.now(),
    };
    const state: FormMachineState<TestForm> = {
      ...createInitialState(emptyForm),
      status: 'DRAFT_RECOVERED',
      recoveredDraft: draft,
    };
    const next = formStateMachineReducer(state, { type: 'DRAFT_ACCEPTED' });
    expect(next.status).toBe('FILLING');
    expect(next.data).toEqual(draft.data);
    expect(next.errors).toEqual(draft.errors);
    expect(next.currentStepId).toBe('basic-info');
    expect(next.recoveredDraft).toBeNull();
  });

  it('DRAFT_RECOVERED -> FILLING with fresh data on DRAFT_DISCARDED', () => {
    const draft: FormDraft<TestForm> = {
      id: 'form-draft-1',
      currentStepId: 'basic-info',
      data: { ...emptyForm, name: 'Recovered' },
      errors: [],
      updatedAt: Date.now(),
    };
    const state: FormMachineState<TestForm> = {
      ...createInitialState(emptyForm),
      status: 'DRAFT_RECOVERED',
      recoveredDraft: draft,
    };
    const next = formStateMachineReducer(state, { type: 'DRAFT_DISCARDED' });
    expect(next.status).toBe('FILLING');
    // The form's own data is untouched by discarding — only the recovered
    // draft reference is cleared.
    expect(next.data).toEqual(emptyForm);
    expect(next.recoveredDraft).toBeNull();
  });

  it('FILLING -> VALIDATING -> FILLING (errors cleared) on VALIDATE_SUCCESS', () => {
    let state: FormMachineState<TestForm> = { ...createInitialState(emptyForm), status: 'FILLING' };
    state = formStateMachineReducer(state, { type: 'VALIDATE_START' });
    expect(state.status).toBe('VALIDATING');

    state = formStateMachineReducer(state, { type: 'VALIDATE_SUCCESS' });
    expect(state.status).toBe('FILLING');
    expect(state.errors).toEqual([]);
  });

  it('FILLING -> VALIDATING -> FILLING (with errors) on VALIDATE_ERROR', () => {
    let state: FormMachineState<TestForm> = { ...createInitialState(emptyForm), status: 'FILLING' };
    state = formStateMachineReducer(state, { type: 'VALIDATE_START' });

    const errors = [{ field: 'name', message: 'Required' }];
    state = formStateMachineReducer(state, { type: 'VALIDATE_ERROR', errors });
    expect(state.status).toBe('FILLING');
    expect(state.errors).toEqual(errors);
  });

  it('FILLING -> SUBMITTING -> SUCCESS on successful submission', () => {
    let state: FormMachineState<TestForm> = { ...createInitialState(emptyForm), status: 'FILLING' };
    state = formStateMachineReducer(state, { type: 'SUBMIT_START' });
    expect(state.status).toBe('SUBMITTING');

    state = formStateMachineReducer(state, { type: 'SUBMIT_SUCCESS' });
    expect(state.status).toBe('SUCCESS');
    expect(state.submitError).toBeNull();
  });

  it('FILLING -> SUBMITTING -> ERROR on failed submission, then ERROR -> FILLING on RETRY', () => {
    let state: FormMachineState<TestForm> = { ...createInitialState(emptyForm), status: 'FILLING' };
    state = formStateMachineReducer(state, { type: 'SUBMIT_START' });
    state = formStateMachineReducer(state, { type: 'SUBMIT_ERROR', error: 'Network interrupted' });
    expect(state.status).toBe('ERROR');
    expect(state.submitError).toBe('Network interrupted');

    state = formStateMachineReducer(state, { type: 'RETRY' });
    expect(state.status).toBe('FILLING');
    expect(state.submitError).toBeNull();
    // Retrying after a network interruption must not lose the user's data.
    expect(state.data).toEqual(emptyForm);
  });

  it('any state -> IDLE on RESET, with fresh data', () => {
    let state: FormMachineState<TestForm> = { ...createInitialState(emptyForm), status: 'SUCCESS' };
    state = formStateMachineReducer(state, { type: 'RESET', data: emptyForm });
    expect(state.status).toBe('IDLE');
    expect(state.data).toEqual(emptyForm);
  });

  it('ignores actions that are not valid for the current state (no-op)', () => {
    const state = createInitialState(emptyForm); // IDLE
    // SUBMIT_SUCCESS is not valid from IDLE — nothing has been submitted.
    const next = formStateMachineReducer(state, { type: 'SUBMIT_SUCCESS' });
    expect(next).toBe(state); // same reference: reducer returned early
    expect(next.status).toBe('IDLE');
  });

  it('ignores VALIDATE_ERROR while SUBMITTING (stale worker response)', () => {
    let state: FormMachineState<TestForm> = { ...createInitialState(emptyForm), status: 'FILLING' };
    state = formStateMachineReducer(state, { type: 'SUBMIT_START' });
    const next = formStateMachineReducer(state, { type: 'VALIDATE_ERROR', errors: [{ field: 'name', message: 'x' }] });
    expect(next).toBe(state);
    expect(next.status).toBe('SUBMITTING');
  });

  it('FIELD_CHANGE clears only the error for the edited field', () => {
    let state: FormMachineState<TestForm> = {
      ...createInitialState(emptyForm),
      status: 'FILLING',
      errors: [
        { field: 'name', message: 'Required' },
        { field: 'quantity', message: 'Must be positive' },
      ],
    };
    state = formStateMachineReducer(state, { type: 'FIELD_CHANGE', field: 'name', value: 'Maize' });
    expect(state.errors).toEqual([{ field: 'quantity', message: 'Must be positive' }]);
  });
});

describe('recomputeDependents (field dependency graph)', () => {
  it('recomputes a single dependent field', () => {
    const deps: FieldDependency<TestForm>[] = [
      { field: 'displayLabel', dependsOn: ['name', 'unit'], compute: (d) => `${d.name} (${d.unit})` },
    ];
    const result = recomputeDependents({ ...emptyForm, name: 'Maize', unit: 'kg' }, deps);
    expect(result.displayLabel).toBe('Maize (kg)');
  });

  it('recomputes a chain of transitive dependents in order', () => {
    interface ChainForm {
      base: number;
      doubled: number;
      quadrupled: number;
    }
    const deps: FieldDependency<ChainForm>[] = [
      { field: 'quadrupled', dependsOn: ['doubled'], compute: (d) => d.doubled * 2 },
      { field: 'doubled', dependsOn: ['base'], compute: (d) => d.base * 2 },
    ];
    const result = recomputeDependents({ base: 5, doubled: 0, quadrupled: 0 }, deps);
    expect(result.doubled).toBe(10);
    expect(result.quadrupled).toBe(20);
  });

  it('is a no-op when there are no dependencies', () => {
    const data = { ...emptyForm, name: 'Maize' };
    expect(recomputeDependents(data, [])).toEqual(data);
  });

  it('does not hang on a cyclic dependency graph', () => {
    interface CyclicForm {
      a: number;
      b: number;
    }
    const deps: FieldDependency<CyclicForm>[] = [
      { field: 'a', dependsOn: ['b'], compute: (d) => d.b + 1 },
      { field: 'b', dependsOn: ['a'], compute: (d) => d.a + 1 },
    ];
    const result = recomputeDependents({ a: 1, b: 1 }, deps);
    // Neither field reaches in-degree 0, so both are left untouched rather
    // than the function looping forever.
    expect(result).toEqual({ a: 1, b: 1 });
  });

  it('scales to the issue-specified bound of 50 dependent fields', () => {
    interface WideForm {
      base: number;
      [key: `f${number}`]: number;
    }
    const base: WideForm = { base: 1 };
    const deps: FieldDependency<WideForm>[] = [];
    for (let i = 0; i < 50; i++) {
      const field = `f${i}` as const;
      base[field] = 0;
      deps.push({ field, dependsOn: ['base'], compute: (d) => d.base + i });
    }
    const result = recomputeDependents(base, deps);
    for (let i = 0; i < 50; i++) {
      expect(result[`f${i}` as const]).toBe(1 + i);
    }
  });
});
