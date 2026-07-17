-- Architecture upgrade starter schema.
-- Safe to run multiple times. This does not replace the current JSON backup flow;
-- it prepares normalized tables for a gradual migration.

create table if not exists public.system_reminders (
  id text primary key,
  title text not null,
  description text,
  source text not null default 'manual',
  source_id text,
  customer_id text,
  customer_name text,
  customer_phone text,
  due_date timestamptz not null,
  status text not null default 'pending',
  priority text not null default 'normal',
  assigned_to_role text default 'supervisor',
  assigned_to_user_id text,
  completed_at timestamptz,
  completed_by_user_id text,
  completed_by_name text,
  snoozed_until timestamptz,
  notes text,
  created_by_user_id text,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_system_reminders_due_date on public.system_reminders (due_date);
create index if not exists idx_system_reminders_status on public.system_reminders (status);
create index if not exists idx_system_reminders_customer_id on public.system_reminders (customer_id);
create index if not exists idx_system_reminders_source on public.system_reminders (source, source_id);

alter table public.system_reminders enable row level security;

-- Keep policies permissive until Supabase Auth/RLS migration is completed in the app.
-- When Supabase Auth is activated, replace these with role-based policies.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'system_reminders' and policyname = 'Allow authenticated reminders read'
  ) then
    create policy "Allow authenticated reminders read" on public.system_reminders
      for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'system_reminders' and policyname = 'Allow authenticated reminders write'
  ) then
    create policy "Allow authenticated reminders write" on public.system_reminders
      for all using (true) with check (true);
  end if;
end $$;
