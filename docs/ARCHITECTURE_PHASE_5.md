# Architecture Phase 5 — Modular Monolith + Supabase as Source of Truth

## Summary

Phase 5 builds directly on the Phase 4 normalized schema and seed. It adds:

1. **Missing modules** — auth, customers, workOrders, reports, technicianInventory
2. **RLS policies** — row-level security for every normalized table
3. **Enhanced checkout RPC** — atomic transaction with stock, commission, audit
4. **Audit triggers** — database-level audit trail for sensitive tables
5. **Enhanced mutation queue** — offline-first with status tracking
6. **Supabase Auth bridge** — gradual transition from local PIN to Auth OTP
7. **Report services** — pure computation layer, ready for server-side data

---

## New Files Added

| File | Purpose |
|------|---------|
| `lib/modules/auth/service.ts` | Auth bridge: local PIN + Supabase Auth |
| `lib/modules/customers/service.ts` | Customer CRUD, search, balance computation |
| `lib/modules/workOrders/service.ts` | Work order status FSM, assignment, filtering |
| `lib/modules/technicianInventory/service.ts` | Assign, deduct, transfer, adjust tech inventory |
| `lib/modules/reports/service.ts` | Sales, tax, expenses, inventory, technician reports |
| `lib/modules/sync/mutationQueue.ts` | Enhanced offline mutation queue |
| `supabase/11_rls_policies.sql` | RLS for all normalized tables + helper functions |
| `supabase/12_audit_triggers.sql` | Database-level audit triggers |
| `supabase/13_enhanced_checkout_rpc.sql` | Full atomic checkout with stock + commission |
| `app/api/system/health/route.ts` | Updated with RLS, new tables, row counts |
| `docs/ARCHITECTURE_PHASE_5.md` | This file |
| `docs/ARCHITECTURE_UPGRADE_PLAN.md` | Updated master plan |
| `docs/DATABASE_MIGRATION_GUIDE.md` | Step-by-step migration guide |
| `docs/SUPABASE_AUTH_RLS_GUIDE.md` | Auth + RLS setup guide |
| `docs/OFFLINE_SYNC_PLAN.md` | Offline cache and sync strategy |

---

## Module Architecture

```
lib/modules/
  auth/
    service.ts          ← local login + Supabase Auth bridge
  customers/
    service.ts          ← search, create, upsert, balance
  workOrders/
    service.ts          ← status FSM, assignment, filtering
  technicianInventory/
    service.ts          ← assign, deduct, transfer, adjust
  reports/
    service.ts          ← all report computations (pure functions)
  invoices/
    calculations.ts     ← (existing) totals, tax, discount
  inventory/
    movements.ts        ← (existing) stock helpers
  pos/
    checkoutService.ts  ← (existing) local checkout logic
    serverCheckoutClient.ts ← (existing) server checkout client
  database/
    normalizedSeed.ts   ← (existing) legacy → PostgreSQL migration
    normalizedCheckout.ts ← (existing) checkout command builder
    records.ts          ← (existing) TypeScript record interfaces
  audit/
    service.ts          ← (existing) local audit log
  permissions/
    permissions.ts      ← (existing) role-based permissions
  reminders/
    service.ts          ← (existing) reminder computation
  sync/
    mutationQueue.ts    ← enhanced offline queue
  offline/
    indexedDbQueue.ts   ← (existing) IndexedDB queue
  appData/
    payload.ts          ← (existing) full payload builder
```

---

## Supabase Schema (after all migrations)

```
organizations           ← multi-tenant root
  branches              ← sub-units per org
  profiles              ← users (linked to auth.users)
  permissions           ← permission codes
  role_permissions      ← role → permission mapping

customers               ← CRM customers
products                ← catalog (storable products only)

invoices                ← sales invoices
  invoice_items         ← line items
payments                ← payment records

stock_movements         ← immutable ledger of all stock changes
stock_balances          ← VIEW: computed current stock
technician_inventory    ← technician stock balances
technician_inventory_balances ← VIEW: with product details
technician_financial_transactions ← commissions, cash, etc.

work_orders             ← urgent orders + appointments (future)
audit_logs              ← full audit trail
idempotency_keys        ← prevent duplicate transactions
app_migration_runs      ← migration history
app_backups             ← emergency JSON snapshot (backup only)
```

---

## RLS Security Model

```
admin
  → full access to their organization

supervisor
  → full access within their branch
  → cannot manage users or settings

technician
  → work_orders: only assigned tasks
  → technician_inventory: only own stock
  → technician_financial_transactions: only own records
  → invoices: only their invoices

accountant
  → read: invoices, payments, expenses, reports
  → no write access

pos
  → create + print invoices
  → view customers

viewer
  → read-only within org scope
```

---

## Checkout Transaction Flow

The `create_checkout_transaction` RPC (supabase/13_enhanced_checkout_rpc.sql) runs all of the following in a single PostgreSQL transaction:

1. Validate inputs (org, idempotency, items)
2. Check idempotency (replay safe)
3. Verify stock availability (tech or main)
4. Insert invoice
5. Insert invoice items
6. Insert stock movements (SALE_OUT or TECHNICIAN_CONSUME)
7. Update technician_inventory (if using tech stock)
8. Insert payment record
9. Insert technician financial transactions (cash, completion commission, marketing commission)
10. Save idempotency key with response
11. Insert audit log entry

If any step fails → full rollback. No partial state.

---

## Feature Flags

```env
# Enable Supabase Auth (OTP) instead of local PIN login
NEXT_PUBLIC_USE_SUPABASE_AUTH=false

# Enable server-side checkout instead of local checkout
NEXT_PUBLIC_USE_SERVER_CHECKOUT=false
```

Both default to `false` for backward compatibility. Flip when ready.

---

## What Remains for Phase 6

- [ ] Full Supabase Auth OTP login flow replacing local PIN
- [ ] Read from PostgreSQL tables instead of localStorage for reports
- [ ] Work orders in PostgreSQL (separate from urgent_orders JSON snapshot)
- [ ] Supabase Realtime for multi-user task updates
- [ ] IndexedDB as primary cache replacing localStorage for operational data
- [ ] Sync worker that replays the mutation queue on reconnect
- [ ] Soft delete + version conflict resolution
