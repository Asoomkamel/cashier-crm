-- Architecture Upgrade Phase 2: normalized core schema scaffold
-- Safe to run multiple times. This does not replace the current JSON snapshot
-- backup flow; it prepares PostgreSQL to become the future source of truth.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  tax_number text,
  phone text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.profiles (
  id uuid primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  display_name text not null,
  phone text,
  role text not null default 'technician',
  specialties text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role text not null,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role, permission_code)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  name text not null,
  phone text,
  type text not null default 'customer',
  company_name text,
  tax_number text,
  city text,
  district text,
  address text,
  google_maps_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  name text not null,
  item_type text not null default 'product',
  sku text,
  barcode text,
  category text,
  unit text,
  sale_price numeric(14,2) not null default 0,
  cost_price numeric(14,2) not null default 0,
  tax_rate numeric(6,2) not null default 0,
  low_stock_threshold numeric(14,3) not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  unique (organization_id, sku),
  unique (organization_id, barcode)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  invoice_number text not null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  invoice_type text not null default 'tax_invoice',
  payment_method text not null default 'cash',
  paid_amount numeric(14,2) not null default 0,
  remaining_amount numeric(14,2) not null default 0,
  total_before_tax numeric(14,2) not null default 0,
  total_tax numeric(14,2) not null default 0,
  total_discount numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  technician_id uuid references public.profiles(id) on delete set null,
  technician_name text,
  status text not null default 'active',
  idempotency_key text,
  issued_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  unique (organization_id, invoice_number),
  unique (organization_id, idempotency_key)
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  item_name text not null,
  quantity numeric(14,3) not null,
  unit_price numeric(14,2) not null,
  discount numeric(14,2) not null default 0,
  tax_rate numeric(6,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  amount numeric(14,2) not null check (amount >= 0),
  method text not null,
  reference text,
  collected_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  idempotency_key text,
  unique (organization_id, idempotency_key)
);

create table if not exists public.stock_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  location_type text not null default 'main',
  technician_id uuid references public.profiles(id) on delete set null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  product_id uuid not null references public.products(id) on delete restrict,
  location_id uuid references public.stock_locations(id) on delete set null,
  technician_id uuid references public.profiles(id) on delete set null,
  movement_type text not null,
  quantity numeric(14,3) not null,
  unit_cost numeric(14,2) not null default 0,
  tax_rate numeric(6,2) not null default 0,
  reference_type text,
  reference_id uuid,
  reference_number text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  idempotency_key text,
  unique (organization_id, idempotency_key)
);

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  request_number integer,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  customer_phone text,
  issue text,
  status text not null default 'pending',
  required_specialties text[] not null default '{}',
  accepted_by uuid references public.profiles(id) on delete set null,
  scheduled_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  action text not null,
  table_name text,
  record_id text,
  old_value jsonb,
  new_value jsonb,
  details text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.idempotency_keys (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  idempotency_key text not null,
  command_type text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (organization_id, idempotency_key)
);

create index if not exists idx_customers_org_phone on public.customers(organization_id, phone);
create index if not exists idx_products_org_category on public.products(organization_id, category);
create index if not exists idx_invoices_org_date on public.invoices(organization_id, issued_at desc);
create index if not exists idx_stock_movements_org_product on public.stock_movements(organization_id, product_id, created_at desc);
create index if not exists idx_work_orders_org_status on public.work_orders(organization_id, status, scheduled_at);
create index if not exists idx_audit_logs_org_date on public.audit_logs(organization_id, created_at desc);

alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.stock_locations enable row level security;
alter table public.stock_movements enable row level security;
alter table public.work_orders enable row level security;
alter table public.audit_logs enable row level security;

-- Minimal starter policies. Tighten them after Supabase Auth is fully wired.
do $$ begin
  create policy "authenticated can read own-org scaffold" on public.organizations for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- RPC placeholder for future atomic invoice creation.
-- In the next phase, move the invoice + items + payment + stock movements logic here.
create or replace function public.record_audit_log(
  p_organization_id uuid,
  p_action text,
  p_table_name text default null,
  p_record_id text default null,
  p_old_value jsonb default null,
  p_new_value jsonb default null,
  p_details text default null
) returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into public.audit_logs(organization_id, action, table_name, record_id, old_value, new_value, details)
  values (p_organization_id, p_action, p_table_name, p_record_id, p_old_value, p_new_value, p_details)
  returning id into v_id;
  return v_id;
end;
$$;
