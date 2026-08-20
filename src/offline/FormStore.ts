import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface FormDraft<T extends object = Record<string, unknown>> {
  id: string;
  data: T;
  updatedAt: number;
}

interface FormStoreSchema extends DBSchema {
  drafts: {
    key: string;
    value: FormDraft;
    indexes: { "by-updatedAt": number };
  };
}

const DB_NAME = "agritrust-form-drafts";
const DB_VERSION = 1;
const AUTOSAVE_DELAY_MS = 30_000;
let dbPromise: Promise<IDBPDatabase<FormStoreSchema>> | undefined;

function getDb(): Promise<IDBPDatabase<FormStoreSchema>> {
  dbPromise ??= openDB<FormStoreSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore("drafts", { keyPath: "id" });
      store.createIndex("by-updatedAt", "updatedAt");
    },
  });
  return dbPromise;
}

export async function saveDraft<T extends object>(
  id: string,
  data: T,
): Promise<FormDraft<T>> {
  const draft: FormDraft<T> = { id, data, updatedAt: Date.now() };
  await (await getDb()).put("drafts", draft as FormDraft);
  return draft;
}

export async function getDraft<T extends object>(
  id: string,
): Promise<FormDraft<T> | undefined> {
  return (await getDb()).get("drafts", id) as Promise<FormDraft<T> | undefined>;
}

export async function listDrafts(): Promise<FormDraft[]> {
  return (await getDb()).getAllFromIndex("drafts", "by-updatedAt");
}

export async function deleteDraft(id: string): Promise<void> {
  await (await getDb()).delete("drafts", id);
}

export function createDraftAutoSaver<T extends object>(
  id: string,
  onSaved?: (draft: FormDraft<T>) => void,
  delayMs = AUTOSAVE_DELAY_MS,
): { schedule: (data: T) => void; flush: () => Promise<void>; dispose: () => void } {
  let latest: T | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = async () => {
    if (latest === undefined) return;
    const draft = await saveDraft(id, latest);
    latest = undefined;
    onSaved?.(draft);
  };

  return {
    schedule(data) {
      latest = data;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), delayMs);
    },
    flush,
    dispose() {
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}

export const FORM_AUTOSAVE_DELAY_MS = AUTOSAVE_DELAY_MS;