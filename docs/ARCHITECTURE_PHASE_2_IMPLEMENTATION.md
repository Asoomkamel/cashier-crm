# Architecture Upgrade Phase 2 — Implemented Changes

This phase does not replace the current working application. It introduces a safer internal structure and prepares the project for a gradual move from localStorage + snapshot backup to a normalized Supabase/PostgreSQL architecture.

## Implemented in this version

### 1. POS business logic extraction
The invoice checkout flow was moved out of `app/pos/page.tsx` into:

```text
lib/modules/pos/checkoutService.ts
```

The POS page now calls `createCheckoutTransaction(...)` and receives a transaction-like result containing:

- the generated invoice/order;
- updated catalog stock;
- updated technician inventory;
- technician inventory movement logs;
- technician financial logs;
- the next invoice number.

This keeps the UI responsible for rendering and state updates, while invoice calculation, stock movement, cash collection, and commission preparation are handled by a business service.

### 2. Permission helper module
Added:

```text
lib/modules/permissions/permissions.ts
```

This centralizes permission checks such as `hasPermission(...)`, `getEffectivePermissions(...)`, and `canAccessAdminArea(...)` so future pages and API routes do not duplicate role logic.

### 3. Audit helper module
Added:

```text
lib/modules/audit/service.ts
```

This creates a single place for local audit-log writes until the normalized `audit_logs` table becomes the main audit source.

### 4. IndexedDB offline queue scaffold
Added:

```text
lib/modules/offline/indexedDbQueue.ts
```

This prepares the project for real offline sync. The existing queue is still kept compatible, but future mutation commands can be stored in IndexedDB rather than only localStorage.

### 5. Idempotency support in mutation queue
The local mutation queue now generates an `idempotencyKey` for each queued command. This is required before offline mutations can safely retry without creating duplicate invoices or duplicate stock movements.

### 6. Normalized PostgreSQL schema scaffold
Added:

```text
supabase/08_normalized_core_schema.sql
```

It creates the initial normalized tables needed for the future source-of-truth database:

- organizations
- branches
- profiles
- permissions
- role_permissions
- customers
- products
- invoices
- invoice_items
- payments
- stock_locations
- stock_movements
- work_orders
- audit_logs
- idempotency_keys

The migration is safe to run repeatedly and does not remove the existing `app_backups` snapshot backup flow.

### 7. System health API
Added:

```text
app/api/system/health/route.ts
```

This endpoint checks whether Supabase server configuration exists, whether `app_backups` is available, and whether the normalized tables from migration 08 are ready.

## What still remains

The following items are intentionally not completed in this phase because they require a controlled migration of live data:

1. Full Supabase Auth replacement for the current local login.
2. Full Row Level Security policies by organization, branch, and role.
3. Moving all customers/products/invoices from localStorage to PostgreSQL tables.
4. Atomic invoice creation RPC that writes invoice, items, payments, stock movements, and audit log in one database transaction.
5. Replacing localStorage operational data with IndexedDB cache + PostgreSQL source of truth.
6. TanStack Query for server state.
7. Conflict resolution for offline edits.

## Recommended next phase

The next technical phase should focus on only one business-critical flow:

```text
Create Invoice Transaction
```

Move it to a Supabase RPC function that does the following in one database transaction:

1. Validate idempotency key.
2. Create invoice.
3. Create invoice items.
4. Record payment.
5. Deduct stock or technician stock.
6. Record stock movements.
7. Record technician cash collection/commission if applicable.
8. Write audit log.

After this is stable, migrate customer and product reads to PostgreSQL gradually.
