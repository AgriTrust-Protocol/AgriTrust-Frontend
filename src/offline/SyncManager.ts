import { processSyncQueue, getPendingSyncCount } from "@/src/services/indexedDbStore";
import { createTraceContext, recordSpan } from "@/src/services/observability/tracing";

export const SYNC_TAG = "sync-audits";
export const MAX_QUEUED_ITEMS = 500;

export interface SyncManagerOptions {
  apiBaseUrl?: string;
  onStatusChange?: (status: "idle" | "syncing" | "offline" | "error") => void;
}

export class SyncManager {
  private running = false;
  private readonly options: SyncManagerOptions;

  constructor(options: SyncManagerOptions = {}) {
    this.options = options;
  }

  async sync(): Promise<void> {
    if (this.running || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    this.running = true;
    const startedAt = Date.now();
    this.options.onStatusChange?.("syncing");
    try {
      await processSyncQueue(this.options.apiBaseUrl);
      recordSpan("offline.sync", createTraceContext(), {
        "offline.queued_items": await getPendingSyncCount(),
        "offline.duration_ms": Date.now() - startedAt,
        "offline.sync_success": true,
      });
      this.options.onStatusChange?.("idle");
    } catch (error) {
      recordSpan("offline.sync", createTraceContext(), {
        "offline.duration_ms": Date.now() - startedAt,
        "offline.sync_success": false,
      }, error instanceof Error ? error.name : "sync-error");
      this.options.onStatusChange?.("error");
      throw error;
    } finally {
      this.running = false;
    }
  }

  async registerBackgroundSync(): Promise<void> {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    const sync = (registration as ServiceWorkerRegistration & {
      sync?: { register(tag: string): Promise<void> };
    }).sync;
    if (sync) await sync.register(SYNC_TAG);
  }

  isSyncing(): boolean {
    return this.running;
  }
}

export async function getQueuedItemCount(): Promise<number> {
  return getPendingSyncCount();
}