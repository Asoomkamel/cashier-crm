# Supabase Auth + RLS Guide

## Current State

The app uses **local PIN login** (phone + 4-digit PIN stored in localStorage).
Supabase Auth is prepared but not yet enforced.

## Transition Plan

### Step 1 — SQL Setup (already in Phase 5)

Run `supabase/11_rls_policies.sql`. This:
- Creates helper functions: `current_profile()`, `current_organization_id()`,
  `current_role()`, `has_permission(key)`
- Seeds the permissions table with all permission codes
- Seeds role_permissions for admin/supervisor/technician/accountant/pos/viewer
- Enables RLS on all normalized tables

### Step 2 — Profiles Table

After migration, the `profiles` table must have one row per staff user.
The `external_id` column links it to the legacy `StaffUser.id`.

The normalized seed (`/api/migration/normalized`) creates these automatically.

### Step 3 — Enable Supabase Auth

In your `.env.local`:
```env
NEXT_PUBLIC_USE_SUPABASE_AUTH=true
```

Then in the Supabase dashboard:
- Enable **Phone OTP** or **Email OTP** provider
- Configure Authentica as a custom SMS provider (already set up)

### Step 4 — Auth Flow

```
User enters phone
  → /api/auth/phone/send-otp (Authentica)
  → User enters OTP
  → /api/auth/phone/verify-otp
  → Creates Supabase Auth session (JWT)
  → JWT stored in supabase.auth.getSession()
  → profile row linked via auth.uid()
  → RLS uses auth.uid() to scope all queries
```

### Step 5 — RLS Functions

The helper functions work like this:

```sql
-- In any RLS policy:
select * from public.invoices
where organization_id = public.current_organization_id()
  and public.has_permission('invoices.create');
```

These functions read from `public.profiles` using `auth.uid()`.

### Security Notes

- Never put `SUPABASE_SERVICE_ROLE_KEY` in `NEXT_PUBLIC_*` variables
- Service role bypasses RLS — use it only in server-side API routes
- Client code uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` which respects RLS
- All sensitive operations must go through server-side API routes or RPCs

## Fallback During Transition

While `NEXT_PUBLIC_USE_SUPABASE_AUTH=false`:
- Local PIN login works as before
- Supabase tables use service role (no RLS enforcement from client)
- The `/api/transactions/checkout/route.ts` uses service role key

Once `true`:
- Login creates a Supabase session
- Client queries respect RLS automatically
- Local PIN remains as emergency fallback

## Permission Codes Reference

| Code | Description |
|------|-------------|
| `pos.access` | Access POS screen |
| `invoices.create` | Create invoices |
| `invoices.print` | Print invoices |
| `invoices.send_whatsapp` | Send via WhatsApp |
| `customers.view` | View customer list |
| `customers.manage` | Edit / delete customers |
| `inventory.view` | View product stock |
| `inventory.manage` | Edit stock, prices |
| `technician_inventory.view` | View tech stock |
| `technician_inventory.manage` | Assign / adjust tech stock |
| `work_orders.view_all` | See all work orders |
| `work_orders.view_assigned` | See own tasks only |
| `work_orders.update_status` | Change task status |
| `reports.view` | Access reports |
| `settings.manage` | Change system settings |
| `audit.view` | View audit log |
| `reminders.manage` | Create / complete reminders |
| `expenses.view` | View expenses |
| `expenses.manage` | Create / edit expenses |
| `purchases.view` | View purchase invoices |
| `purchases.manage` | Create purchase invoices |
| `users.manage` | Manage staff users |
