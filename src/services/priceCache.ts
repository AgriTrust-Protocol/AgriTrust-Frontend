/**
 * IndexedDB price data cache for offline mode.
 *
 * On each price update, the latest price map is persisted to IndexedDB.
 * On mount, components hydrate from the cache first, then update from
 * the WebSocket feed.  When offline, the last-known prices are served
 * from cache with a stale indicator.
 */

import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import type { PriceMap, OHLCBar } from "@/src/types/prices";

// ── DB Schema ──────────────────────────────────────────────────────────────

interface PriceCacheDB extends DBSchema {
  /** Latest price map (single record, keyed by "latest"). */
  prices: {
    key: string;
    value: {
      key: string;
      data: PriceMap;
      updatedAt: number;
    };
  };
  /** OHLC historical data, keyed by pair. */
  ohlc: {
    key: string;
    value: {
      pair: string;
      bars: OHLCBar[];
      updatedAt: number;
    };
  };
}

const DB_NAME = "agritrust-price-cache";
const DB_VERSION = 1;
const PRICES_KEY = "latest";
const MAX_BARS_PER_PAIR = 400; // ~400 trading days — covers 1 year + buffer

let dbPromise: Promise<IDBPDatabase<PriceCacheDB>> | null = null;

function getDb(): Promise<IDBPDatabase<PriceCacheDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PriceCacheDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("prices")) {
          db.createObjectStore("prices", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("ohlc")) {
          db.createObjectStore("ohlc", { keyPath: "pair" });
        }
      },
    });
  }
  return dbPromise;
}

// ── Price Map Cache ────────────────────────────────────────────────────────

/** Persist the full price map to IndexedDB. */
export async function cachePriceMap(priceMap: PriceMap): Promise<void> {
  const db = await getDb();
  await db.put("prices", {
    key: PRICES_KEY,
    data: priceMap,
    updatedAt: Date.now(),
  });
}

/** Hydrate the cached price map from IndexedDB. Returns null if empty. */
export async function getCachedPriceMap(): Promise<{
  data: PriceMap;
  updatedAt: number;
} | null> {
  const db = await getDb();
  const record = await db.get("prices", PRICES_KEY);
  if (!record) return null;
  return { data: record.data, updatedAt: record.updatedAt };
}

// ── OHLC Cache ─────────────────────────────────────────────────────────────

/** Cache OHLC bars for a given pair, merging with existing bars and trimming to max. */
export async function cacheOHLCBars(
  pair: string,
  bars: OHLCBar[],
): Promise<void> {
  const db = await getDb();
  const existing = await db.get("ohlc", pair);

  // Merge new bars with existing, deduplicating by date.
  const barMap = new Map<string, OHLCBar>();
  if (existing) {
    for (const bar of existing.bars) {
      barMap.set(bar.date, bar);
    }
  }
  for (const bar of bars) {
    barMap.set(bar.date, bar);
  }

  // Sort by date and trim to max.
  const merged = Array.from(barMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_BARS_PER_PAIR);

  await db.put("ohlc", {
    pair,
    bars: merged,
    updatedAt: Date.now(),
  });
}

/** Retrieve cached OHLC bars for a given pair. Returns null if not cached. */
export async function getCachedOHLCBars(
  pair: string,
): Promise<OHLCBar[] | null> {
  const db = await getDb();
  const record = await db.get("ohlc", pair);
  if (!record) return null;
  // Filter to bars within our max window.
  return record.bars.slice(-MAX_BARS_PER_PAIR);
}

/** Reset the singleton DB connection — for use in tests only. */
export function _resetPriceCacheForTests(): void {
  dbPromise = null;
}
