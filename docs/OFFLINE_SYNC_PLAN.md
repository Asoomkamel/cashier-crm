# Offline Sync Plan

## Current Architecture

```
User action
  → localStorage (immediate, synchronous)
  → React state update
  → scheduleCloudSync() [800ms debounce]
  → /api/backup/save → app_backups (JSONB blob)
  → Supabase Realtime → other devices
```

This works for single-user and small teams. The mutation queue prepares
for a more robust offline-first architecture.

## Current Storage Layers

| Layer | What it stores | Durability |
|-------|---------------|------------|
| `localStorage` | All app data (JSON) | Browser only |
| `app_backups` | Full snapshot (JSONB) | Supabase cloud |
| PostgreSQL tables | Normalized records | Supabase cloud |
| `cc_mutation_queue` (localStorage) | Pending mutations | Browser only |
| IndexedDB (`cashier_crm_offline`) | Mutation queue backup | Browser only |

## Mutation Queue Lifecycle

```
User performs action (e.g. creates invoice)
  → Optimistic update to localStorage + React state (immediate)
  → mutationQueue.enqueue('checkout', payload)    [status: pending]
  → UI shows "pending sync" indicator
  ↓
Network available + server checkout enabled
  → mutationQueue.markSyncing(id)                 [status: syncing]
  → POST /api/transactions/checkout
  → Success → mutationQueue.markSynced(id)        [status: synced]
  → Failure → mutationQueue.markFailed(id, err)   [status: failed, attempts++]
  ↓
After MAX_ATTEMPTS (5) failures
  → status: failed — shown in UI as "sync error"
  → Admin can review and manually retry or dismiss
```

## Pending Sync Indicator

The `Shell.tsx` already shows `isSyncing` from the store. Phase 6 will add:
- Count of `pending` mutations in the queue badge
- Color coding: amber (pending), red (failed)
- Detail panel listing failed mutations

## IndexedDB Queue

The `lib/modules/offline/indexedDbQueue.ts` provides a more durable
alternative to the localStorage mutation queue. IndexedDB survives:
- Browser tab close
- Page refresh
- Memory pressure

Migration path:
1. Phase 5: localStorage queue (current, simpler, works)
2. Phase 6: IndexedDB as primary, localStorage as fallback

## What Should NOT Sync Offline

**Stock deduction** is the most dangerous operation. Rules:

1. **With server checkout enabled**: never deduct stock optimistically.
   Show the invoice as "pending" until the server confirms.
   Display a clear "Pending — waiting for sync" status.

2. **Without server checkout (current default)**: deduct from localStorage
   immediately (existing behavior). This is acceptable for single-user mode.

3. **Stock conflict resolution**: if a conflict is detected (idempotency key
   replay), the server's version wins. The client syncs down the server state.

## Environment Variables

```env
# When true: use server-side checkout (atomic PostgreSQL transaction)
# When false: use local checkout (existing behavior)
NEXT_PUBLIC_USE_SERVER_CHECKOUT=false

# When true: use Supabase Auth JWT for API calls
# When false: use local session only
NEXT_PUBLIC_USE_SUPABASE_AUTH=false
```

## Phase 6 Roadmap

1. **Sync worker**: background interval that replays the mutation queue
2. **Conflict resolution**: last-write-wins with version numbers
3. **IndexedDB migration**: move operational data from localStorage to IndexedDB
4. **Service Worker**: intercept fetch calls, serve from cache when offline
5. **Supabase Realtime**: push updates to all connected devices instantly
