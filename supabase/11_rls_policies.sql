-- ============================================================================
-- Migration 11: Row Level Security — Phase 5
--
-- Applies RLS to all normalized tables.
-- Requires supabase/08_normalized_core_schema.sql to have run first.
--
-- Security model:
--   admin       → full access to their organization
--   supervisor  → full access within their branch
--   technician  → own tasks, own inventory, own financial logs
--   accountant  → read invoices, payments, expenses, reports
--   viewer      → read-only within org scope
--
-- Helper functions:
--   current_profile()           → profiles row for the authenticated user
--   current_organization_id()   → organization UUID from the profile
--   current_branch_id()         → branch UUID from the profile
--   current_role()              → role text from the profile
--   has_permission(key)         → boolean from role_permissions
-- ============================================================================

-- Enable pgcrypto (idempotent)
create extension if not exists pgcrypto;

-- ============================================================================
-- Helper functions
-- ============================================================================

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.current_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select branch_id from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role = p.role
    where p.id = auth.uid()
      and rp.permission_code = permission_key
  );
$$;

create or replace function public.is_admin_or_supervisor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('admin', 'supervisor')
     from public.profiles
     where id = auth.uid()
     limit 1),
    false
  );
$$;

-- Revoke direct access from anon/authenticated — only service role bypasses RLS
revoke execute on function public.current_profile()          from anon;
revoke execute on function public.current_organization_id()  from anon;
revoke execute on function public.current_branch_id()        from anon;
revoke execute on function public.current_role()             from anon;
revoke execute on function public.has_permission(text)       from anon;
revoke execute on function public.is_admin_or_supervisor()   from anon;

-- ============================================================================
-- Seed default permissions (idempotent)
-- ============================================================================

insert into public.permissions (code, label) values
  ('pos.access',                        'Access POS'),
  ('invoices.create',                   'Create invoices'),
  ('invoices.print',                    'Print invoices'),
  ('invoices.send_whatsapp',            'Send invoice via WhatsApp'),
  ('customers.view',                    'View customers'),
  ('customers.manage',                  'Manage customers'),
  ('inventory.view',                    'View inventory'),
  ('inventory.manage',                  'Manage inventory'),
  ('technician_inventory.view',         'View technician inventory'),
  ('technician_inventory.manage',       'Manage technician inventory'),
  ('work_orders.view_all',              'View all work orders'),
  ('work_orders.view_assigned',         'View assigned work orders'),
  ('work_orders.update_status',         'Update work order status'),
  ('reports.view',                      'View reports'),
  ('settings.manage',                   'Manage settings'),
  ('audit.view',                        'View audit log'),
  ('reminders.manage',                  'Manage reminders'),
  ('expenses.view',                     'View expenses'),
  ('expenses.manage',                   'Manage expenses'),
  ('purchases.view',                    'View purchases'),
  ('purchases.manage',                  'Manage purchases'),
  ('users.manage',                      'Manage users')
on conflict (code) do nothing;

-- Default role permissions
insert into public.role_permissions (role, permission_code) values
  -- admin: all
  ('admin', 'pos.access'), ('admin', 'invoices.create'), ('admin', 'invoices.print'),
  ('admin', 'invoices.send_whatsapp'), ('admin', 'customers.view'), ('admin', 'customers.manage'),
  ('admin', 'inventory.view'), ('admin', 'inventory.manage'),
  ('admin', 'technician_inventory.view'), ('admin', 'technician_inventory.manage'),
  ('admin', 'work_orders.view_all'), ('admin', 'work_orders.view_assigned'),
  ('admin', 'work_orders.update_status'), ('admin', 'reports.view'),
  ('admin', 'settings.manage'), ('admin', 'audit.view'), ('admin', 'reminders.manage'),
  ('admin', 'expenses.view'), ('admin', 'expenses.manage'),
  ('admin', 'purchases.view'), ('admin', 'purchases.manage'), ('admin', 'users.manage'),

  -- supervisor: most except settings/users management
  ('supervisor', 'pos.access'), ('supervisor', 'invoices.create'), ('supervisor', 'invoices.print'),
  ('supervisor', 'invoices.send_whatsapp'), ('supervisor', 'customers.view'),
  ('supervisor', 'customers.manage'), ('supervisor', 'inventory.view'),
  ('supervisor', 'inventory.manage'), ('supervisor', 'technician_inventory.view'),
  ('supervisor', 'technician_inventory.manage'), ('supervisor', 'work_orders.view_all'),
  ('supervisor', 'work_orders.view_assigned'), ('supervisor', 'work_orders.update_status'),
  ('supervisor', 'reports.view'), ('supervisor', 'audit.view'),
  ('supervisor', 'reminders.manage'), ('supervisor', 'expenses.view'),
  ('supervisor', 'purchases.view'),

  -- technician: own tasks + inventory + location update
  ('technician', 'work_orders.view_assigned'), ('technician', 'work_orders.update_status'),
  ('technician', 'technician_inventory.view'),

  -- accountant: financial read + reports
  ('accountant', 'invoices.print'), ('accountant', 'customers.view'),
  ('accountant', 'reports.view'), ('accountant', 'expenses.view'),
  ('accountant', 'purchases.view'),

  -- pos: POS access and invoice creation
  ('pos', 'pos.access'), ('pos', 'invoices.create'), ('pos', 'invoices.print'),
  ('pos', 'customers.view'),

  -- viewer: read-only
  ('viewer', 'customers.view'), ('viewer', 'inventory.view'),
  ('viewer', 'technician_inventory.view'), ('viewer', 'work_orders.view_all'),
  ('viewer', 'reports.view')
