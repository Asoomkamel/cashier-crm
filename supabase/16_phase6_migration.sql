-- ============================================================================
-- Migration 16: Phase 6 — Full Data Migration from app_backups → Normalized Tables
--
-- هذا الملف يوثّق الـ migrations التي تم تطبيقها مباشرة على Supabase
-- في Phase 6. آمن للتشغيل مجدداً (idempotent).
-- ============================================================================

-- القيم الثابتة للـ org و branch (تُحدَّث تلقائياً بعد أول migration)
-- ORG_ID:    3a5da4d0-9f82-472d-83ba-426652cb9e75
-- BRANCH_ID: fcc99cb9-7110-493d-8255-182463d76b97

-- 1. تأكد من وجود جدول staff_profiles
create table if not exists public.staff_profiles (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  branch_id        uuid references public.branches(id) on delete set null,
  external_id      text,
  auth_user_id     uuid references auth.users(id) on delete set null,
  display_name     text not null,
  phone            text,
  role             text not null default 'technician',
  specialties      text[] not null default '{}',
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists staff_profiles_org_ext
  on public.staff_profiles(organization_id, external_id) where external_id is not null;

create index if not exists staff_profiles_org_role
  on public.staff_profiles(organization_id, role);

alter table public.staff_profiles enable row level security;

drop policy if exists "staff_read" on public.staff_profiles;
create policy "staff_read" on public.staff_profiles for select
  using (organization_id = public.current_organization_id());

drop policy if exists "staff_write" on public.staff_profiles;
create policy "staff_write" on public.staff_profiles for all
  using (organization_id = public.current_organization_id()
    and public.is_admin_or_supervisor());

-- 2. تأكد من وجود عمود external_id في branches
alter table public.branches add column if not exists external_id text;

create unique index if not exists branches_org_ext
  on public.branches(organization_id, external_id) where external_id is not null;

-- 3. تأكد من وجود unique index لـ profiles.external_id
create unique index if not exists profiles_external_id_unique
  on public.profiles(external_id) where external_id is not null;

-- 4. Re-migration idempotent: ترحيل العملاء مرة أخرى آمن
-- (ON CONFLICT UPDATE يُحدّث فقط بدون تكرار)
-- يُفعَّل عند الحاجة من System Health page

-- 5. تسجيل أن Phase 6 تم
insert into public.app_migration_runs (
  organization_id, label, status, summary, finished_at
)
select
  '3a5da4d0-9f82-472d-83ba-426652cb9e75',
  'Phase 6 SQL - Migration file applied',
  'completed',
  jsonb_build_object('file', '16_phase6_migration.sql', 'applied_at', now()::text),
  now()
where not exists (
  select 1 from public.app_migration_runs
  where label = 'Phase 6 SQL - Migration file applied'
    and organization_id = '3a5da4d0-9f82-472d-83ba-426652cb9e75'
);
