/**
 * lib/modules/sync/mutationQueue.ts
 *
 * Offline mutation queue — Phase 5 enhancement.
 *
 * Queues operations when the app is offline (or server checkout fails).
 * Each mutation has an idempotency_key to prevent duplicates on replay.
 *
 * Storage: localStorage (with IndexedDB as a future upgrade path — see
 * lib/modules/offline/indexedDbQueue.ts).
 *
 * Status lifecycle:
 *   pending → syncing → synced
 *                     ↘ failed (retried up to MAX_ATTEMPTS)
 */

const KEY = "cc_mutation_queue";
const MAX_ATTEMPTS = 5;

export type MutationStatus = "pending" | "syncing" | "synced" | "failed";

export type MutationType =
  | "checkout"
  | "update_stock"
  | "assign_tech_inventory"
  | "update_work_order_status"
  | "create_customer"
  | "create_reminder"
  | "create_expense"
  | "invoice.create.local"
  | "invoice.create.server"
  | "generic";

export interface QueuedMutation {
  id: string;
  idempotencyKey: string;
  type: MutationType;
  entityType?: string;
  entityId?: string;
  payload: unknown;
  status: MutationStatus;
  attempts: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

function readQueue(): QueuedMutation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedMutation[]): void {
  if (typeof window === "undefined") return;
  // Keep max 500 mutations to avoid unbounded growth
  window.localStorage.setItem(
    KEY,
    JSON.stringify(queue.slice(-500))
  );
}

export const mutationQueue = {
  list(): QueuedMutation[] {
    return readQueue();
  },

  pending(): QueuedMutation[] {
    return readQueue().filter((m) => m.status === "pending");
  },

  enqueue(
    type: MutationType,
    payload: unknown,
    opts?: { entityType?: string; entityId?: string }
  ): QueuedMutation {
    const now = Date.now();
    const item: QueuedMutation = {
      id: `mut_${now}_${Math.random().toString(36).slice(2, 8)}`,
      idempotencyKey: `idem_${now}_${Math.random().toString(36).slice(2, 10)}`,
      type,
      entityType: opts?.entityType,
      entityId: opts?.entityId,
      payload,
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    writeQueue([...readQueue(), item]);
    return item;
  },

  markSyncing(id: string): void {
    writeQueue(
      readQueue().map((m) =>
        m.id === id
          ? { ...m, status: "syncing", updatedAt: Date.now() }
          : m
      )
    );
  },

  markSynced(id: string): void {
    writeQueue(
      readQueue().map((m) =>
        m.id === id
          ? { ...m, status: "synced", updatedAt: Date.now() }
          : m
      )
    );
  },

  markFailed(id: string, error: string): void {
    writeQueue(
      readQueue().map((m) => {
        if (m.id !== id) return m;
        const attempts = m.attempts + 1;
        return {
          ...m,
          status: (attempts >= MAX_ATTEMPTS ? "failed" : "pending") as MutationStatus,
          attempts,
          lastError: error,
          updatedAt: Date.now(),
        };
      })
    );
  },

  remove(id: string): void {
    writeQueue(readQueue().filter((m) => m.id !== id));
  },

  removeSynced(): void {
    writeQueue(readQueue().filter((m) => m.status !== "synced"));
  },

  clear(): void {
    writeQueue([]);
  },

  pendingCount(): number {
    return readQueue().filter((m) => m.status === "pending").length;
  },

  hasIdempotencyKey(key: string): boolean {
    return readQueue().some((m) => m.idempotencyKey === key);
  },
};