on conflict (role, permission_code) do nothing;

-- ============================================================================
-- RLS: organizations
-- ============================================================================

alter table public.organizations enable row level security;

drop policy if exists "org_own_select" on public.organizations;
create policy "org_own_select" on public.organizations
  for select using (id = public.current_organization_id());

drop policy if exists "org_admin_all" on public.organizations;
create policy "org_admin_all" on public.organizations
  for all using (
    id = public.current_organization_id()
    and public.current_role() = 'admin'
  );

-- ============================================================================
-- RLS: branches
-- ============================================================================

alter table public.branches enable row level security;

drop policy if exists "branches_org_select" on public.branches;
create policy "branches_org_select" on public.branches
  for select using (organization_id = public.current_organization_id());

drop policy if exists "branches_admin_write" on public.branches;
create policy "branches_admin_write" on public.branches
  for all using (
    organization_id = public.current_organization_id()
    and public.current_role() in ('admin', 'supervisor')
  );

-- ============================================================================
-- RLS: profiles
-- ============================================================================

alter table public.profiles enable row level security;

drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read" on public.profiles
  for select using (
    id = auth.uid()
    or organization_id = public.current_organization_id()
  );

drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_admin_write" on public.profiles
  for all using (
    organization_id = public.current_organization_id()
    and public.current_role() = 'admin'
  );

-- ============================================================================
-- RLS: customers
-- ============================================================================

alter table public.customers enable row level security;

drop policy if exists "customers_org_read" on public.customers;
create policy "customers_org_read" on public.customers
  for select using (
    organization_id = public.current_organization_id()
    and public.has_permission('customers.view')
  );

drop policy if exists "customers_org_write" on public.customers;
create policy "customers_org_write" on public.customers
  for all using (
    organization_id = public.current_organization_id()
    and public.has_permission('customers.manage')
  );

-- ============================================================================
-- RLS: products
-- ============================================================================

alter table public.products enable row level security;

drop policy if exists "products_org_read" on public.products;
create policy "products_org_read" on public.products
  for select using (
    organization_id = public.current_organization_id()
    and public.has_permission('inventory.view')
  );

drop policy if exists "products_org_write" on public.products;
create policy "products_org_write" on public.products
  for all using (
    organization_id = public.current_organization_id()
    and public.has_permission('inventory.manage')
  );

-- ============================================================================
-- RLS: invoices
-- ============================================================================

alter table public.invoices enable row level security;

drop policy if exists "invoices_org_read" on public.invoices;
create policy "invoices_org_read" on public.invoices
  for select using (
    organization_id = public.current_organization_id()
    and (
      public.has_permission('invoices.create')
      or public.has_permission('invoices.print')
      or public.has_permission('reports.view')
      -- technician sees only their own invoices
      or (public.current_role() = 'technician'
          and technician_id = auth.uid())
    )
  );

drop policy if exists "invoices_org_write" on public.invoices;
create policy "invoices_org_write" on public.invoices
  for all using (
    organization_id = public.current_organization_id()
    and public.has_permission('invoices.create')
  );

-- ============================================================================
-- RLS: invoice_items
-- ============================================================================

