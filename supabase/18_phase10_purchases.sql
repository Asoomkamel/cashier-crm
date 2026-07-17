-- ============================================================================
-- Migration 18: Phase 10 — Purchases + Purchase Items Tables
-- Applied to Supabase cotftgifpyfwzswddhyg
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.purchases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id        uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  vendor_id        uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  vendor_name      text,
  purchase_type    text NOT NULL DEFAULT 'purchase',
  payment_method   text DEFAULT 'cash',
  total_before_tax numeric(14,2) NOT NULL DEFAULT 0,
  total_tax        numeric(14,2) NOT NULL DEFAULT 0,
  grand_total      numeric(14,2) NOT NULL DEFAULT 0,
  notes            text,
  external_id      text,
  purchase_date    timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE TABLE IF NOT EXISTS public.purchase_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  purchase_id      uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id       uuid REFERENCES public.products(id) ON DELETE SET NULL,
  item_name        text NOT NULL,
  quantity         numeric(14,3) NOT NULL DEFAULT 1,
  unit_cost        numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate         numeric(6,2) NOT NULL DEFAULT 0,
  line_total       numeric(14,2) NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS purchases_org_ext
  ON public.purchases(organization_id, external_id) WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchases_org_date
  ON public.purchases(organization_id, purchase_date DESC);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchases_read" ON public.purchases;
CREATE POLICY "purchases_read" ON public.purchases FOR SELECT
  USING (organization_id = public.current_organization_id()
    AND public.has_permission('purchases.view') AND deleted_at IS NULL);

DROP POLICY IF EXISTS "purchases_write" ON public.purchases;
CREATE POLICY "purchases_write" ON public.purchases FOR ALL
  USING (organization_id = public.current_organization_id()
    AND public.has_permission('purchases.manage'));
