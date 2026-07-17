# Architecture Phase 3 — Transaction Foundation

## Purpose

This phase continues moving the system from a local-first JSON snapshot model toward a safer modular-monolith architecture backed by Supabase PostgreSQL.

The goal of this phase is not to force the live UI to use the normalized database immediately. Instead, it adds the server-side transaction foundation that will later allow invoice creation, payment recording, stock movement, and audit logging to happen atomically.

## Implemented in this phase

### 1. Server-side checkout transaction endpoint

Added:

```text
app/api/transactions/checkout/route.ts
```

This endpoint receives a normalized checkout command and calls the Supabase RPC:

```text
create_checkout_transaction
```

The endpoint validates the command and returns a clear setup message when the RPC migration has not been installed.

### 2. Normalized checkout command types

Added:

```text
lib/modules/database/normalizedCheckout.ts
```

This file defines:

- NormalizedCheckoutCommand
- NormalizedCheckoutItem
- NormalizedCheckoutResponse
- normalizeCheckoutCommand
- validateNormalizedCheckoutCommand

This gives the future database-backed checkout path a typed boundary instead of passing loose objects from UI components.

### 3. Client helper for server checkout

Added:

```text
lib/modules/pos/serverCheckoutClient.ts
```

This helper can be used later by POS or technician invoices to submit a transaction to the server endpoint. The current UI remains local-first to avoid breaking the existing system before the normalized schema is fully adopted.

### 4. Atomic checkout RPC migration

Added:

```text
supabase/09_checkout_transaction_rpc.sql
```

The RPC handles the future transaction path:

- insert invoice
- insert invoice items
- insert payment
- insert stock movements
- insert audit log
- save idempotency key response

All steps run inside a single PostgreSQL function call. If a step fails, the full transaction rolls back.

### 5. Health check enhancement

Updated:

```text
app/api/system/health/route.ts
```

The health endpoint now checks:

- Supabase server configuration
- backup snapshot table
- normalized tables
- checkout transaction RPC readiness

It also recommends the required migrations when setup is incomplete.

### 6. Local POS audit and offline mutation event

Updated:

```text
app/pos/page.tsx
```

Successful local invoice creation now records:

- a local audit event: `invoice.create.local`
- a queued mutation event: `invoice.create.local`
- an IndexedDB queue attempt as an offline-sync preparation step

This prepares the current local-first POS flow for later sync without changing the user workflow.

## What this phase does not change yet

The active POS flow still uses the existing local-first checkout service:

```text
lib/modules/pos/checkoutService.ts
```

The database-backed RPC is added as a safe server-side foundation but is not forced into production use yet. This avoids breaking existing invoice, inventory, technician inventory, Excel, and backup workflows while the normalized database migration is still incomplete.

## Next recommended phase

The next phase should focus on migrating one real module to Supabase tables. The best candidate is:

```text
products + stock_movements
```

After that, the invoice RPC can become the primary checkout path.

Recommended order:

1. Run `supabase/08_normalized_core_schema.sql`.
2. Run `supabase/09_checkout_transaction_rpc.sql`.
3. Add a product migration/import path from current catalog to `products`.
4. Add stock location initialization.
5. Use server checkout only when normalized product IDs are available.
6. Gradually reduce reliance on full JSON snapshot as the operational source of truth.
