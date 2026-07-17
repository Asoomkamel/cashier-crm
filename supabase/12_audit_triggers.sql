-- ============================================================================
-- Migration 12: Audit Triggers — Phase 5
--
-- Database-level audit trail for sensitive tables.
-- Runs AFTER supabase/11_rls_policies.sql.
-- ============================================================================

-- Generic audit trigger function
create or replace function public.tg_audit_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id   uuid;
  v_org_id     uuid;
  v_action     text;
  v_before     jsonb;
  v_after      jsonb;
begin
  v_actor_id := auth.uid();
  v_action   := lower(TG_OP); -- 'insert', 'update', 'delete'

  case TG_OP
    when 'INSERT' then
      v_after  := to_jsonb(NEW);
      v_before := null;
      v_org_id := (NEW).organization_id;
    when 'UPDATE' then
      v_before := to_jsonb(OLD);
      v_after  := to_jsonb(NEW);
      v_org_id := (NEW).organization_id;
    when 'DELETE' then
      v_before := to_jsonb(OLD);
      v_after  := null;
      v_org_id := (OLD).organization_id;
  end case;

  -- Only audit rows that belong to an organization (skip system rows)
  if v_org_id is null then
    return coalesce(NEW, OLD);
  end if;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    created_at
  ) values (
    v_org_id,
    v_actor_id,
    v_action,
    lower(TG_TABLE_NAME),
    case
      when TG_OP = 'DELETE' then (OLD.id)::text
      else (NEW.id)::text
    end,
    v_before,
    v_after,
    now()
  );

  return coalesce(NEW, OLD);
exception
  -- Never let the audit trigger block the actual operation
  when others then
    raise warning 'audit_trigger failed for table %: %', TG_TABLE_NAME, sqlerrm;
    return coalesce(NEW, OLD);
end;
$$;

revoke execute on function public.tg_audit_record() from anon, authenticated;

-- ============================================================================
-- Apply triggers to sensitive tables
-- ============================================================================

-- invoices
drop trigger if exists audit_invoices on public.invoices;
create trigger audit_invoices
  after insert or update or delete on public.invoices
  for each row execute function public.tg_audit_record();

-- invoice_items (update only — inserts/deletes are covered by invoice audit)
drop trigger if exists audit_invoice_items on public.invoice_items;
create trigger audit_invoice_items
  after delete on public.invoice_items
  for each row execute function public.tg_audit_record();

-- products (price + stock changes)
drop trigger if exists audit_products on public.products;
create trigger audit_products
  after update on public.products
  for each row execute function public.tg_audit_record();

-- stock_movements
drop trigger if exists audit_stock_movements on public.stock_movements;
create trigger audit_stock_movements
  after insert or update or delete on public.stock_movements
  for each row execute function public.tg_audit_record();

-- technician_inventory
drop trigger if exists audit_technician_inventory on public.technician_inventory;
create trigger audit_technician_inventory
  after insert or update on public.technician_inventory
  for each row execute function public.tg_audit_record();

-- technician_financial_transactions
drop trigger if exists audit_tech_fin on public.technician_financial_transactions;
create trigger audit_tech_fin
  after insert on public.technician_financial_transactions
  for each row execute function public.tg_audit_record();

-- customers (updates only — creation is not as sensitive)
drop trigger if exists audit_customers_update on public.customers;
create trigger audit_customers_update
  after update or delete on public.customers
  for each row execute function public.tg_audit_record();

-- profiles (role and permission changes)
drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles
  after insert or update on public.profiles
  for each row execute function public.tg_audit_record();

-- ============================================================================
-- Ensure audit_logs has all columns used by trigger
-- ============================================================================

alter table public.audit_logs add column if not exists before_data   jsonb;
alter table public.audit_logs add column if not exists after_data    jsonb;
alter table public.audit_logs add column if not exists ip_address    text;
alter table public.audit_logs add column if not exists user_agent    text;
alter table public.audit_logs add column if not exists metadata      jsonb;
