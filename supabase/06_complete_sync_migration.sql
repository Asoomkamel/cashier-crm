-- =============================================================================
-- Cashier CRM — Migration الشامل لربط كل البيانات بـ Supabase
-- شغّل هذا الملف في: Supabase Dashboard → SQL Editor → New Query
-- يعمل بأمان على قاعدة بيانات موجودة (IF NOT EXISTS في كل مكان)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. app_backups — الجدول الأساسي الذي يستخدمه النظام حالياً
--    (API routes: /api/backup/save و /api/backup/load)
--    يخزن كامل البيانات كـ JSON blob واحد بمعرّف ثابت "default"
-- ---------------------------------------------------------------------------
create table if not exists public.app_backups (
  id         text primary key default 'default',
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- السماح لـ service role فقط بالكتابة والقراءة (لا يوجد وصول مباشر للمستخدم)
alter table public.app_backups enable row level security;

-- service role يتجاوز RLS تلقائياً، لذا لا نحتاج policy للكتابة
-- نضيف policy للقراءة فقط للمستخدمين المسجّلين (اختياري — الـ API يستخدم service role)
drop policy if exists "app_backups_service_read" on public.app_backups;
create policy "app_backups_service_read" on public.app_backups
  for select using (auth.role() = 'authenticated');

-- trigger لتحديث updated_at تلقائياً عند كل حفظ
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_backups_set_updated_at on public.app_backups;
create trigger app_backups_set_updated_at
  before update on public.app_backups
  for each row execute procedure public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. businesses — جدول الأعمال (multi-tenant)
-- ---------------------------------------------------------------------------
create table if not exists public.businesses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'عملي',
  owner_id   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.businesses enable row level security;

drop trigger if exists businesses_set_updated_at on public.businesses;
create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute procedure public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. business_members — ربط المستخدمين بالأعمال والأدوار
-- ---------------------------------------------------------------------------
create table if not exists public.business_members (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references public.businesses(id) on delete cascade,
  user_id              uuid references auth.users(id) on delete set null,
  phone                text not null,
  full_name            text,
  role                 text not null default 'technician'
                         check (role in ('admin', 'supervisor', 'technician', 'pos')),
  permissions          jsonb not null default '{}'::jsonb,
  specializations      text[] default '{}',
  assigned_products    text[] default '{}',
  inventory_categories text[] default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index if not exists business_members_business_phone_idx
  on public.business_members (business_id, phone);

create index if not exists business_members_phone_idx   on public.business_members (phone);
create index if not exists business_members_user_id_idx on public.business_members (user_id);

alter table public.business_members enable row level security;

drop trigger if exists business_members_set_updated_at on public.business_members;
create trigger business_members_set_updated_at
  before update on public.business_members
  for each row execute procedure public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. business_data — بيانات كل عمل كـ JSON كامل
--    { customers, catalog, orders, vendors, purchases, expenses, settings,
--      users, urgentOrders, appointments, techInventory, techInventoryLogs,
--      techFinancialLogs, techLocations, customerPayments }
-- ---------------------------------------------------------------------------
create table if not exists public.business_data (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  payload     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.business_data enable row level security;

drop trigger if exists business_data_set_updated_at on public.business_data;
create trigger business_data_set_updated_at
  before update on public.business_data
  for each row execute procedure public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. profiles — معلومات المستخدمين الإضافية
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid references auth.users(id) on delete cascade primary key,
  full_name         text,
  phone             text,
  phone_verified    boolean not null default false,
  phone_verified_at timestamptz,
  avatar_url        text,
  auth_provider     text default 'email',
  role              text not null default 'admin'
                      check (role in ('customer', 'admin', 'cashier', 'technician', 'supervisor')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists profiles_phone_unique_idx
  on public.profiles (phone) where phone is not null;

alter table public.profiles enable row level security;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. otp_attempts — سجل محاولات OTP (rate limiting + audit)
-- ---------------------------------------------------------------------------
create table if not exists public.otp_attempts (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null,   -- يستخدم أيضاً للـ email
  purpose    text not null,
  provider   text not null,
  success    boolean not null,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists otp_attempts_phone_created_idx
  on public.otp_attempts (phone, created_at desc);

alter table public.otp_attempts enable row level security;
-- service role only — لا يوجد وصول مباشر للمستخدم

-- ---------------------------------------------------------------------------
-- 7. settings — إعدادات النظام (key/value)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  key   text primary key,
  value text
);

alter table public.settings enable row level security;

-- Seed القيم الافتراضية
insert into public.settings (key, value) values
  ('admin_otp_bypass_enabled', 'false'),
  ('admin_otp_bypass_phone',   ''),
  ('admin_otp_bypass_code',    '')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 8. user_data — fallback قديم (للتوافق مع الكود القديم)
-- ---------------------------------------------------------------------------
create table if not exists public.user_data (
  id         uuid references auth.users(id) on delete cascade primary key,
  payload    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

drop trigger if exists user_data_set_updated_at on public.user_data;
create trigger user_data_set_updated_at
  before update on public.user_data
  for each row execute procedure public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. RLS Policies — كل الصلاحيات
-- ---------------------------------------------------------------------------

-- profiles
drop policy if exists "profiles_self_read"   on public.profiles;
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_read"   on public.profiles for select using (auth.uid() = id);
create policy "profiles_self_update" on public.profiles for update using (auth.uid() = id);

-- user_data
drop policy if exists "user_data_own_read"   on public.user_data;
drop policy if exists "user_data_own_insert" on public.user_data;
drop policy if exists "user_data_own_update" on public.user_data;
create policy "user_data_own_read"   on public.user_data for select using (auth.uid() = id);
create policy "user_data_own_insert" on public.user_data for insert with check (auth.uid() = id);
create policy "user_data_own_update" on public.user_data for update using (auth.uid() = id);

-- businesses
drop policy if exists "businesses_member_read" on public.businesses;
create policy "businesses_member_read" on public.businesses
  for select using (
    exists (
      select 1 from public.business_members m
      where m.business_id = businesses.id and m.user_id = auth.uid()
    )
  );

-- business_members
drop policy if exists "members_self_read" on public.business_members;
create policy "members_self_read" on public.business_members
  for select using (auth.uid() = user_id);

-- business_data
drop policy if exists "business_data_member_read"   on public.business_data;
drop policy if exists "business_data_member_write"  on public.business_data;
drop policy if exists "business_data_member_update" on public.business_data;

create policy "business_data_member_read" on public.business_data
  for select using (
    exists (
      select 1 from public.business_members m
      where m.business_id = business_data.business_id and m.user_id = auth.uid()
    )
  );
create policy "business_data_member_write" on public.business_data
  for insert with check (
    exists (
      select 1 from public.business_members m
      where m.business_id = business_data.business_id and m.user_id = auth.uid()
    )
  );
create policy "business_data_member_update" on public.business_data
  for update using (
    exists (
      select 1 from public.business_members m
      where m.business_id = business_data.business_id and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 10. Helper functions
-- ---------------------------------------------------------------------------

-- التحقق من أن المستخدم الحالي admin
create or replace function public.is_admin()
returns boolean
language sql security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'supervisor')
  );
$$;

-- إرجاع قائمة business_ids التي ينتمي لها المستخدم الحالي
create or replace function public.current_business_ids()
returns setof uuid
language sql security definer set search_path = public stable
as $$
  select business_id from public.business_members where user_id = auth.uid();
$$;

-- التحقق من أن المستخدم admin في business محدد
create or replace function public.is_business_admin(target_business_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.business_members
    where business_id = target_business_id
      and user_id = auth.uid()
      and role in ('admin', 'supervisor')
  );
$$;

-- ---------------------------------------------------------------------------
-- 11. Auto-create profile عند تسجيل مستخدم جديد
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, auth_provider)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(new.raw_user_meta_data ->> 'provider', 'email')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 12. insert الصف الافتراضي في app_backups إن لم يكن موجوداً
--    هذا يمنع خطأ "no rows found" في أول load
-- ---------------------------------------------------------------------------
insert into public.app_backups (id, payload, updated_at)
values ('default', '{}'::jsonb, now())
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- تم! الجداول الجديدة والمطلوبة:
--   ✅ app_backups          — الجدول الرئيسي للـ /api/backup/save|load
--   ✅ businesses           — multi-tenant businesses
--   ✅ business_members     — ربط المستخدمين بالأعمال
--   ✅ business_data        — بيانات كل عمل كـ JSON
--   ✅ profiles             — معلومات المستخدمين
--   ✅ otp_attempts         — سجل OTP
--   ✅ settings             — إعدادات النظام
--   ✅ user_data            — fallback قديم
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- تفعيل Supabase Realtime على جدول app_backups
-- هذا ضروري لكي تصل التغييرات فوراً لكل الأجهزة المتصلة
-- ===========================================================================

-- أضف الجدول لقائمة الجداول المراقبة بـ Realtime
alter publication supabase_realtime add table public.app_backups;

-- تأكد من أن كل الأعمدة تُرسل في الـ payload (ليس فقط الـ diff)
alter table public.app_backups replica identity full;
