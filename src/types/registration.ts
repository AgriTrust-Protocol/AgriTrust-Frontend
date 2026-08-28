/**
 * src/types/registration.ts
 *
 * Generic types for the debounced multi-step registration form state
 * machine (issue #169). These are intentionally generic over a form-data
 * shape `T` rather than hardcoded to a specific domain, so the same engine
 * in `formStateMachine.ts` can drive the existing Farm registration wizard
 * (`src/types/farmWizard.ts`, `src/components/wizard/*`) as well as any
 * future "product registration" flow.
 *
 * `ProductRegistration` below is a concrete shape provided to satisfy the
 * issue's literal ask for a product-registration type; nothing in this repo
 * currently builds a product-registration UI on top of it (see the PR
 * description for details on why the state machine is generic rather than
 * hardcoded to the issue's specific — and, as of this PR, nonexistent —
 * `ProductRegistrationWizard` component tree).
 */

/** The seven states from the issue's technical invariants. */
export type FormMachineStatus =
  | 'IDLE'
  | 'FILLING'
  | 'VALIDATING'
  | 'SUBMITTING'
  | 'SUCCESS'
  | 'ERROR'
  | 'DRAFT_RECOVERED';

export interface FieldError {
  field: string;
  message: string;
}

/**
 * A declarative, JSON-serializable validation rule for a single field.
 * Kept serializable (no functions) so a full rule set can be posted to the
 * validation Web Worker via `postMessage` without structured-clone errors.
 */
export interface FieldRule {
  field: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  /** Source of a RegExp, e.g. "^[A-Z]{3}$" (no flags). */
  pattern?: string;
  /** Human-readable message used when `pattern` fails to match. */
  patternMessage?: string;
}

/** One step of a multi-step registration wizard, generic over the form data shape. */
export interface FormStep<T> {
  id: string;
  label: string;
  /** Fields owned/edited by this step. */
  fields: (keyof T & string)[];
  /** Declarative validation rules for this step's fields (worker-safe). */
  rules: FieldRule[];
}

/**
 * A field dependency: `field`'s value is derived from other fields via
 * `compute`, and must be recomputed whenever any field in `dependsOn`
 * changes. The dependency graph (up to 50 fields per the issue's bound) is
 * resolved via topological sort in `formStateMachine.ts` so transitive
 * dependents recompute in the correct order.
 */
export interface FieldDependency<T> {
  field: keyof T & string;
  dependsOn: (keyof T & string)[];
  compute: (data: T) => T[keyof T & string];
}

/** Draft record as persisted to IndexedDB by `src/services/cache.ts`. */
export interface FormDraft<T> {
  id: string;
  currentStepId: string;
  data: T;
  errors: FieldError[];
  updatedAt: number;
}

// ─── Example concrete domain: product registration ─────────────────────────

export type ProductCategory = 'grain' | 'produce' | 'livestock' | 'processed';

export interface ProductRegistration {
  productName: string;
  category: ProductCategory | '';
  sku: string;
  quantity: number;
  unit: string;
  certificationIds: string[];
  originFarmId: string;
  notes: string;
}

export const EMPTY_PRODUCT_REGISTRATION: ProductRegistration = {
  productName: '',
  category: '',
  sku: '',
  quantity: 0,
  unit: '',
  certificationIds: [],
  originFarmId: '',
  notes: '',
};
