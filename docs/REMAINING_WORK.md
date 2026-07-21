# Remaining Work — Cashier CRM

## Completed Phases

- [x] Phase 1–4: Local-first, Realtime, Modules, Schema
- [x] Phase 5: RLS, Permissions, Checkout RPC, Audit Triggers
- [x] Phase 6: Full data migration (customers, products, invoices, work_orders, staff)
- [x] Phase 7: Server Checkout fix, API security, system health, reports API
- [x] Phase 8: IndexedDB cache layer, Reports server mode, Auth OTP bridge, 78 tests
- [x] Phase 9: IDB integrated into store, multi-branch selector, Service Worker, work orders sync, 96 tests

## Remaining Work

### High Priority

- [ ] **Supabase Auth OTP** — full activation
  - Activate: `NEXT_PUBLIC_USE_SUPABASE_AUTH=true`
  - Configure Authentica: `AUTHENTICA_API_KEY=<key>`
  - See: `docs/SUPABASE_AUTH_RLS_GUIDE.md`

- [ ] **Reports UI** — render server data in actual report tables
  - Currently shows JSON summary when server mode is active
  - Need to wire `serverData.invoices` into the existing report tables

- [ ] **Work Orders page** — server/local toggle
  - API at `GET /api/work-orders/sync` is ready
  - Need toggle in `/urgent-orders` and `/appointments` pages

### Medium Priority

- [ ] **Purchases migration** to PostgreSQL
  - Table exists, data not yet migrated

- [ ] **Stock movements ledger UI**
  - `stockService.ts` records movements locally
  - Need `/inventory/movements` page showing ledger

- [ ] **Customer debts** reading from `customer_balances` PostgreSQL view
  - View exists in Supabase
  - Need server mode in `/crm` page

### Low Priority

- [ ] **Service Worker offline sync** — queue replaying cached mutations when back online
- [ ] **Multi-tenant onboarding** — create new org/branch from UI
- [ ] **Automated CI/CD** — GitHub Actions running `npm test && npm run build`

## Key Environment Variables

```env
# Core Supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

# Organization (set after migration)
NEXT_PUBLIC_ORG_ID=3a5da4d0-9f82-472d-83ba-426652cb9e75
NEXT_PUBLIC_BRANCH_ID=fcc99cb9-7110-493d-8255-182463d76b97

# Security
SERVER_ACTION_SECRET=<random_32+_chars>
ADMIN_ACTION_CODE=<admin_code>

# Feature flags (all false by default)
NEXT_PUBLIC_USE_SERVER_CHECKOUT=false  # flip when RPC tested
NEXT_PUBLIC_USE_SUPABASE_AUTH=false    # flip when OTP configured
NEXT_PUBLIC_USE_IDB_CACHE=false        # flip after IDB migration
```

## Migration Status (Phase 9)

| Table | Rows | Status |
|---|---|---|
| organizations | 1 | ✅ |
| branches | 1 | ✅ |
| customers | 73 | ✅ |
| products | 32 | ✅ |
| invoices | 51 | ✅ |
| invoice_items | 57 | ✅ |
| work_orders | 47 | ✅ |
| staff_profiles | 3 | ✅ |
| expenses | 5 | ✅ Phase 9 |
| reminders | 1 | ✅ Phase 9 |


## Remaining Work

### High Priority

- [ ] **Supabase Auth OTP** — replace local PIN login
  - File: `components/LoginScreen.tsx`
  - Activate: `NEXT_PUBLIC_USE_SUPABASE_AUTH=true`
  - See: `docs/SUPABASE_AUTH_RLS_GUIDE.md`

- [ ] **Reports UI — Server Mode toggle**
  - File: `app/reports/page.tsx`
  - Show toggle: Local Data vs Server Data
  - Connect to `/api/reports/*` endpoints

- [ ] **Sync Worker retry UI**
  - File: `components/Shell.tsx`
  - Show failed mutations list
  - Add "Retry" button per mutation

### Medium Priority

- [ ] **IndexedDB as primary cache**
  - Move all data reads from localStorage → IndexedDB
  - localStorage remains for settings only (language, theme)
  - File: `lib/modules/offline/indexedDbQueue.ts`

- [ ] **RLS full testing**
  - Enable NEXT_PUBLIC_USE_SUPABASE_AUTH
  - Test each role: admin, supervisor, technician, accountant, viewer
  - Verify each table's policy

- [ ] **Work orders in PostgreSQL**
  - Currently work_orders table exists but doesn't sync in real-time
  - Connect urgent orders / appointments create/update to PostgreSQL

### Low Priority

- [ ] **Automated test suite**
  - `npm install --save-dev vitest @testing-library/react`
  - Start with: `__tests__/invoices/calculations.test.ts`
  - See: `docs/TEST_PLAN.md`

- [ ] **Service Worker** for true offline PWA
  - Currently: localStorage + IndexedDB queue
  - Future: Service Worker intercepts fetch, serves from cache

- [ ] **Multi-branch support**
  - Branches table exists, branch_id on all tables
  - Branch selector in Shell
  - RLS already filters by branch for supervisor role

## Migration Status (as of Phase 6)

| Table | Rows | Source |
|---|---|---|
| organizations | 1 | Created |
| branches | 1 | Created |
| customers | 73 | Migrated |
| products | 32 | Migrated |
| invoices | 51 | Migrated |
| invoice_items | 57 | Migrated |
| work_orders | 47 | Migrated |
| staff_profiles | 3 | Migrated |

## Key Variables

```env
NEXT_PUBLIC_ORG_ID=3a5da4d0-9f82-472d-83ba-426652cb9e75
NEXT_PUBLIC_BRANCH_ID=fcc99cb9-7110-493d-8255-182463d76b97
SERVER_ACTION_SECRET=<set this>
ADMIN_ACTION_CODE=<set this>
NEXT_PUBLIC_USE_SERVER_CHECKOUT=false  # flip to true when ready
NEXT_PUBLIC_USE_SUPABASE_AUTH=false    # flip when OTP is configured
```
