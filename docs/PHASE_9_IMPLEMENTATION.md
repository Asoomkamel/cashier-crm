# Architecture Phase 9 — IDB Cache + Work Orders Sync + PWA + Multi-Branch

## What Was Implemented

### 1. IndexedDB Cache — Integrated into store.tsx

**File:** `lib/store.tsx`

The store now reads from IndexedDB when `NEXT_PUBLIC_USE_IDB_CACHE=true`:

**Initialization:**
- Reads all operational data from IDB stores in parallel
- Falls back to localStorage if IDB data is missing
- Settings always read from localStorage (language, theme, PIN)

**Write-through:**
- Every setter (`setCustomers`, `setCatalog`, etc.) now writes to **both** localStorage AND IndexedDB
- Uses a non-blocking `idbWrite()` helper — never slows down the UI
- Settings (`setSettings`) remain localStorage-only

**Activation:**
```bash
# Step 1: Run IDB migration in /system-health → "نقل البيانات إلى IndexedDB"
# Step 2: Add to .env.local and redeploy:
NEXT_PUBLIC_USE_IDB_CACHE=true
```

### 2. Multi-Branch Selector

**File:** `components/Sidebar.tsx`

- Branch selector appears for `admin` and `supervisor` roles when `settings.branches.length > 1`
- Selection persisted in `localStorage.cc_active_branch`
- `activeBranch` and `setActiveBranch` added to AppState/AppContext
- Single-branch users see branch name in role badge

### 3. Service Worker — PWA Offline Support

**Files:** `public/sw.js`, `public/offline.html`, `app/layout.tsx`

- Registers `sw.js` on page load
- Caches static assets (`/_next/static/**`, pages) with network-first strategy
- API routes **never cached** (data integrity)
- Custom Arabic offline page at `/offline.html`
- Auto-updates via `SKIP_WAITING` message

### 4. Work Orders Real-Time Sync API

**File:** `app/api/work-orders/sync/route.ts`

```
POST /api/work-orders/sync
  Body: { urgentOrders: ServiceOrder[], appointments: ServiceOrder[] }
  → Upserts to work_orders table via external_id ON CONFLICT

GET /api/work-orders/sync
  → Returns all work_orders from PostgreSQL
```

Both endpoints require `SERVER_ACTION_SECRET` header.

### 5. New SQL Tables (Supabase)

**Migration 17** (`supabase/17_phase9_work_orders_expenses_reminders.sql`):
- `work_orders`: soft delete + 10 new columns + 3 indexes + audit trigger
- `expenses`: new table with RLS
- `reminders`: new table with RLS

**Data migrated:**
- expenses: 5 records
- reminders: 1 record (customers with nextReminderDate)

### 6. Tests — 96/96 Passing

New test file: `__tests__/workOrders/service.test.ts` — 18 tests

```
canTransition       — 8 scenarios (valid/invalid transitions)
updateWorkOrderStatus — valid + invalid + note
assignTechnician    — assignment + log entry
postponeOrder       — date shift + status change
getOrdersForTechnician — filter by tech
getOpenOrders       — exclude completed/canceled
nextRequestNumber   — empty + sequential
```

---

## Activation Guide

### Enable IDB Cache
```env
NEXT_PUBLIC_USE_IDB_CACHE=true
```
Run migration first from `/system-health`.

### Enable Work Orders Sync
```env
SERVER_ACTION_SECRET=<your_secret>
```
Then call `POST /api/work-orders/sync` with current orders payload.

### Enable Multi-Branch
Add branches in Settings → Branches list. Selector appears automatically
for admin/supervisor when more than 1 branch is configured.

---

## What Remains (Phase 10)

- [ ] Supabase Auth OTP full activation (`NEXT_PUBLIC_USE_SUPABASE_AUTH=true`)
- [ ] Reports UI: render PostgreSQL data in actual tables (not JSON)
- [ ] Customer debts page reading from `customer_balances` view
- [ ] Work orders page: toggle between local/server data source
- [ ] Stock movements ledger UI showing history
- [ ] Purchases migration to PostgreSQL
