import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { recordOfflineSpan } from "./otel";

export interface FieldInspectionDraft {
  id: string;
  inspectorId: string;
  farmId: string;
  updatedAt: number;
  createdAt: number;
  lastServerUpdatedAt?: number;
  fields: Record<string, unknown>;
  photoIds: string[];
  status: "draft" | "queued" | "syncing" | "synced" | "conflict";
}

interface FieldFormsDB extends DBSchema {
  drafts: { key: string; value: FieldInspectionDraft; indexes: { "by-updatedAt": number } };
}

const DB_NAME = "agritrust-field-forms";
const DB_VERSION = 1;
export const DRAFT_AUTO_SAVE_MS = 30_000;
let dbPromise: Promise<IDBPDatabase<FieldFormsDB>> | null = null;

function db(): Promise<IDBPDatabase<FieldFormsDB>> {
  if (!dbPromise) dbPromise = openDB<FieldFormsDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("drafts")) {
        database.createObjectStore("drafts", { keyPath: "id" }).createIndex("by-updatedAt", "updatedAt");
      }
    },
  });
  return dbPromise;
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export async function upsertDraft(input: Omit<FieldInspectionDraft, "updatedAt" | "createdAt"> & Partial<Pick<FieldInspectionDraft, "updatedAt" | "createdAt">>): Promise<FieldInspectionDraft> {
  const database = await db();
  const now = Date.now();
  const draft: FieldInspectionDraft = { createdAt: input.createdAt ?? now, updatedAt: now, ...input };
  await database.put("drafts", draft);
  recordOfflineSpan("offline.draft.save", { "draft.id": draft.id, "photos.count": draft.photoIds.length });
  return draft;
}

export async function getDraft(id: string): Promise<FieldInspectionDraft | undefined> {
  return (await db()).get("drafts", id);
}

export async function listDrafts(): Promise<FieldInspectionDraft[]> {
  return (await db()).getAllFromIndex("drafts", "by-updatedAt");
}

export async function deleteDraft(id: string): Promise<void> {
  await (await db()).delete("drafts", id);
}

export function createDraftAutoSaver(draftId: string, loadDraft: () => Omit<FieldInspectionDraft, "id" | "updatedAt" | "createdAt"> & Partial<Pick<FieldInspectionDraft, "createdAt">>, delayMs = DRAFT_AUTO_SAVE_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void upsertDraft({ id: draftId, ...loadDraft() }), delayMs);
    },
    flush() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      return upsertDraft({ id: draftId, ...loadDraft() });
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}

export function _resetFormDbForTests(): void { dbPromise = null; }
