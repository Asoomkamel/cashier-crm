-- Cashier CRM — Supabase schema (Phase 5)
-- Run this once in your Supabase project's SQL editor.
-- Multi-tenant model: every business's entire dataset is one JSON blob in
-- `business_data`, keyed by business_id — this mirrors lib/storage.ts's
-- key/value shape 1:1, so the swap-in adapter (see README) is a thin layer.

create extension if not exists "pgcrypto";

-- One row per tenant/business.
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Business',
  created_at timestamptz not null default now()
);

-- Maps an authenticated Supabase user (by phone, via OTP) to a business + role.
create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null,
  role text not null check (role in ('admin','supervisor','technician','pos')),
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

-- The entire app dataset for one business, as a single JSON payload:
-- { customers, catalog, orders, vendors, purchases, expenses, settings,
--   users, urgentOrders, appointments, techInventory, techInventoryLogs,
--   techFinancialLogs, techLocations }
create table if not exists public.business_data (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.business_data enable row level security;

-- A user can read/update their own membership row(s).
create policy "members_self_read" on public.business_members
  for select using (auth.uid() = user_id);

-- A user can read/write business_data only for a business they belong to.
create policy "business_data_member_read" on public.business_data
  for select using (
    exists (
      select 1 from public.business_members m
      where m.business_id = business_data.business_id and m.user_id = auth.uid()
    )
  );

create policy "business_data_member_write" on public.business_data
  for insert with check (
    exists (
      select 1 from public.business_members m
      where m.business_id = business_data.business_id and m.user_id = auth.uid()
    )
  );

create policy "business_data_member_update" on public.business_data
  for update using (
    exists (
      select 1 from public.business_members m
      where m.business_id = business_data.business_id and m.user_id = auth.uid()
    )
  );

-- A user can read the business row they belong to (needed for display name etc).
create policy "businesses_member_read" on public.businesses
  for select using (
    exists (
      select 1 from public.business_members m
      where m.business_id = businesses.id and m.user_id = auth.uid()
    )
  );

-- NOTE: creating a new business + first admin membership, and looking up
-- "does this phone already belong to a business", must happen with the
-- service-role key on the server (see app/api/auth/*), because a brand
-- new user has no membership row yet and RLS would block them from
-- reading/writing anything otherwise.
