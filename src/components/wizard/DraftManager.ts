import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { WizardDraft, WizardFormData, WizardStepData } from "@/src/components/wizard/types";

const DB_NAME = "agritrust-wizard-drafts";
const DB_VERSION = 1;
const DRAFT_STORE = "drafts";
const ATTACHMENT_STORE = "attachments";

interface AttachmentRecord {
  id: string;
  draftId: string;
  stepId: string;
  field: string;
  blob: Blob;
  updatedAt: number;
}

interface WizardDraftDB extends DBSchema {
  drafts: { key: string; value: WizardDraft };
  attachments: {
    key: string;
    value: AttachmentRecord;
    indexes: { "by-draft": string; "by-step": string };
  };
}

let dbPromise: Promise<IDBPDatabase<WizardDraftDB>> | null = null;

function getDb(): Promise<IDBPDatabase<WizardDraftDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WizardDraftDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(DRAFT_STORE)) db.createObjectStore(DRAFT_STORE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(ATTACHMENT_STORE)) {
          const store = db.createObjectStore(ATTACHMENT_STORE, { keyPath: "id" });
          store.createIndex("by-draft", "draftId");
          store.createIndex("by-step", "stepId");
        }
      },
    });
  }
  return dbPromise;
}

function stripBlobs(data: WizardStepData): WizardStepData {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => !(value instanceof Blob) && !(Array.isArray(value) && value.some((item) => item instanceof Blob)))
  );
}

export async function saveWizardStepDraft(input: {
  draftId: string;
  stepId: string;
  stepData: WizardStepData;
  currentStepId: string;
}): Promise<void> {
  const db = await getDb();
  const existing = await db.get(DRAFT_STORE, input.draftId);
  const formData: WizardFormData = { ...(existing?.formData ?? {}), [input.stepId]: stripBlobs(input.stepData) };
  await db.put(DRAFT_STORE, { id: input.draftId, formData, currentStepId: input.currentStepId, updatedAt: Date.now() });

  const tx = db.transaction(ATTACHMENT_STORE, "readwrite");
  for (const [field, value] of Object.entries(input.stepData)) {
    const blobs = value instanceof Blob ? [value] : Array.isArray(value) ? value.filter((item): item is Blob => item instanceof Blob) : [];
    await Promise.all(blobs.map((blob, index) => tx.store.put({ id: `${input.draftId}:${input.stepId}:${field}:${index}`, draftId: input.draftId, stepId: input.stepId, field, blob, updatedAt: Date.now() })));
  }
  await tx.done;
}

export async function loadWizardDraft(draftId: string): Promise<WizardDraft | undefined> {
  return (await getDb()).get(DRAFT_STORE, draftId);
}

export async function clearWizardDraft(draftId: string): Promise<void> {
  const db = await getDb();
  await db.delete(DRAFT_STORE, draftId);
  const attachments = await db.getAllFromIndex(ATTACHMENT_STORE, "by-draft", draftId);
  const tx = db.transaction(ATTACHMENT_STORE, "readwrite");
  await Promise.all(attachments.map((attachment) => tx.store.delete(attachment.id)));
  await tx.done;
}

export function _resetWizardDraftDbForTests(): void { dbPromise = null; }
