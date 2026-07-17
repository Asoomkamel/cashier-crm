-- ============================================================================
-- Migration 17: Phase 9 — Work Orders soft delete + Expenses + Reminders
--
-- Applied directly to Supabase cotftgifpyfwzswddhyg
-- Safe to run multiple times (idempotent).
-- ============================================================================

-- Work Orders: Phase 9 columns
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS order_source text DEFAULT 'urgent';
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS referral_name text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS referral_phone text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS postponed_until timestamptz;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS postponed_days integer DEFAULT 0;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS required_specialties text[] DEFAULT '{}';
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS activity_logs jsonb DEFAULT '[]';
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS technician_commission numeric(14,2) DEFAULT 0;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS marketing_commission numeric(14,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_work_orders_org_status_date
  ON public.work_orders(organization_id, status, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_work_orders_org_tech
  ON public.work_orders(organization_id, assigned_technician_id);

-- Expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id        uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  category         text NOT NULL DEFAULT 'General',
  amount           numeric(14,2) NOT NULL DEFAULT 0,
  description      text,
  technician_name  text,
  method           text DEFAULT 'cash',
  date             timestamptz NOT NULL DEFAULT now(),
  external_id      text,
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS expenses_org_ext
  ON public.expenses(organization_id, external_id) WHERE external_id IS NOT NULL;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Reminders table
CREATE TABLE IF NOT EXISTS public.reminders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id          uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  customer_id        uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name      text,
  reminder_type      text NOT NULL DEFAULT 'maintenance',
  assigned_to_role   text DEFAULT 'all',
  assigned_user_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  scheduled_at       timestamptz,
  is_completed       boolean NOT NULL DEFAULT false,
  completed_at       timestamptz,
  notes              text,
  external_id        text,
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS reminders_org_ext
  ON public.reminders(organization_id, external_id) WHERE external_id IS NOT NULL;

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
