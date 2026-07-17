/**
 * lib/modules/offline/indexedDbQueue.ts
 *
 * IndexedDB Offline Mutation Queue — Phase 6 (enhanced).
 *
 * Stores mutations durably in IndexedDB. Survives tab close / page refresh.
 * Used as a more reliable alternative to the localStorage mutation queue.
 *
 * Schema fields match the requirements:
 *   id, idempotency_key, entity_type, operation_type, payload,
 *   status, retry_count, last_error, created_at, updated_at
 */

const DB_NAME    = "cashier_crm_offline";
const DB_VERSION = 2;
const STORE      = "mutation_queue";

export type OfflineMutationStatus = "pending" | "syncing" | "synced" | "failed";

export interface OfflineMutation {
  id:              string;
  idempotencyKey:  string;
  entityType:      string;   // e.g. "invoice", "work_order", "customer"
  operationType:   string;   // e.g. "create", "update", "delete", "status_change"
  payload:         unknown;
  status:          OfflineMutationStatus;
  retryCount:      number;
  lastError?:      string;
  createdAt:       number;   // ms
  updatedAt:       number;   // ms
}

// ---------------------------------------------------------------------------
// DB open
// ---------------------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      // Drop old store if upgrading from v1
      if (db.objectStoreNames.contains(STORE)) {
        db.deleteObjectStore(STORE);
      }

      const store = db.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("idxStatus",        "status",        { unique: false });
      store.createIndex("idxEntityType",    "entityType",    { unique: false });
      store.createIndex("idxOperationType", "operationType", { unique: false });
      store.createIndex("idxCreatedAt",     "createdAt",     { unique: false });
      store.createIndex("idxIdempotencyKey","idempotencyKey",{ unique: true  });
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error || new Error("Failed to open IndexedDB"));
  });
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** Enqueue (insert or replace by id) */
export async function enqueue(item: OfflineMutation): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
  db.close();
}

/** List all mutations, oldest first */
export async function listAll(): Promise<OfflineMutation[]> {
  const db = await openDb();
  const items = await new Promise<OfflineMutation[]>((resolve, reject) => {
    const tx  = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () =>
      resolve((req.result as OfflineMutation[]).sort((a, b) => a.createdAt - b.createdAt));
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items;
}

/** List by status */
export async function listByStatus(
  status: OfflineMutationStatus
): Promise<OfflineMutation[]> {
  const all = await listAll();
  return all.filter((m) => m.status === status);
}

/** Update status + optional error */
export async function updateStatus(
  id: string,
  status: OfflineMutationStatus,
  error?: string
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx    = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as OfflineMutation | undefined;
      if (!item) { resolve(); return; }
      const next: OfflineMutation = {
        ...item,
        status,
        lastError:  error ?? item.lastError,
        retryCount: status === "failed" ? item.retryCount + 1 : item.retryCount,
        updatedAt:  Date.now(),
      };
      store.put(next);
    };
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
  db.close();
}

/** Remove by id */
export async function remove(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
  db.close();
}

/** Remove all synced mutations */
export async function pruneSynced(): Promise<void> {
  const synced = await listByStatus("synced");
  if (synced.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx    = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    synced.forEach((m) => store.delete(m.id));
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
  db.close();
}

/** Check idempotency key exists */
export async function hasIdempotencyKey(key: string): Promise<boolean> {
  const db = await openDb();
  const found = await new Promise<boolean>((resolve, reject) => {
    const tx  = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).index("idxIdempotencyKey").get(key);
    req.onsuccess = () => resolve(req.result !== undefined);
    req.onerror   = () => reject(req.error);
  });
  db.close();
  return found;
}

/** Count by status */
export async function countByStatus(
  status: OfflineMutationStatus
): Promise<number> {
  const items = await listByStatus(status);
  return items.length;
}

// ---------------------------------------------------------------------------
// Backward-compat export used by old import path
// ---------------------------------------------------------------------------

/** @deprecated Use enqueue() instead */
export async function enqueueIndexedDbMutation(
  item: import("@/lib/modules/sync/mutationQueue").QueuedMutation
): Promise<void> {
  return enqueue({
    id:             item.id,
    idempotencyKey: item.idempotencyKey,
    entityType:     item.entityType || "unknown",
    operationType:  item.type,
    payload:        item.payload,
    status:         item.status as OfflineMutationStatus,
    retryCount:     item.attempts || 0,
    lastError:      item.lastError,
    createdAt:      item.createdAt,
    updatedAt:      item.updatedAt,
  });
}

/** @deprecated Use listAll() instead */
export async function listIndexedDbMutations(): Promise<
  import("@/lib/modules/sync/mutationQueue").QueuedMutation[]
> {
  const items = await listAll();
  return items.map((m) => ({
    id:             m.id,
    idempotencyKey: m.idempotencyKey,
    type:           m.operationType as import("@/lib/modules/sync/mutationQueue").MutationType,
    entityType:     m.entityType,
    payload:        m.payload,
    status:         m.status as import("@/lib/modules/sync/mutationQueue").MutationStatus,
    attempts:       m.retryCount,
    lastError:      m.lastError,
    createdAt:      m.createdAt,
    updatedAt:      m.updatedAt,
  }));
}

/** @deprecated Use remove() instead */
export async function removeIndexedDbMutation(id: string): Promise<void> {
  return remove(id);
}