alter table public.invoice_items enable row level security;

drop policy if exists "invoice_items_read" on public.invoice_items;
create policy "invoice_items_read" on public.invoice_items
  for select using (
    organization_id = public.current_organization_id()
    and public.has_permission('invoices.print')
  );

drop policy if exists "invoice_items_write" on public.invoice_items;
create policy "invoice_items_write" on public.invoice_items
  for all using (
    organization_id = public.current_organization_id()
    and public.has_permission('invoices.create')
  );

-- ============================================================================
-- RLS: payments
-- ============================================================================

alter table public.payments enable row level security;

drop policy if exists "payments_org_read" on public.payments;
create policy "payments_org_read" on public.payments
  for select using (
    organization_id = public.current_organization_id()
    and (public.has_permission('invoices.create') or public.has_permission('reports.view'))
  );

drop policy if exists "payments_org_write" on public.payments;
create policy "payments_org_write" on public.payments
  for all using (
    organization_id = public.current_organization_id()
    and public.has_permission('invoices.create')
  );

-- ============================================================================
-- RLS: stock_movements
-- ============================================================================

alter table public.stock_movements enable row level security;

drop policy if exists "stock_read" on public.stock_movements;
create policy "stock_read" on public.stock_movements
  for select using (
    organization_id = public.current_organization_id()
    and (
      public.has_permission('inventory.view')
      or (public.current_role() = 'technician'
          and technician_id = auth.uid())
    )
  );

drop policy if exists "stock_write" on public.stock_movements;
create policy "stock_write" on public.stock_movements
  for all using (
    organization_id = public.current_organization_id()
    and public.has_permission('inventory.manage')
  );

-- ============================================================================
-- RLS: work_orders
-- ============================================================================

alter table public.work_orders enable row level security;

drop policy if exists "work_orders_read" on public.work_orders;
create policy "work_orders_read" on public.work_orders
  for select using (
    organization_id = public.current_organization_id()
    and (
      public.has_permission('work_orders.view_all')
      or (
        public.has_permission('work_orders.view_assigned')
        and (
          assigned_technician_id = auth.uid()
          or accepted_by_technician_id = auth.uid()
        )
      )
    )
  );

drop policy if exists "work_orders_write" on public.work_orders;
create policy "work_orders_write" on public.work_orders
  for all using (
    organization_id = public.current_organization_id()
    and (
      public.is_admin_or_supervisor()
      or (
        public.has_permission('work_orders.update_status')
        and (
          assigned_technician_id = auth.uid()
          or accepted_by_technician_id = auth.uid()
        )
      )
    )
  );

-- ============================================================================
-- RLS: audit_logs
-- ============================================================================

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_read" on public.audit_logs;
create policy "audit_logs_read" on public.audit_logs
  for select using (
    organization_id = public.current_organization_id()
    and public.has_permission('audit.view')
  );

drop policy if exists "audit_logs_insert" on public.audit_logs;
create policy "audit_logs_insert" on public.audit_logs
  for insert with check (
    organization_id = public.current_organization_id()
  );

-- ============================================================================
-- RLS: idempotency_keys (service role only — no user access)
-- ============================================================================

alter table public.idempotency_keys enable row level security;

drop policy if exists "idempotency_no_user_access" on public.idempotency_keys;
create policy "idempotency_no_user_access" on public.idempotency_keys
  for all using (false);

-- ============================================================================
-- Views: useful computed views
-- ============================================================================

create or replace view public.stock_balances as
select
  organization_id,
  branch_id,
  product_id,
  coalesce(sum(
    case
      when movement_type in ('PURCHASE_IN', 'RETURN_IN', 'TECHNICIAN_TRANSFER_IN', 'ADJUSTMENT')
        then quantity
      when movement_type in ('SALE_OUT', 'RETURN_OUT', 'TECHNICIAN_TRANSFER_OUT',
                             'TECHNICIAN_CONSUME', 'DAMAGE_OUT', 'LOSS_OUT', 'ADJUSTMENT_OUT')
        then -quantity
      else 0
    end
  ), 0) as current_stock,
  count(*) as movement_count,
  max(created_at) as last_movement_at
from public.stock_movements
group by organization_id, branch_id, product_id;

comment on view public.stock_balances is
  'Computed stock balance per product per branch from stock_movements. '
  'Use this view to read current stock levels instead of a denormalized qty column.';

-- ============================================================================
-- Technician inventory view
-- ============================================================================

