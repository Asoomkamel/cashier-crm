-- =============================================================================
-- Optional repair script for login/startup errors caused by duplicated rows.
--
-- Use this only if you see errors such as:
--   "JSON object requested, multiple (or no) rows returned"
--
-- The app v3 no longer crashes when duplicates exist, but cleaning them makes
-- Supabase data healthier. Review the SELECT results first before deleting.
-- =============================================================================

-- 1) Check duplicate memberships linked to the same Supabase auth user.
select user_id, count(*) as row_count
from public.business_members
where user_id is not null
group by user_id
having count(*) > 1;

-- 2) Check duplicate phone memberships across businesses.
select phone, count(*) as row_count
from public.business_members
group by phone
having count(*) > 1;

-- 3) Optional cleanup for exact duplicate user_id + business_id rows.
-- Keeps the oldest row and deletes only extra duplicate rows for the same user
-- inside the same business.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, business_id
      order by created_at asc, id asc
    ) as rn
  from public.business_members
  where user_id is not null
)
delete from public.business_members bm
using ranked r
where bm.id = r.id
  and r.rn > 1;

-- 4) Ensure each business has one shared payload row.
-- This should already be true if 03_business_multiuser.sql created
-- business_data with business_id as the primary key.
select business_id, count(*) as row_count
from public.business_data
group by business_id
having count(*) > 1;
