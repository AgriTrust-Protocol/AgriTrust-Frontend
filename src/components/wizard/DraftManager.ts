import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { FarmAttachment, FarmFormData } from "@/src/types/farmWizard";

export type FarmDraftFields = Partial<Omit<FarmFormData, "attachments">>;

export interface FarmDraft {
  id: string;
  fields: FarmDraftFields;
  currentStep: string;
  updatedAt: number;
}

export interface FarmDraftAttachment extends FarmAttachment {
  draftId: string;
  stepId: string;
  blob: Blob;
}

interface WizardDraftDb extends DBSchema {
  drafts: { key: string; value: FarmDraft };
  attachments: { key: string; value: FarmDraftAttachment; indexes: { "by-draft": string } };
}

const DB_NAME = "agritrust-farm-wizard";
const DB_VERSION = 1;
let dbPromise: Promise<IDBPDatabase<WizardDraftDb>> | undefined;

function getDb(): Promise<IDBPDatabase<WizardDraftDb>> {
  dbPromise ??= openDB<WizardDraftDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts", { keyPath: "id" });
      if (!db.objectStoreNames.contains("attachments")) {
        const store = db.createObjectStore("attachments", { keyPath: "id" });
        store.createIndex("by-draft", "draftId");
      }
    },
  });
  return dbPromise;
}

function attachmentKey(draftId: string, stepId: string, fileId: string): string {
  return `${draftId}:${stepId}:${fileId}`;
}

export class DraftManager {
  async saveStep(
    draftId: string,
    stepId: string,
    fields: FarmDraftFields,
    files: File[],
    currentStep = stepId,
  ): Promise<void> {
    const db = await getDb();
    const existing = await db.get("drafts", draftId);
    const draft: FarmDraft = {
      id: draftId,
      fields: { ...existing?.fields, ...fields },
      currentStep,
      updatedAt: Date.now(),
    };
    const tx = db.transaction(["drafts", "attachments"], "readwrite");
    await tx.objectStore("drafts").put(draft);
    for (const file of files) {
      const id = crypto.randomUUID();
      await tx.objectStore("attachments").put({
        id: attachmentKey(draftId, stepId, id),
        draftId,
        stepId,
        blob: file,
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
      });
    }
    await tx.done;
  }

  async load(draftId: string): Promise<{ draft: FarmDraft; files: File[] } | undefined> {
    const db = await getDb();
    const draft = await db.get("drafts", draftId);
    if (!draft) return undefined;
    const attachments = await db.getAllFromIndex("attachments", "by-draft", draftId);
    const files = attachments.map((attachment) => new File([attachment.blob], attachment.name, {
      type: attachment.type,
      lastModified: attachment.lastModified,
    }));
    return { draft, files };
  }

  async clear(draftId: string): Promise<void> {
    const db = await getDb();
    const attachments = await db.getAllFromIndex("attachments", "by-draft", draftId);
    const tx = db.transaction(["drafts", "attachments"], "readwrite");
    await tx.objectStore("drafts").delete(draftId);
    for (const attachment of attachments) await tx.objectStore("attachments").delete(attachment.id);
    await tx.done;
  }
}

export function _resetDraftManagerForTests(): void {
  dbPromise = undefined;
}

export const draftManager = new DraftManager();