create table if not exists public.technician_inventory (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  branch_id        uuid references public.branches(id) on delete set null,
  technician_id    uuid references public.profiles(id) on delete cascade,
  product_id       uuid references public.products(id) on delete restrict,
  external_id      text,
  item_name        text not null,
  qty              numeric(14,3) not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists technician_inventory_unique
  on public.technician_inventory (organization_id, technician_id, product_id)
  where product_id is not null;

create index if not exists idx_tech_inv_org_tech
  on public.technician_inventory (organization_id, technician_id);

alter table public.technician_inventory enable row level security;

drop policy if exists "tech_inv_read" on public.technician_inventory;
create policy "tech_inv_read" on public.technician_inventory
  for select using (
    organization_id = public.current_organization_id()
    and (
      public.has_permission('technician_inventory.view')
      or technician_id = auth.uid()
    )
  );

drop policy if exists "tech_inv_write" on public.technician_inventory;
create policy "tech_inv_write" on public.technician_inventory
  for all using (
    organization_id = public.current_organization_id()
    and public.has_permission('technician_inventory.manage')
  );

-- ============================================================================
-- Technician financial transactions
-- ============================================================================

create table if not exists public.technician_financial_transactions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  branch_id        uuid references public.branches(id) on delete set null,
  technician_id    uuid references public.profiles(id) on delete set null,
  technician_name  text not null,
  transaction_type text not null,     -- advance, deposit, settlement, commission, etc.
  amount           numeric(14,2) not null,
  method           text,
  reference_type   text,              -- invoice, work_order, manual
  reference_id     text,
  invoice_id       uuid references public.invoices(id) on delete set null,
  notes            text,
  performed_by     uuid references public.profiles(id) on delete set null,
  external_id      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_tech_fin_org_tech
  on public.technician_financial_transactions (organization_id, technician_id, created_at desc);

alter table public.technician_financial_transactions enable row level security;

drop policy if exists "tech_fin_read" on public.technician_financial_transactions;
create policy "tech_fin_read" on public.technician_financial_transactions
  for select using (
    organization_id = public.current_organization_id()
    and (
      public.is_admin_or_supervisor()
      or technician_id = auth.uid()
    )
  );

drop policy if exists "tech_fin_write" on public.technician_financial_transactions;
create policy "tech_fin_write" on public.technician_financial_transactions
  for all using (
    organization_id = public.current_organization_id()
    and public.is_admin_or_supervisor()
  );

-- ============================================================================
-- app_migration_runs (ensure it exists)
-- ============================================================================

create table if not exists public.app_migration_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  label           text not null,
  status          text not null default 'started',
  summary         jsonb not null default '{}',
  error_message   text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);

alter table public.app_migration_runs enable row level security;

drop policy if exists "migration_runs_admin" on public.app_migration_runs;
create policy "migration_runs_admin" on public.app_migration_runs
  for all using (
    organization_id = public.current_organization_id()
    and public.current_role() = 'admin'
  );

-- ============================================================================
-- Customer balance view
-- ============================================================================

create or replace view public.customer_balances as
select
  i.organization_id,
  i.customer_id,
  i.customer_name,
  count(distinct i.id)               as invoice_count,
  coalesce(sum(i.grand_total), 0)    as total_invoiced,
  coalesce(sum(i.paid_amount), 0)    as total_paid,
  coalesce(sum(i.remaining_amount), 0) as outstanding,
  max(i.issued_at)                   as last_invoice_at
from public.invoices i
where i.status = 'active'
  and i.invoice_type = 'tax_invoice'
group by i.organization_id, i.customer_id, i.customer_name;

comment on view public.customer_balances is
  'Aggregated outstanding balances per customer.';

-- ============================================================================
-- Technician inventory balance view
-- ============================================================================

create or replace view public.technician_inventory_balances as
select
  ti.organization_id,
  ti.technician_id,
  p_tech.display_name  as technician_name,
  ti.product_id,
  pr.name              as product_name,
  pr.sku,
  ti.qty               as current_qty,
  pr.cost_price,
  ti.qty * pr.cost_price as stock_value,
  ti.updated_at
from public.technician_inventory ti
left join public.profiles p_tech on p_tech.id = ti.technician_id
left join public.products pr     on pr.id     = ti.product_id;

comment on view public.technician_inventory_balances is
  'Technician stock with product details and computed value.';
