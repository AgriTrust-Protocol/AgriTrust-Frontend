import { openDB, type IDBPDatabase, type DBSchema } from "idb";

export interface AuditRecord {
  localId: string;
  inspectorId: string;
  farmId: string;
  timestamp: number;
  gpsCoordinates: { lat: number; lng: number };
  notes: string;
  signature: string;
  photos: string[];
  synced: boolean;
  createdAt: number;
}

export interface SyncQueueEntry {
  id: string;
  auditLocalId: string;
  status: "pending" | "syncing" | "synced" | "needs_review";
  createdAt: number;
  serverVersion?: AuditRecord;
  localDiff?: Partial<AuditRecord>;
}

interface PendingAsset {
  hash: string;
  data: string;
  mimeType: string;
}

interface AgriTrustDB extends DBSchema {
  audits: {
    key: string;
    value: AuditRecord;
  };
  syncQueue: {
    key: string;
    value: SyncQueueEntry;
    indexes: { "by-createdAt": number };
  };
  pendingAssets: {
    key: string;
    value: PendingAsset;
  };
}

const DB_NAME = "agritrust-offline";
const DB_VERSION = 1;
export const MAX_QUEUE_SIZE = 500;

let dbPromise: Promise<IDBPDatabase<AgriTrustDB>> | null = null;

function getDb(): Promise<IDBPDatabase<AgriTrustDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AgriTrustDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("audits")) {
          db.createObjectStore("audits", { keyPath: "localId" });
        }
        if (!db.objectStoreNames.contains("syncQueue")) {
          const syncStore = db.createObjectStore("syncQueue", { keyPath: "id" });
          syncStore.createIndex("by-createdAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("pendingAssets")) {
          db.createObjectStore("pendingAssets", { keyPath: "hash" });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveAuditOffline(
  audit: Omit<AuditRecord, "localId" | "synced" | "createdAt">
): Promise<string> {
  const db = await getDb();

  const queueCount = await db.count("syncQueue");
  if (queueCount >= MAX_QUEUE_SIZE) {
    // Evict the oldest pending entry to stay within the 500-record limit
    const tx = db.transaction(["syncQueue", "audits"], "readwrite");
    const cursor = await tx
      .objectStore("syncQueue")
      .index("by-createdAt")
      .openCursor();
    if (cursor) {
      const evictedAuditId = cursor.value.auditLocalId;
      await tx.objectStore("syncQueue").delete(cursor.value.id);
      await tx.objectStore("audits").delete(evictedAuditId);
      await tx.done;
    } else {
      await tx.done;
    }
    console.warn(
      "[AgriTrust] Offline queue full (500 records): oldest audit evicted."
    );
  }

  const localId = crypto.randomUUID();
  const createdAt = Date.now();

  const auditRecord: AuditRecord = {
    ...audit,
    localId,
    synced: false,
    createdAt,
  };

  const syncEntry: SyncQueueEntry = {
    id: crypto.randomUUID(),
    auditLocalId: localId,
    status: "pending",
    createdAt,
  };

  const tx = db.transaction(["audits", "syncQueue"], "readwrite");
  await tx.objectStore("audits").put(auditRecord);
  await tx.objectStore("syncQueue").put(syncEntry);
  await tx.done;

  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    void navigator.serviceWorker.ready
      .then((registration) =>
        (
          registration as ServiceWorkerRegistration & {
            sync?: { register(tag: string): Promise<void> };
          }
        ).sync?.register("sync-audits")
      )
      .catch(() => undefined);
  }

  return localId;
}

export async function processSyncQueue(
  apiBaseUrl: string = "/api/v1"
): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const db = await getDb();
  const pending = (
    await db
      .transaction("syncQueue", "readonly")
      .store.index("by-createdAt")
      .getAll()
  ).filter((e) => e.status === "pending");

  for (const entry of pending) {
    // Mark in-progress so a mid-sync network drop doesn't re-enqueue this record
    await db.put("syncQueue", { ...entry, status: "syncing" });

    const audit = await db.get("audits", entry.auditLocalId);
    if (!audit) {
      await db.delete("syncQueue", entry.id);
      continue;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/inspector/audits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(audit),
      });

      if (response.ok) {
        const tx = db.transaction(["audits", "syncQueue"], "readwrite");
        await tx.objectStore("audits").put({ ...audit, synced: true });
        await tx.objectStore("syncQueue").delete(entry.id);
        await tx.done;
      } else if (response.status === 409) {
        // Server timestamp wins; preserve local changes as a diff for manual review
        const serverVersion = (await response.json()) as AuditRecord;
        const localDiff: Partial<AuditRecord> = {};
        for (const key of Object.keys(audit) as (keyof AuditRecord)[]) {
          if (JSON.stringify(audit[key]) !== JSON.stringify(serverVersion[key])) {
            (localDiff as Record<string, unknown>)[key] = audit[key];
          }
        }
        await db.put("syncQueue", {
          ...entry,
          status: "needs_review",
          serverVersion,
          localDiff,
        });
      } else {
        // Transient server error — reset to pending for next sync attempt
        await db.put("syncQueue", { ...entry, status: "pending" });
      }
    } catch {
      // Network failure mid-sync — reset to pending so it retries on reconnect
      await db.put("syncQueue", { ...entry, status: "pending" });
    }
  }
}

export async function getPendingSyncCount(): Promise<number> {
  const db = await getDb();
  const all = await db.getAll("syncQueue");
  return all.filter(
    (e) => e.status === "pending" || e.status === "syncing"
  ).length;
}

export async function getStorageUsage(): Promise<{
  used: number;
  total: number;
  percent: number;
}> {
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    const { usage = 0, quota = 50 * 1024 * 1024 } =
      await navigator.storage.estimate();
    const total = quota;
    return { used: usage, total, percent: (usage / total) * 100 };
  }
  return { used: 0, total: 50 * 1024 * 1024, percent: 0 };
}

export async function getTotalAuditCount(): Promise<number> {
  const db = await getDb();
  return db.count("audits");
}

export async function getSyncedAuditCount(): Promise<number> {
  const db = await getDb();
  const all = await db.getAll("audits");
  return all.filter((a) => a.synced).length;
}

/** Resets the singleton DB connection — for use in tests only. */
export function _resetDbForTests(): void {
  dbPromise = null;
}

export async function getSyncQueueEntries(): Promise<SyncQueueEntry[]> {
  const db = await getDb();
  return db.getAllFromIndex("syncQueue", "by-createdAt");
}

export async function resolveConflict(
  entryId: string,
  resolution: "local" | "server"
): Promise<void> {
  const db = await getDb();
  const entry = await db.get("syncQueue", entryId);
  if (!entry) return;
  if (resolution === "local") {
    await db.put("syncQueue", { ...entry, status: "pending" });
    return;
  }
  if (entry.serverVersion) {
    const tx = db.transaction(["audits", "syncQueue"], "readwrite");
    await tx
      .objectStore("audits")
      .put({ ...entry.serverVersion, localId: entry.auditLocalId, synced: true });
    await tx.objectStore("syncQueue").delete(entry.id);
    await tx.done;
  }
}
