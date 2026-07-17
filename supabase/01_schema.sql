-- =============================================================================
-- Cashier + CRM — Core Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- =============================================================================

-- Enable required extensions
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Customers (leads + active customers)
-- -----------------------------------------------------------------------------
create table if not exists public.customers (
  id          text primary key,
  type        text not null default 'lead'
                check (type in ('lead', 'customer')),
  name        text not null default 'بدون اسم',
  phone       text default '',
  notes       text default '',                  -- JSON dump of the full Customer object
  total_purchases numeric(10,2) default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. Catalog items (products + services)
-- -----------------------------------------------------------------------------
create table if not exists public.catalog_items (
  id          text primary key,
  type        text not null default 'product'
                check (type in ('product', 'service')),
  name        text not null default 'بدون اسم',
  sku         text default '',
  barcode     text default '',
  category    text default '',
  price       numeric(10,2) not null default 0,
  cost_price  numeric(10,2) not null default 0,
  stock       int not null default 0,
  description text default '',                  -- JSON dump of the full CatalogItem
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. Orders (tax invoices, quotations, returns, service orders, urgent/fast)
-- -----------------------------------------------------------------------------
create table if not exists public.orders (
  id               text primary key,
  invoice_number   text,
  type             text not null default 'invoice'
                     check (type in ('invoice', 'quote', 'return_invoice', 'service_order')),
  customer_id      text references public.customers(id) on delete set null,
  status           text not null default 'completed'
                     check (status in ('pending', 'processing', 'shipped', 'delivered',
                                       'completed', 'cancelled', 'returned')),
  items            jsonb not null default '[]'::jsonb,
  total_before_tax numeric(12,2) not null default 0,
  total_tax        numeric(12,2) not null default 0,
  total_discount   numeric(12,2) not null default 0,
  grand_total      numeric(12,2) not null default 0,
  payment_method   text default 'cash',
  notes            text default '',             -- JSON dump of the full Order object
  date             timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists orders_customer_id_idx on public.orders (customer_id);
create index if not exists orders_date_idx        on public.orders (date desc);

-- -----------------------------------------------------------------------------
-- 4. Vendors
-- -----------------------------------------------------------------------------
create table if not exists public.vendors (
  id          text primary key,
  name        text not null default 'بدون اسم',
  phone       text default '',
  address     text default '',
  tax_number  text default '',
  notes       text default '',                  -- JSON dump
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 5. Purchase invoices (vendor bills)
-- -----------------------------------------------------------------------------
create table if not exists public.purchase_invoices (
  id               text primary key,
  invoice_number   text,
  vendor_id        text references public.vendors(id) on delete set null,
  items            jsonb not null default '[]'::jsonb,
  total_amount     numeric(12,2) not null default 0,
  paid_amount      numeric(12,2) not null default 0,
  notes            text default '',
  date             timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 6. Expenses
-- -----------------------------------------------------------------------------
create table if not exists public.expenses (
  id         text primary key,
  category   text default 'عام',
  amount     numeric(12,2) not null default 0,
  note       text default '',                   -- JSON dump
  date       timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 7. App settings (single-row-per-user)
-- -----------------------------------------------------------------------------
create table if not exists public.app_settings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade unique,
  company_name text default '',                -- may be JSON dump of AppSettings
  currency    text default 'ر.س',
  tax_rate    numeric(5,2) default 15,
  theme       text default 'dark',
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 8. Legacy user_data fallback (per-user JSON blob) — keep for backward compat
-- -----------------------------------------------------------------------------
create table if not exists public.user_data (
  id      uuid references auth.users(id) on delete cascade primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.customers         enable row level security;
alter table public.catalog_items     enable row level security;
alter table public.orders            enable row level security;
alter table public.vendors           enable row level security;
alter table public.purchase_invoices enable row level security;
alter table public.expenses          enable row level security;
alter table public.app_settings      enable row level security;
alter table public.user_data         enable row level security;

-- Public read (customers can browse the catalog before signing in)
create policy "customers_public_read"        on public.customers         for select using (true);
create policy "catalog_items_public_read"    on public.catalog_items     for select using (true);

-- Authenticated users can read their own data
create policy "orders_auth_read"             on public.orders            for select using (auth.role() = 'authenticated');
create policy "orders_auth_insert"           on public.orders            for insert with check (auth.role() = 'authenticated');
create policy "orders_auth_update"           on public.orders            for update using      (auth.role() = 'authenticated');
create policy "orders_auth_delete"           on public.orders            for delete using      (auth.role() = 'authenticated');

create policy "vendors_auth_read"            on public.vendors           for select using (auth.role() = 'authenticated');
create policy "vendors_auth_insert"          on public.vendors           for insert with check (auth.role() = 'authenticated');
create policy "vendors_auth_update"          on public.vendors           for update using      (auth.role() = 'authenticated');

create policy "purchases_auth_read"          on public.purchase_invoices for select using (auth.role() = 'authenticated');
create policy "purchases_auth_insert"        on public.purchase_invoices for insert with check (auth.role() = 'authenticated');
create policy "purchases_auth_update"        on public.purchase_invoices for update using      (auth.role() = 'authenticated');

create policy "expenses_auth_read"           on public.expenses          for select using (auth.role() = 'authenticated');
create policy "expenses_auth_insert"         on public.expenses          for insert with check (auth.role() = 'authenticated');
create policy "expenses_auth_update"         on public.expenses          for update using      (auth.role() = 'authenticated');

create policy "app_settings_own_read"        on public.app_settings      for select using (auth.uid() = user_id);
create policy "app_settings_own_insert"      on public.app_settings      for insert with check (auth.uid() = user_id);
create policy "app_settings_own_update"      on public.app_settings      for update using (auth.uid() = user_id);

create policy "user_data_own_read"           on public.user_data         for select using (auth.uid() = id);
create policy "user_data_own_insert"         on public.user_data         for insert with check (auth.uid() = id);
create policy "user_data_own_update"         on public.user_data         for update using (auth.uid() = id);

-- Catalog write policies: tighten to admin (set after running 02_auth.sql)
create policy "catalog_items_auth_insert"    on public.catalog_items     for insert with check (auth.role() = 'authenticated');
create policy "catalog_items_auth_update"    on public.catalog_items     for update using      (auth.role() = 'authenticated');
create policy "catalog_items_auth_delete"    on public.catalog_items     for delete using      (auth.role() = 'authenticated');

create policy "customers_auth_insert"        on public.customers         for insert with check (auth.role() = 'authenticated');
create policy "customers_auth_update"        on public.customers         for update using      (auth.role() = 'authenticated');