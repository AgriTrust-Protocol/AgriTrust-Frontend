/**
 * src/services/cache.ts
 *
 * Generic IndexedDB-backed draft cache for multi-step registration forms
 * (issue #169). Modeled on the existing `DraftManager`
 * (`src/components/wizard/DraftManager.ts`), generalized over the form data
 * shape `T` so it isn't tied to farm registration specifically.
 *
 * Keys are `form-draft-{formId}` per the issue's technical invariant. At
 * most `MAX_DRAFTS` (10) drafts are retained; the oldest (by `updatedAt`)
 * are evicted once the limit is exceeded.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { FieldError, FormDraft } from '@/src/types/registration';

const DB_NAME = 'agritrust-registration-wizard';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';
export const MAX_DRAFTS = 10;

interface RegistrationDraftDb extends DBSchema {
  drafts: { key: string; value: FormDraft<unknown>; indexes: { 'by-updatedAt': number } };
}

let dbPromise: Promise<IDBPDatabase<RegistrationDraftDb>> | undefined;

function getDb(): Promise<IDBPDatabase<RegistrationDraftDb>> {
  dbPromise ??= openDB<RegistrationDraftDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by-updatedAt', 'updatedAt');
      }
    },
  });
  return dbPromise;
}

export function draftKey(formId: string): string {
  return `form-draft-${formId}`;
}

/**
 * Persist (upsert) a draft, then evict the oldest drafts beyond `MAX_DRAFTS`
 * so IndexedDB usage doesn't grow unbounded across many abandoned forms.
 */
export async function saveDraft<T>(
  formId: string,
  currentStepId: string,
  data: T,
  errors: FieldError[] = []
): Promise<void> {
  const db = await getDb();
  const draft: FormDraft<T> = {
    id: draftKey(formId),
    currentStepId,
    data,
    errors,
    updatedAt: Date.now(),
  };
  await db.put(STORE_NAME, draft as FormDraft<unknown>);
  await evictOldestBeyondLimit(db);
}

export async function loadDraft<T>(formId: string): Promise<FormDraft<T> | undefined> {
  const db = await getDb();
  const draft = await db.get(STORE_NAME, draftKey(formId));
  return draft as FormDraft<T> | undefined;
}

export async function clearDraft(formId: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, draftKey(formId));
}

export async function listDraftIds(): Promise<string[]> {
  const db = await getDb();
  return db.getAllKeys(STORE_NAME);
}

async function evictOldestBeyondLimit(db: IDBPDatabase<RegistrationDraftDb>): Promise<void> {
  const all = await db.getAllFromIndex(STORE_NAME, 'by-updatedAt');
  const excess = all.length - MAX_DRAFTS;
  if (excess <= 0) return;

  // getAllFromIndex returns ascending order by the indexed field, so the
  // first `excess` entries are the oldest.
  const tx = db.transaction(STORE_NAME, 'readwrite');
  for (const draft of all.slice(0, excess)) {
    await tx.store.delete(draft.id);
  }
  await tx.done;
}

/** Test-only: reset the cached DB connection between test files/suites. */
export function _resetRegistrationCacheForTests(): void {
  dbPromise = undefined;
}
