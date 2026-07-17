# Test Plan — Cashier CRM Phase 6+

## Status: TODO — Manual test plan (automated tests planned for Phase 7)

This file defines the test scenarios for all critical operations.
Each scenario should be verified manually before each production deployment.

---

## 1. Invoice Calculations

| Test | Expected |
|---|---|
| Item price 100 + tax 15% | grandTotal = 115 |
| Item 100 + discount 10 + tax 15% | totalBeforeTax = 90, tax = 13.50, total = 103.50 |
| Cart discount 20 on total 200 | grandTotal = 180 |
| Tabby fee 5% on 100 | fee = 5, total = 105 |
| Tamara fee 6% on 200 | fee = 12, total = 212 |

## 2. Commission Calculations

| Test | Expected |
|---|---|
| Completion commission 5% on 1000 | technicianCommission = 50 |
| Marketing commission 25% on 200 referral | marketingCommission = 50 |
| Fixed commission 30 SAR | technicianCommission = 30 |
| Full profit: cost 60, price 100 | technicianCommission = 40 |
| No technician assigned | commission = 0 |

## 3. Stock Deduction

| Test | Expected |
|---|---|
| Main stock 10, sell 3 | remaining = 7 |
| Tech stock 5, sell 5 | remaining = 0 |
| Tech stock 2, sell 3 (no fallback) | Error: insufficient stock |
| Tech stock 2, sell 3 (with fallback enabled) | Deducts 2 from tech + 1 from main |
| Product not in stock | Block checkout with clear message |

## 4. Idempotency

| Test | Expected |
|---|---|
| Submit same idempotency_key twice | Second call returns same response, no duplicate invoice |
| Server returns 200 on replay | `replayed: true` in response |
| Local: same invoice number | Should not happen (nextInvoiceNumber increments) |

## 5. Technician Inventory

| Test | Expected |
|---|---|
| Assign 10 units to tech | tech inventory shows 10 |
| Transfer 3 from tech A to tech B | A: -3, B: +3, 2 logs created |
| Deduct 5 from tech with 3 available | Error returned, no deduction |
| Adjustment to 0 | qty = 0, log recorded |

## 6. Import/Export

| Test | Expected |
|---|---|
| Export JSON and re-import | All data matches |
| Import old-format JSON (crm_ keys) | Data normalized correctly |
| Import Excel Arabic headers | Data imported correctly |
| Import with duplicate phone | No duplicate customer created |
| Import with missing fields | Safe defaults applied |

## 7. Permissions

| Test | Role: technician | Expected |
|---|---|---|
| Access /settings | Should redirect or show empty | ✅ |
| Access /reports | Should redirect or show limited | ✅ |
| See WhatsApp technician button | Should NOT see it | ✅ |
| Update own task status | Should succeed | ✅ |
| Delete a customer | Should be blocked | ✅ |

| Test | Role: supervisor | Expected |
|---|---|---|
| Manage users | Blocked | ✅ |
| View reports | Allowed | ✅ |
| Change commission rates | Blocked | ✅ |
| Create invoices | Allowed | ✅ |

## 8. Factory Reset

| Test | Expected |
|---|---|
| Wrong admin code | Error message, no reset |
| Correct code + wrong phrase | Error, no reset |
| Correct code + "حذف" phrase | All data cleared, Supabase cleared |
| After reset, app opens fresh | Empty state, no stale data |

## 9. Audit Log

| Action | Logged? |
|---|---|
| Create invoice | ✅ |
| Factory reset | ✅ |
| Import JSON | ✅ |
| Import Excel | ✅ |
| Export data | ✅ |
| Update settings | ✅ |
| Add product | ✅ |
| Change product price | ✅ |
| Delete product | ✅ |
| Print invoice | TODO |
| Send WhatsApp invoice | TODO |
| Assign tech inventory | TODO |
| Transfer tech inventory | TODO |
| Change user permissions | TODO |

## 10. RLS (requires Supabase Auth enabled)

| Test | Expected |
|---|---|
| Technician reads invoices — own only | Returns only own invoices |
| Technician reads customers | Blocked (no customers.view permission) |
| Admin reads all invoices | Returns all for org |
| Cross-org read | Returns empty (org scoped) |
| Insert without auth | Blocked by RLS |

## 11. Offline / Sync

| Test | Expected |
|---|---|
| Create invoice offline | Added to mutation queue (pending) |
| Come back online | Queue replays, invoice synced |
| Duplicate replay | idempotency_key prevents duplicate |
| Failed mutation after 5 attempts | Shows as "failed" in UI |
| IndexedDB queue survives refresh | Pending mutations still present |

---

## Running Tests

Currently manual only. To add automated tests:

```bash
npm install --save-dev vitest @testing-library/react
```

Then create `__tests__/` directory with:
- `__tests__/invoices/calculations.test.ts`
- `__tests__/inventory/stockService.test.ts`
- `__tests__/technicianInventory/service.test.ts`
- `__tests__/permissions/permissions.test.ts`
- `__tests__/backup/import.test.ts`

See `docs/ARCHITECTURE_PHASE_5.md` for module structure to test against.
