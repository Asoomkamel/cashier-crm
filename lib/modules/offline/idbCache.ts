/**
 * lib/modules/offline/idbCache.ts
 *
 * IndexedDB Cache Layer — Phase 8.
 *
 * Replaces localStorage as the primary cache for operational data.
 * localStorage is kept only for settings (language, theme, tiny flags).
 *
 * Design:
 *  - DB: "cashier_crm_data"  version 2
 *  - Object stores: one per entity type (customers, catalog, orders…)
 *  - Each store has: id (primary key), data (jsonb), updatedAt, version
 *
 * API is intentionally similar to localStorage so migration is easy:
 *   await idbCache.set("customers", customers)
 *   const customers = await idbCache.get<Customer[]>("customers") ?? []
 *
 * Falls back silently to in-memory if IndexedDB is unavailable (SSR, private mode).
 */

const DB_NAME    = "cashier_crm_data";
const DB_VERSION = 2;

// Stores that contain arrays of business records
const STORES = [
  "customers",
  "catalog",
  "orders",
  "vendors",
  "purchases",
  "expenses",
  "urgentOrders",
  "appointments",
  "techInventory",
  "techInventoryLogs",
  "techFinancialLogs",
  "customerPayments",
  "techLocations",
  "reminders",
  "auditLog",
  "users",
  // Meta store for single-value items (settings, activeUser)
  "meta",
] as const;

export type IdbStoreName = (typeof STORES)[number];

// ---------------------------------------------------------------------------
// In-memory fallback (SSR / private mode / IndexedDB unavailable)
// ---------------------------------------------------------------------------
const memFallback = new Map<string, unknown>();

// ---------------------------------------------------------------------------
// DB open
// ---------------------------------------------------------------------------

let _db: IDBDatabase | null = null;
let _opening = false;
const _openCallbacks: Array<(db: IDBDatabase | null) => void> = [];

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve) => {
    if (_opening) {
      _openCallbacks.push(resolve);
      return;
    }
    _opening = true;

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      // Create object stores that don't exist yet
      STORES.forEach((name) => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      });
    };

    req.onsuccess = () => {
      _db = req.result;
      _opening = false;
      resolve(_db);
      _openCallbacks.forEach((cb) => cb(_db));
      _openCallbacks.length = 0;
    };

    req.onerror = () => {
      _opening = false;
      resolve(null);
      _openCallbacks.forEach((cb) => cb(null));
      _openCallbacks.length = 0;
    };
  });
}

// ---------------------------------------------------------------------------
// Core read / write
// ---------------------------------------------------------------------------

interface CacheRecord {
  id: string;
  data: unknown;
  updatedAt: number;
  version: number;
}

async function idbGet(store: IdbStoreName, key = "default"): Promise<unknown | undefined> {
  const db = await openDb();
  if (!db) return memFallback.get(`${store}:${key}`);

  return new Promise((resolve) => {
    try {
      const tx  = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve((req.result as CacheRecord | undefined)?.data);
      req.onerror   = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

async function idbSet(store: IdbStoreName, data: unknown, key = "default"): Promise<void> {
  const db = await openDb();
  if (!db) {
    memFallback.set(`${store}:${key}`, data);
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      const record: CacheRecord = {
        id:        key,
        data,
        updatedAt: Date.now(),
        version:   1,
      };
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbDelete(store: IdbStoreName, key = "default"): Promise<void> {
  const db = await openDb();
  if (!db) {
    memFallback.delete(`${store}:${key}`);
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbClear(store: IdbStoreName): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ---------------------------------------------------------------------------
// Public API — typed convenience layer
// ---------------------------------------------------------------------------

export const idbCache = {
  /** Read a value. Returns undefined if not found. */
  async get<T>(store: IdbStoreName, key = "default"): Promise<T | undefined> {
    return idbGet(store, key) as Promise<T | undefined>;
  },

  /** Write a value. */
  async set<T>(store: IdbStoreName, value: T, key = "default"): Promise<void> {
    return idbSet(store, value, key);
  },

  /** Delete a key. */
  async delete(store: IdbStoreName, key = "default"): Promise<void> {
    return idbDelete(store, key);
  },

  /** Clear an entire store. */
  async clear(store: IdbStoreName): Promise<void> {
    return idbClear(store);
  },

  /** Clear all stores (factory reset). */
  async clearAll(): Promise<void> {
    await Promise.all(STORES.map((s) => idbClear(s)));
    memFallback.clear();
  },

  /** Check if IndexedDB is available in this environment. */
  async isAvailable(): Promise<boolean> {
    const db = await openDb();
    return db !== null;
  },
};

// ---------------------------------------------------------------------------
// Migration helper: copy from localStorage to IndexedDB (one-time)
// ---------------------------------------------------------------------------

/**
 * Reads all keys from localStorage and writes them to IndexedDB.
 * Safe to run multiple times — only writes if IndexedDB doesn't have the data yet.
 *
 * Call this once on app startup when IndexedDB becomes the primary cache.
 */
export async function migrateLocalStorageToIdb(
  keyMap: Record<string, IdbStoreName>
): Promise<{ migrated: string[]; skipped: string[] }> {
  if (typeof window === "undefined") return { migrated: [], skipped: [] };

  const migrated: string[] = [];
  const skipped:  string[] = [];

  for (const [lsKey, idbStore] of Object.entries(keyMap)) {
    const existing = await idbCache.get(idbStore);
    if (existing !== undefined) {
      skipped.push(lsKey);
      continue;
    }
    const raw = window.localStorage.getItem(lsKey);
    if (!raw) {
      skipped.push(lsKey);
      continue;
    }
    try {
      const parsed = JSON.parse(raw);
      await idbCache.set(idbStore, parsed);
      migrated.push(lsKey);
    } catch {
      skipped.push(lsKey);
    }
  }

  return { migrated, skipped };
}

// ---------------------------------------------------------------------------
// Async wrappers compatible with the sync storage.ts API
// (used during the transition period)
// ---------------------------------------------------------------------------

type ReadFn<T> = () => T;
type WriteFn<T> = (v: T) => void;

/**
 * Returns a getter/setter pair that uses IndexedDB as primary cache
 * and falls back to the provided localStorage getter/setter.
 *
 * This enables a gradual migration: pages/services can opt-in by using
 * idbWrapper instead of the direct storage functions.
 */
export function idbWrapper<T>(
  store: IdbStoreName,
  lsRead: ReadFn<T>,
  lsWrite: WriteFn<T>
): { read: () => Promise<T>; write: (v: T) => Promise<void> } {
  return {
    async read(): Promise<T> {
      const cached = await idbCache.get<T>(store);
      if (cached !== undefined) return cached;
      // Warm the cache from localStorage
      const lsVal = lsRead();
      await idbCache.set(store, lsVal);
      return lsVal;
    },
    async write(v: T): Promise<void> {
      // Write to both in parallel during transition
      await idbCache.set(store, v);
      lsWrite(v);
    },
  };
}
