# Database Migration Guide

## Overview

The migration from the legacy JSON snapshot model to a normalized PostgreSQL
schema happens in numbered SQL files inside the `supabase/` directory.
Each file is safe to run multiple times (idempotent).

## Migration Files (in order)

| File | Description | Phase |
|------|-------------|-------|
| `01_schema.sql` | Original app_backups table | 1 |
| `02_auth.sql` | Supabase Auth helpers | 1 |
| `03_business_multiuser.sql` | Business / member tables | 2 |
| `06_complete_sync_migration.sql` | Realtime + triggers on app_backups | 3 |
| `07_architecture_upgrade_reminders.sql` | system_reminders table | 4 |
| `08_normalized_core_schema.sql` | Core normalized tables | 4 |
| `09_checkout_transaction_rpc.sql` | Basic checkout RPC | 4 |
| `10_normalized_seed_external_ids.sql` | external_id columns | 4 |
| `11_rls_policies.sql` | RLS + helper functions + permissions seed | 5 |
| `12_audit_triggers.sql` | Database audit triggers | 5 |
| `13_enhanced_checkout_rpc.sql` | Full checkout with stock + commission | 5 |

## How to Run

**Via Supabase Dashboard:**
1. Open https://supabase.com/dashboard → your project
2. Go to **SQL Editor → New Query**
3. Paste contents of each file in order → **Run**

**Via Supabase CLI:**
```bash
supabase db push
```

## In-App Migration Wizard

After running the SQL migrations, use the **System Health** page (`/system-health`) to:

1. Click **فحص الحالة** (Check Status) to verify all tables exist
2. Click **معاينة** (Preview) to see what will be migrated
3. Enter admin code and click **تشغيل الترحيل** (Run Migration)

The migration is idempotent — running it again updates existing records without duplicating them.

## Data Flow After Migration

```
localStorage (app state)
    ↓
store.tsx (React state)
    ↓ every change (800ms debounce)
/api/backup/save
    ↓
app_backups (JSON snapshot) ← emergency restore only
    ↓ /api/migration/normalized
normalized tables (PostgreSQL source of truth)
```

## Rolling Back

The migration **never deletes** localStorage data or app_backups. To roll back:

1. Disable server features via feature flags
2. The app continues using localStorage as before

## External IDs

Every normalized table has an `external_id` column that stores the legacy
localStorage ID (e.g. `cust_1234_abc`). This is how we avoid duplicates on
re-run and how we can trace records back to their legacy origin.
