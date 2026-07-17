-- =============================================================================
-- Cashier + CRM — Shared business accounts + real staff roles
-- Run this AFTER 01_schema.sql and 02_auth.sql
--
-- Problem this fixes:
-- Previously every phone number that verified a WhatsApp OTP became an
-- isolated "business of one" and was always granted role = admin on the
-- client, regardless of what role was configured for them. Staff could not
-- share one business's data, and the Users/roles screen had no real effect.
--
-- This migration adds a real business + membership model:
--   - businesses: one row per shop/tenant.
--   - business_members: phone -> business_id + role, added by an admin.
--     A phone logging in for the first time with no existing membership
--     becomes the admin/owner of a brand-new business. A phone that an
--     admin has already added to business_members joins that business with
--     the assigned role instead.
--   - business_data: the shared JSON payload for a business (replaces the
--     old one-blob-per-individual-user model in `user_data`).
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. businesses
-- -----------------------------------------------------------------------------
create table if not exists public.businesses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'عملي',
  owner_id    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.businesses enable row level security;

-- A user can read a business only if they are a member of it (see policy
-- below, defined after business_members exists).

-- -----------------------------------------------------------------------------
-- 2. business_members — phone -> business_id + role
-- -----------------------------------------------------------------------------
create table if not exists public.business_members (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  phone       text not null,
  full_name   text,
  role        text not null default 'technician'
                check (role in ('admin', 'supervisor', 'technician', 'pos')),
  permissions jsonb not null default '{}'::jsonb,
  specializations      text[] default '{}',
  assigned_products    text[] default '{}',
  inventory_categories text[] default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists business_members_business_phone_idx
  on public.business_members (business_id, phone);

create index if not exists business_members_phone_idx on public.business_members (phone);
create index if not exists business_members_user_id_idx on public.business_members (user_id);

alter table public.business_members enable row level security;

create or replace function public.current_business_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select business_id from public.business_members where user_id = auth.uid();
$$;

create or replace function public.is_business_admin(target_business_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.business_members
    where business_id = target_business_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

create policy "businesses_member_read" on public.businesses
  for select using (id in (select public.current_business_ids()));

create policy "business_members_own_business_read" on public.business_members
  for select using (business_id in (select public.current_business_ids()));

-- Inserts/updates/deletes on business_members are performed by the server
-- (service role) after verifying the caller is an admin of the business —
-- see app/api/business/members/route.ts. No client-side write policies are
-- defined, so authenticated clients cannot self-assign roles directly.

-- -----------------------------------------------------------------------------
-- 3. business_data — one shared JSON payload per business
-- -----------------------------------------------------------------------------
create table if not exists public.business_data (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  payload     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.business_data enable row level security;

create policy "business_data_member_read" on public.business_data
  for select using (business_id in (select public.current_business_ids()));

-- Writes go through /api/cloud/save using the service role, after verifying
-- the caller is a member of that business_id — see that route for the check.

create or replace function public.tg_set_updated_at_business()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists business_data_set_updated_at on public.business_data;
create trigger business_data_set_updated_at
  before update on public.business_data
  for each row execute procedure public.tg_set_updated_at_business();

drop trigger if exists businesses_set_updated_at on public.businesses;
create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute procedure public.tg_set_updated_at_business();

drop trigger if exists business_members_set_updated_at on public.business_members;
create trigger business_members_set_updated_at
  before update on public.business_members
  for each row execute procedure public.tg_set_updated_at_business();

-- -----------------------------------------------------------------------------
-- 4. One-time migration of existing per-user blobs into business_data
--    (safe to run even if user_data is empty; only touches existing rows)
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  new_business_id uuid;
begin
  for r in select * from public.user_data loop
    -- Skip if this user already owns/belongs to a business.
    if exists (select 1 from public.business_members where user_id = r.id) then
      continue;
    end if;

    insert into public.businesses (name, owner_id) values ('عملي', r.id)
    returning id into new_business_id;

    insert into public.business_members (business_id, user_id, phone, role, permissions)
    select new_business_id, r.id, coalesce(u.phone, u.email, r.id::text), 'admin',
           jsonb_build_object('isFullAdmin', true, 'canLogin', true)
    from auth.users u where u.id = r.id;

    insert into public.business_data (business_id, payload, updated_at)
    values (new_business_id, r.payload, r.updated_at)
    on conflict (business_id) do nothing;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Close the dormant, overly-open policies from 01_schema.sql
-- -----------------------------------------------------------------------------
-- The app does not currently read/write customers, catalog_items, orders,
-- vendors, purchase_invoices or expenses directly (everything goes through
-- business_data as one JSON payload). But those tables were left world- or
-- any-authenticated-user readable/writable, which is a live landmine for
-- anyone who starts using them later. Revoke that open access now; scope
-- them to business_id if/when they're actually wired up to the app.
drop policy if exists "customers_public_read"     on public.customers;
drop policy if exists "customers_auth_insert"     on public.customers;
drop policy if exists "customers_auth_update"     on public.customers;
drop policy if exists "catalog_items_public_read" on public.catalog_items;
drop policy if exists "orders_auth_read"          on public.orders;
drop policy if exists "orders_auth_insert"        on public.orders;
drop policy if exists "orders_auth_update"        on public.orders;
drop policy if exists "orders_auth_delete"        on public.orders;
drop policy if exists "vendors_auth_read"         on public.vendors;
drop policy if exists "vendors_auth_insert"       on public.vendors;
drop policy if exists "vendors_auth_update"       on public.vendors;
drop policy if exists "purchases_auth_read"       on public.purchase_invoices;
drop policy if exists "purchases_auth_insert"     on public.purchase_invoices;
drop policy if exists "purchases_auth_update"     on public.purchase_invoices;
drop policy if exists "expenses_auth_read"        on public.expenses;
drop policy if exists "expenses_auth_insert"      on public.expenses;
drop policy if exists "expenses_auth_update"      on public.expenses;

-- -----------------------------------------------------------------------------
-- 6. Notes
-- -----------------------------------------------------------------------------
-- To add a staff member to an existing business by hand (e.g. before they've
-- ever logged in), insert directly:
--
--   insert into public.business_members (business_id, phone, full_name, role)
--   values ('YOUR-BUSINESS-UUID', '+9665XXXXXXXX', 'اسم الموظف', 'technician');
--
-- The first time that phone number verifies a WhatsApp OTP, the server links
-- business_members.user_id to their new auth.users id automatically.
