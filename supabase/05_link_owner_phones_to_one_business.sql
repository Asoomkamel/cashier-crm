-- =============================================================================
-- Cashier + CRM — Link owner password phones to the same business
-- Run this only if the second owner phone opened an empty business.
--
-- The app now does this automatically on next login, but this SQL lets you
-- repair existing Supabase data immediately.
-- =============================================================================

-- Normalized phones used by the app:
-- 0599151905  -> +966599151905
-- 0590016073  -> +966590016073

-- 1) Check current memberships and business_data rows before changing anything.
select
  bm.id as member_id,
  bm.phone,
  bm.business_id,
  b.name as business_name,
  bm.role,
  bm.user_id,
  bm.created_at,
  bd.updated_at as data_updated_at,
  jsonb_typeof(bd.payload) as payload_type
from public.business_members bm
left join public.businesses b on b.id = bm.business_id
left join public.business_data bd on bd.business_id = bm.business_id
where bm.phone in ('+966599151905', '+966590016073')
order by bm.phone, bm.created_at;

-- 2) Repair: move 0590016073 into the same business as 0599151905.
-- This keeps the data imported under 0599151905 and makes 0590016073 load it.
do $$
declare
  primary_business uuid;
  secondary_member uuid;
begin
  select business_id into primary_business
  from public.business_members
  where phone = '+966599151905'
  order by created_at asc
  limit 1;

  if primary_business is null then
    raise exception 'Primary owner phone +966599151905 has no business_members row. Login with 0599151905 first.';
  end if;

  select id into secondary_member
  from public.business_members
  where phone = '+966590016073'
  order by created_at asc
  limit 1;

  if secondary_member is null then
    insert into public.business_members (business_id, phone, full_name, role, permissions)
    values (
      primary_business,
      '+966590016073',
      '+966590016073',
      'admin',
      jsonb_build_object('isFullAdmin', true, 'canLogin', true)
    );
  else
    -- Remove duplicate rows for the secondary phone except the oldest row we keep.
    delete from public.business_members
    where phone = '+966590016073'
      and id <> secondary_member;

    update public.business_members
    set
      business_id = primary_business,
      role = 'admin',
      permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object('isFullAdmin', true, 'canLogin', true),
      updated_at = now()
    where id = secondary_member;
  end if;
end $$;

-- 3) Re-check. Both phones should now show the same business_id.
select
  bm.id as member_id,
  bm.phone,
  bm.business_id,
  b.name as business_name,
  bm.role,
  bm.user_id,
  bm.created_at,
  bd.updated_at as data_updated_at,
  jsonb_typeof(bd.payload) as payload_type
from public.business_members bm
left join public.businesses b on b.id = bm.business_id
left join public.business_data bd on bd.business_id = bm.business_id
where bm.phone in ('+966599151905', '+966590016073')
order by bm.phone, bm.created_at;
