-- Architecture Upgrade Phase 4: external IDs and normalized seed support
-- Run after 08_normalized_core_schema.sql. Safe to run multiple times.

create extension if not exists pgcrypto;

alter table public.branches add column if not exists external_id text;
alter table public.profiles add column if not exists external_id text;
alter table public.customers add column if not exists external_id text;
alter table public.products add column if not exists external_id text;
alter table public.invoices add column if not exists external_id text;
alter table public.payments add column if not exists external_id text;
alter table public.work_orders add column if not exists external_id text;
alter table public.profiles alter column id set default gen_random_uuid();

create unique index if not exists idx_branches_org_external_id on public.branches(organization_id, external_id) where external_id is not null;
create unique index if not exists idx_profiles_org_external_id on public.profiles(organization_id, external_id) where external_id is not null;
create unique index if not exists idx_customers_org_external_id on public.customers(organization_id, external_id) where external_id is not null;
create unique index if not exists idx_products_org_external_id on public.products(organization_id, external_id) where external_id is not null;
create unique index if not exists idx_invoices_org_external_id on public.invoices(organization_id, external_id) where external_id is not null;
create unique index if not exists idx_payments_org_external_id on public.payments(organization_id, external_id) where external_id is not null;
create unique index if not exists idx_work_orders_org_external_id on public.work_orders(organization_id, external_id) where external_id is not null;

create table if not exists public.app_migration_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  label text not null,
  status text not null default 'started',
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_app_migration_runs_org_date on public.app_migration_runs(organization_id, started_at desc);

alter table public.app_migration_runs enable row level security;

create or replace view public.stock_balances as
select
  organization_id,
  branch_id,
  product_id,
  location_id,
  technician_id,
  sum(quantity) as quantity_balance,
  max(created_at) as last_movement_at
from public.stock_movements
where organization_id is not null
group by organization_id, branch_id, product_id, location_id, technician_id;
