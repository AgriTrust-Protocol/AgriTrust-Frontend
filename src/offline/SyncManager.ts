import { processSyncQueue, getPendingSyncCount } from "@/src/services/indexedDbStore";
import { recordOfflineSpan } from "./otel";

export const FIELD_SYNC_TAG = "sync-audits";
export const MAX_QUEUED_SUBMISSIONS = 500;

export async function registerBackgroundSync(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  const registration = await navigator.serviceWorker.ready;
  const sync = (registration as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync;
  if (!sync) return false;
  await sync.register(FIELD_SYNC_TAG);
  return true;
}

export async function replayQueuedSubmissions(apiBaseUrl = "/api/v1"): Promise<{ before: number; after: number; successRate: number }> {
  const started = Date.now();
  const before = await getPendingSyncCount();
  await processSyncQueue(apiBaseUrl);
  const after = await getPendingSyncCount();
  const attempted = Math.max(before, 0);
  const successRate = attempted === 0 ? 1 : (attempted - after) / attempted;
  recordOfflineSpan("offline.sync.replay", { "queue.before": before, "queue.after": after, "sync.success_rate": successRate }, started);
  return { before, after, successRate };
}

export function trackOfflineDuration(isOnline: boolean): () => void {
  if (isOnline) return () => undefined;
  const started = Date.now();
  return () => recordOfflineSpan("offline.duration", { "offline.duration_ms": Date.now() - started });
}
