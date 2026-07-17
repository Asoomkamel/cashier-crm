/**
 * lib/modules/sync/syncWorker.ts
 *
 * Sync Worker — Phase 6.
 *
 * Runs in the background, watches for network reconnect,
 * and replays the pending mutation queue.
 *
 * Usage (in layout or Shell):
 *   import { startSyncWorker, stopSyncWorker } from '@/lib/modules/sync/syncWorker';
 *   useEffect(() => { startSyncWorker(); return () => stopSyncWorker(); }, []);
 */

import { mutationQueue } from "./mutationQueue";

const INTERVAL_MS = 15_000; // check every 15 seconds
let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;

// ---------------------------------------------------------------------------
// Handlers per mutation type
// ---------------------------------------------------------------------------

async function replayMutation(
  id: string,
  type: string,
  payload: unknown
): Promise<void> {
  switch (type) {
    case "invoice.create.server": {
      const res = await fetch("/api/transactions/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as Record<string, unknown>)?.error as string ||
            `HTTP ${res.status}`
        );
      }
      break;
    }

    case "invoice.create.local":
      // Local invoices are already in localStorage — mark synced
      mutationQueue.markSynced(id);
      return;

    default:
      // Unknown type — mark failed to avoid infinite retry
      mutationQueue.markFailed(id, `Unknown mutation type: ${type}`);
      return;
  }
  mutationQueue.markSynced(id);
}

// ---------------------------------------------------------------------------
// Main flush loop
// ---------------------------------------------------------------------------

async function flushQueue(): Promise<void> {
  if (_running) return;
  if (!navigator.onLine) return;

  const pending = mutationQueue.pending();
  if (pending.length === 0) return;

  _running = true;
  try {
    for (const mutation of pending) {
      mutationQueue.markSyncing(mutation.id);
      try {
        await replayMutation(mutation.id, mutation.type, mutation.payload);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Unknown sync error";
        mutationQueue.markFailed(mutation.id, msg);
        console.warn(`[SyncWorker] Failed mutation ${mutation.id}:`, msg);
      }
    }
  } finally {
    _running = false;
    // Clean up synced entries older than 24h
    mutationQueue.removeSynced();
  }
}

// ---------------------------------------------------------------------------
// Start / stop
// ---------------------------------------------------------------------------

export function startSyncWorker(): void {
  if (typeof window === "undefined") return;

  // Flush immediately on start
  flushQueue();

  // Flush on reconnect
  window.addEventListener("online", flushQueue);

  // Periodic flush
  _timer = setInterval(flushQueue, INTERVAL_MS);
}

export function stopSyncWorker(): void {
  if (typeof window === "undefined") return;
  window.removeEventListener("online", flushQueue);
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

export function pendingSyncCount(): number {
  return mutationQueue.pendingCount();
}
