/**
 * src/services/formValidator.worker.ts
 *
 * Web Worker that validates registration form data against a declarative,
 * serializable rule set (issue #169), so validation of larger forms never
 * blocks the UI thread.
 *
 * Message protocol
 * ─────────────────
 * Inbound  (main → worker):
 *   { type: 'VALIDATE', requestId: string, data: Record<string, unknown>, rules: FieldRule[] }
 *
 * Outbound (worker → main):
 *   { type: 'RESULT', requestId: string, errors: FieldError[] }
 *
 * Design notes
 * ─────────────
 * • Rules are plain data (`FieldRule[]`), not functions — functions can't
 *   survive `postMessage`'s structured clone, so validation logic itself
 *   lives here rather than being supplied by the caller.
 * • The exported `runValidation` function is importable directly for unit
 *   tests, avoiding the need to spin up a real Worker in the jsdom test
 *   environment (same approach as `analyticsDataProcessor.worker.ts`).
 * • The `self.onmessage` listener is guarded so importing this module in a
 *   non-worker context (SSR, tests, or the main-thread fallback path in
 *   `useFormWizard`) is a no-op rather than a crash.
 */
import type { FieldError, FieldRule } from '@/src/types/registration';

export interface ValidateMessage {
  type: 'VALIDATE';
  requestId: string;
  data: Record<string, unknown>;
  rules: FieldRule[];
}

export interface ResultMessage {
  type: 'RESULT';
  requestId: string;
  errors: FieldError[];
}

function validateField(rule: FieldRule, value: unknown): FieldError | null {
  const isEmpty =
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0);

  if (rule.required && isEmpty) {
    return { field: rule.field, message: 'This field is required' };
  }

  // Remaining rules don't apply to an already-empty optional field.
  if (isEmpty) return null;

  if (typeof value === 'string') {
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      return { field: rule.field, message: `Must be at least ${rule.minLength} characters` };
    }
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      return { field: rule.field, message: `Must be at most ${rule.maxLength} characters` };
    }
    if (rule.pattern) {
      const re = new RegExp(rule.pattern);
      if (!re.test(value)) {
        return { field: rule.field, message: rule.patternMessage ?? 'Invalid format' };
      }
    }
  }

  if (typeof value === 'number') {
    if (rule.min !== undefined && value < rule.min) {
      return { field: rule.field, message: `Must be at least ${rule.min}` };
    }
    if (rule.max !== undefined && value > rule.max) {
      return { field: rule.field, message: `Must be at most ${rule.max}` };
    }
  }

  return null;
}

/** Pure, synchronous validation — exported for direct unit testing and for
 * the main-thread fallback when Workers aren't available (SSR/tests). */
export function runValidation(data: Record<string, unknown>, rules: FieldRule[]): FieldError[] {
  const errors: FieldError[] = [];
  for (const rule of rules) {
    const error = validateField(rule, data[rule.field]);
    if (error) errors.push(error);
  }
  return errors;
}

// ─── Worker message listener (skipped in test / SSR environments) ─────────

if (
  typeof window === 'undefined' &&
  typeof globalThis.addEventListener === 'function' &&
  typeof globalThis.postMessage === 'function'
) {
  globalThis.addEventListener('message', (event: MessageEvent<ValidateMessage>) => {
    const msg = event.data;
    if (msg.type !== 'VALIDATE') return;

    const errors = runValidation(msg.data, msg.rules);
    const response: ResultMessage = { type: 'RESULT', requestId: msg.requestId, errors };
    globalThis.postMessage(response);
  });
}
