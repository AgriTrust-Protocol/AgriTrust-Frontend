// src/services/txStateStore.ts
//
// Persists in-flight transaction state to sessionStorage so a refresh, soft
// navigation, or crashed tab doesn't leave the user blind about whether an
// escrow deposit actually went out. Deliberately dependency-free (no React)
// so it can be unit-tested and used from anywhere.

export type TxStatus =
  | "preparing"
  | "broadcasting"
  | "pending_confirmation"
  | "confirmed"
  | "failed"
  | "unknown";

export interface TxEntry {
  txHash: string | null;
  operationId: string;
  status: TxStatus;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, string>;
}

const STORAGE_KEY = "agritrust:tx-recovery-queue";
const MAX_TRACKED = 100;

/**
 * Thin wrapper around sessionStorage so the rest of the module (and tests)
 * never touch `window.sessionStorage` directly. Every call is wrapped in
 * try/catch — a full or disabled storage (private browsing, quota exceeded)
 * degrades to "recovery just doesn't work this session" rather than crashing
 * the app.
 */
function readRaw(): Record<string, TxEntry> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (err) {
    console.error("txStateStore: failed to read sessionStorage", err);
    return {};
  }
}

function writeRaw(entries: Record<string, TxEntry>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    // Most likely QuotaExceededError. Fall back to evicting the oldest half
    // of the entries and retrying once before giving up silently — losing
    // recovery data is much better than throwing mid-transaction.
    console.error("txStateStore: write failed, attempting eviction", err);
    try {
      const sorted = Object.entries(entries).sort(
        (a, b) => a[1].updatedAt - b[1].updatedAt
      );
      const trimmed = Object.fromEntries(sorted.slice(Math.ceil(sorted.length / 2)));
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (retryErr) {
      console.error("txStateStore: write failed again after eviction, giving up", retryErr);
    }
  }
}

/** Enforces the 100-entry cap via LRU eviction keyed on updatedAt. */
function evictIfNeeded(entries: Record<string, TxEntry>): Record<string, TxEntry> {
  const keys = Object.keys(entries);
  if (keys.length <= MAX_TRACKED) return entries;

  const sorted = keys
    .map((k) => [k, entries[k]] as const)
    .sort((a, b) => a[1].updatedAt - b[1].updatedAt);

  const toDrop = sorted.slice(0, keys.length - MAX_TRACKED).map(([k]) => k);
  const next = { ...entries };
  for (const k of toDrop) delete next[k];
  return next;
}

/** Saves a new entry (or overwrites one with the same operationId). */
export function save(entry: Omit<TxEntry, "createdAt" | "updatedAt"> & Partial<Pick<TxEntry, "createdAt" | "updatedAt">>): TxEntry {
  const now = Date.now();
  const full: TxEntry = {
    createdAt: entry.createdAt ?? now,
    updatedAt: now,
    txHash: entry.txHash,
    operationId: entry.operationId,
    status: entry.status,
    metadata: entry.metadata ?? {},
  };

  const entries = evictIfNeeded({ ...readRaw(), [entry.operationId]: full });
  writeRaw(entries);
  return full;
}

/**
 * Updates an entry by txHash (once the wallet has returned one) or by
 * operationId (before a hash exists, e.g. `preparing` -> `broadcasting`).
 * No-ops if neither key matches an existing entry.
 */
export function update(
  key: { txHash?: string; operationId?: string },
  status: TxStatus,
  patch: Partial<Pick<TxEntry, "txHash" | "metadata">> = {}
): TxEntry | null {
  const entries = readRaw();

  const matchId = key.operationId
    ? key.operationId
    : Object.keys(entries).find((id) => entries[id].txHash === key.txHash);

  if (!matchId || !entries[matchId]) return null;

  const updated: TxEntry = {
    ...entries[matchId],
    ...patch,
    status,
    updatedAt: Date.now(),
  };
  entries[matchId] = updated;
  writeRaw(entries);
  return updated;
}

export function getAll(): TxEntry[] {
  return Object.values(readRaw()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getPending(): TxEntry[] {
  return getAll().filter(
    (e) => e.status === "broadcasting" || e.status === "pending_confirmation"
  );
}

/** Entries stuck in `preparing` with no hash — refreshed before signing. */
export function getUnsigned(): TxEntry[] {
  return getAll().filter((e) => e.status === "preparing" && e.txHash === null);
}

export function remove(operationId: string): void {
  const entries = readRaw();
  delete entries[operationId];
  writeRaw(entries);
}

export function clear(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error("txStateStore: failed to clear sessionStorage", err);
  }
}

// Exposed for tests that want to bypass the module's own read/write guards.
export const __internal = { STORAGE_KEY, MAX_TRACKED };
