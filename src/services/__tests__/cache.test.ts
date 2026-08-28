import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_DRAFTS, clearDraft, draftKey, loadDraft, saveDraft, _resetRegistrationCacheForTests } from '@/src/services/cache';

interface TestForm {
  name: string;
}

afterEach(async () => {
  for (let i = 0; i < 15; i++) {
    await clearDraft(`test-${i}`);
  }
  _resetRegistrationCacheForTests();
});

describe('registration draft cache', () => {
  it('keys drafts as form-draft-{id}', () => {
    expect(draftKey('abc123')).toBe('form-draft-abc123');
  });

  it('saves and loads a draft', async () => {
    await saveDraft<TestForm>('test-0', 'basic-info', { name: 'Maize' }, []);
    const draft = await loadDraft<TestForm>('test-0');
    expect(draft?.data.name).toBe('Maize');
    expect(draft?.currentStepId).toBe('basic-info');
  });

  it('returns undefined for a draft that does not exist', async () => {
    expect(await loadDraft('nonexistent')).toBeUndefined();
  });

  it('overwrites the same draft id rather than duplicating it', async () => {
    await saveDraft<TestForm>('test-1', 'step-a', { name: 'First' }, []);
    await saveDraft<TestForm>('test-1', 'step-b', { name: 'Second' }, []);
    const draft = await loadDraft<TestForm>('test-1');
    expect(draft?.data.name).toBe('Second');
    expect(draft?.currentStepId).toBe('step-b');
  });

  it('clears a draft', async () => {
    await saveDraft<TestForm>('test-2', 'basic-info', { name: 'Maize' }, []);
    await clearDraft('test-2');
    expect(await loadDraft('test-2')).toBeUndefined();
  });

  it(`retains at most ${MAX_DRAFTS} drafts, evicting the oldest first`, async () => {
    for (let i = 0; i < MAX_DRAFTS + 5; i++) {
      await saveDraft<TestForm>(`test-${i}`, 'basic-info', { name: `Draft ${i}` }, []);
    }

    // The first 5 (oldest) should have been evicted.
    for (let i = 0; i < 5; i++) {
      expect(await loadDraft(`test-${i}`)).toBeUndefined();
    }
    // The most recent MAX_DRAFTS should remain.
    for (let i = 5; i < MAX_DRAFTS + 5; i++) {
      expect(await loadDraft(`test-${i}`)).toBeDefined();
    }
  });
});
