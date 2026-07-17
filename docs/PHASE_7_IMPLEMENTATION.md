# Architecture Phase 7 — Security, Server Checkout Fix, Reports API

## What Was Implemented

### 1. Server Checkout — Fixed Calculations
**File:** `app/pos/page.tsx`

Previously the server checkout was sending `grandTotal: 0`, `totalBeforeTax: 0`, `totalTax: 0`.
Now it correctly calculates:
- `totalTax` — sum of all item tax amounts
- `totalBeforeTax` — subtotal minus tax minus cart discount
- `totalDiscount` — cart discount + item discounts
- `grandTotal` — correct total
- `paidAmount` — actual paid amount (not same as grandTotal)
- `remainingAmount` — grandTotal - paidAmount
- `lineTotal` per item
- `unitCost` per item (for stock value tracking)

### 2. API Security Guards
**File:** `lib/modules/security/serverGuards.ts`

New centralized security module with:
- `requireServerActionSecret(req)` — validates `SERVER_ACTION_SECRET` header
- `requireAdminActionCode(req)` — validates `ADMIN_ACTION_CODE` from request body
- `canViewSensitiveHealth(req)` — controls what health info is exposed
- `getRequestActor(req)` — extracts actor info from headers
- `guardError()` / `guardResponse()` — consistent error responses

**Protected Routes:**
- `POST /api/backup/save` — requires SERVER_ACTION_SECRET
- `POST /api/migration/normalized` — requires SERVER_ACTION_SECRET OR ADMIN_ACTION_CODE
- `GET /api/system/health` — sensitive data hidden from untrusted callers

### 3. System Health Page — Dynamic Data
**File:** `app/system-health/page.tsx`

All hardcoded numbers removed. Now shows:
- Live local data counts from React store
- Supabase table status from health API
- Feature flag status from health API (env vars)
- Migration wizard (Preview + Run)
- Mutation queue status

### 4. Server Reports APIs
**Files:** `app/api/reports/[sales|inventory|technicians|customers|expenses]/route.ts`

New server-side report endpoints that:
- Return `mode: "server"` when reading from PostgreSQL
- Return `mode: "local"` with a message when not configured
- Support filters: `date_from`, `date_to`, `branch_id`, `technician_id`, `customer_id`, `payment_method`
- Protected by SERVER_ACTION_SECRET

### 5. NormalizedCheckoutItem — Extended
**File:** `lib/modules/database/normalizedCheckout.ts`

Added fields: `catalogId`, `unitCost`, `lineTotal`

---

## Environment Variables (Phase 7)

```env
# Required for API security in production
SERVER_ACTION_SECRET=<random 32+ char string>
ADMIN_ACTION_CODE=<admin code for UI operations>

# Set after running migration
NEXT_PUBLIC_ORG_ID=3a5da4d0-9f82-472d-83ba-426652cb9e75
NEXT_PUBLIC_BRANCH_ID=fcc99cb9-7110-493d-8255-182463d76b97

# Feature flags (default: false)
NEXT_PUBLIC_USE_SERVER_CHECKOUT=false
NEXT_PUBLIC_USE_SUPABASE_AUTH=false
```

## How to Test Server Checkout

1. Set `NEXT_PUBLIC_USE_SERVER_CHECKOUT=true` in `.env.local`
2. Set `NEXT_PUBLIC_ORG_ID` and `NEXT_PUBLIC_BRANCH_ID`
3. Ensure `SUPABASE_SERVICE_ROLE_KEY` is set
4. Open POS → add items → checkout
5. Invoice is created via `create_checkout_transaction` RPC
6. If it fails → clear error shown, no local invoice created

## How to Test Server Reports

```bash
curl -H "x-action-secret: <SERVER_ACTION_SECRET>" \
  http://localhost:3000/api/reports/sales?date_from=2025-01-01
```

---

## What Remains (Phase 8)

- [ ] Supabase Auth OTP replacing local PIN login
- [ ] Reports page UI switch between local/server mode
- [ ] IndexedDB as primary cache (localStorage for settings only)
- [ ] Sync Worker retry UI in Shell (failed mutations list)
- [ ] Full RLS testing with authenticated users
- [ ] Automated test suite (vitest)
