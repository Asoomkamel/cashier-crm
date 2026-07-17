# Architecture Phase 4 — Normalized Seed & Migration Readiness

This phase continues the migration from a local-first JSON snapshot model toward a database-driven modular monolith without breaking the existing user workflow.

## What changed

### 1. Normalized seed service

Added:

```text
lib/modules/database/normalizedSeed.ts
```

This service reads the current local snapshot payload and prepares or writes an initial normalized dataset into Supabase PostgreSQL tables.

It supports:

- Dry-run preview before writing data.
- Default organization creation.
- Default branch creation.
- Profiles from current users.
- Customers.
- Products.
- Invoices.
- Invoice items.
- Payments.
- Initial stock adjustment movements.
- Migration warnings.

The service is intentionally transitional. It does not remove or replace the current JSON backup flow.

### 2. Migration API

Added:

```text
app/api/migration/normalized/route.ts
```

This API accepts the current system payload and can:

- Preview how many records can be moved.
- Seed normalized tables after confirming the admin action code.

Actual seed requires the system admin code to reduce the risk of accidental server-side migration.

### 3. System health and migration page

Added:

```text
app/system-health/page.tsx
```

This page is available to the full admin only and shows:

- Supabase configuration status.
- Service role status.
- Snapshot backup table status.
- Normalized table readiness.
- Checkout RPC readiness.
- External ID column readiness.
- Recommended migrations to run.
- Preview and seed actions for the current local dataset.

### 4. External IDs for safe migration

Added migration:

```text
supabase/10_normalized_seed_external_ids.sql
```

This migration adds `external_id` columns to normalized tables so legacy local IDs can be mapped without forcing the old IDs to be valid UUIDs.

Tables covered:

- branches
- profiles
- customers
- products
- invoices
- payments
- work_orders

It also adds:

- `app_migration_runs` table.
- `stock_balances` view.
- `profiles.id` default generation.

## Important notes

This phase still does not make PostgreSQL the single source of truth. It prepares the safe migration path.

Current state:

```text
localStorage / JSON payload = active operation path
Supabase normalized tables = migration target / future source of truth
```

Target state later:

```text
Supabase PostgreSQL = source of truth
IndexedDB = offline cache
JSON export = backup only
```

## Next recommended phase

The next phase should make POS checkout optionally use the server-side transaction API when normalized schema and RPC are ready, while keeping local checkout as a fallback.
