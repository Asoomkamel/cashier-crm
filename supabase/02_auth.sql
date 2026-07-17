-- =============================================================================
-- Cashier + CRM — Auth + Authentica OTP additions
-- Run this AFTER 01_schema.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. profiles — extends auth.users with phone, name, role
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid references auth.users(id) on delete cascade primary key,
  full_name         text,
  phone             text,
  phone_verified    boolean not null default false,
  phone_verified_at timestamptz,
  avatar_url       text,
  auth_provider     text default 'email'
                      check (auth_provider in ('email', 'google', 'authentica', 'admin_bypass', 'dev_phone_login')),
  role              text not null default 'customer'
                      check (role in ('customer', 'admin', 'cashier', 'technician', 'supervisor')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists profiles_phone_unique_idx
  on public.profiles (phone)
  where phone is not null;

alter table public.profiles enable row level security;

create policy "profiles_self_read"    on public.profiles for select using (auth.uid() = id);
create policy "profiles_self_update"  on public.profiles for update using (auth.uid() = id);
-- Service-role inserts are needed when the server creates a new auth user;
-- we allow that by leaving insert open to service role only (no policy needed
-- because service role bypasses RLS).

-- -----------------------------------------------------------------------------
-- 2. otp_attempts — rate-limit + audit log for WhatsApp OTP sends/verifies
-- -----------------------------------------------------------------------------
create table if not exists public.otp_attempts (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  purpose     text not null
                check (purpose in ('login', 'login_verify', 'admin_bypass', 'admin_bypass_verify')),
  provider    text not null
                check (provider in ('authentica', 'admin_code', 'dev_phone_login')),
  success     boolean not null,
  ip_address  text,
  created_at  timestamptz not null default now()
);

create index if not exists otp_attempts_phone_created_idx
  on public.otp_attempts (phone, created_at desc);

alter table public.otp_attempts enable row level security;
-- No client access; service-role only.

-- -----------------------------------------------------------------------------
-- 3. settings — generic key/value store used for admin OTP bypass flags
-- -----------------------------------------------------------------------------
create table if not exists public.settings (
  key   text primary key,
  value text
);

alter table public.settings enable row level security;
-- Reads via anon are blocked; writes via service role only.

-- -----------------------------------------------------------------------------
-- 4. Auto-create profile on sign-up (for email + Google sign-ups)
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, auth_provider)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(new.raw_user_meta_data ->> 'provider', 'email')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 5. Admin check helper (used by RLS in stricter policies)
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'supervisor')
  );
$$;

-- -----------------------------------------------------------------------------
-- 6. Tighten catalog mutations to admins only
-- -----------------------------------------------------------------------------
drop policy if exists "catalog_items_auth_insert" on public.catalog_items;
drop policy if exists "catalog_items_auth_update" on public.catalog_items;
drop policy if exists "catalog_items_auth_delete" on public.catalog_items;

create policy "catalog_items_admin_insert" on public.catalog_items
  for insert with check (public.is_admin());
create policy "catalog_items_admin_update" on public.catalog_items
  for update using (public.is_admin());
create policy "catalog_items_admin_delete" on public.catalog_items
  for delete using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 7. Auto-update updated_at on profiles
-- -----------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- 8. Seed the admin OTP bypass defaults (disabled until you turn it on)
-- -----------------------------------------------------------------------------
insert into public.settings (key, value) values
  ('admin_otp_bypass_enabled', 'false'),
  ('admin_otp_bypass_phone',   ''),
  ('admin_otp_bypass_code',    '')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 9. Promote yourself to admin (replace the UUID with your own user ID)
-- -----------------------------------------------------------------------------
-- update public.profiles set role = 'admin' where id = 'YOUR-USER-UUID';