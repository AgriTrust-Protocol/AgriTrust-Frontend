/**
 * src/services/__tests__/formValidator.worker.test.ts
 *
 * Tests the pure `runValidation` function directly (see the design notes
 * in `formValidator.worker.ts` for why this is the same approach used by
 * `analyticsDataProcessor.worker.ts`'s tests).
 */
import { describe, it, expect } from 'vitest';
import { runValidation } from '@/src/services/formValidator.worker';
import type { FieldRule } from '@/src/types/registration';

describe('runValidation', () => {
  it('flags a missing required field', () => {
    const rules: FieldRule[] = [{ field: 'productName', required: true }];
    const errors = runValidation({ productName: '' }, rules);
    expect(errors).toEqual([{ field: 'productName', message: 'This field is required' }]);
  });

  it('passes a populated required field', () => {
    const rules: FieldRule[] = [{ field: 'productName', required: true }];
    expect(runValidation({ productName: 'Maize' }, rules)).toEqual([]);
  });

  it('enforces minLength / maxLength on strings', () => {
    const rules: FieldRule[] = [{ field: 'sku', minLength: 4, maxLength: 8 }];
    expect(runValidation({ sku: 'ab' }, rules)[0]?.message).toMatch(/at least 4/);
    expect(runValidation({ sku: 'abcdefghij' }, rules)[0]?.message).toMatch(/at most 8/);
    expect(runValidation({ sku: 'abcd' }, rules)).toEqual([]);
  });

  it('enforces min / max on numbers', () => {
    const rules: FieldRule[] = [{ field: 'quantity', min: 1, max: 1000 }];
    expect(runValidation({ quantity: 0 }, rules)[0]?.message).toMatch(/at least 1/);
    expect(runValidation({ quantity: 5000 }, rules)[0]?.message).toMatch(/at most 1000/);
    expect(runValidation({ quantity: 50 }, rules)).toEqual([]);
  });

  it('enforces a pattern with a custom message', () => {
    const rules: FieldRule[] = [{ field: 'sku', pattern: '^[A-Z]{3}-\\d{4}$', patternMessage: 'Format: ABC-1234' }];
    expect(runValidation({ sku: 'bad' }, rules)[0]?.message).toBe('Format: ABC-1234');
    expect(runValidation({ sku: 'ABC-1234' }, rules)).toEqual([]);
  });

  it('skips length/pattern/min/max checks for an empty optional field', () => {
    const rules: FieldRule[] = [{ field: 'notes', minLength: 10 }];
    expect(runValidation({ notes: '' }, rules)).toEqual([]);
  });

  it('validates multiple fields independently and collects all errors', () => {
    const rules: FieldRule[] = [
      { field: 'productName', required: true },
      { field: 'quantity', min: 1 },
    ];
    const errors = runValidation({ productName: '', quantity: 0 }, rules);
    expect(errors).toHaveLength(2);
    expect(errors.map((e) => e.field).sort()).toEqual(['productName', 'quantity']);
  });
});
