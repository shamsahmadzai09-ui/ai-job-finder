-- Afghanistan-only, multi-user job platform: initial secure schema.
-- Apply in Supabase SQL Editor or with the Supabase CLI.
-- Job ingestion is server-only; browser users can read published Afghan vacancies.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  province text,
  city text,
  education_level text,
  education jsonb not null default '[]'::jsonb,
  languages jsonb not null default '[]'::jsonb,
  skills text[] not null default '{}',
  work_experience jsonb not null default '[]'::jsonb,
  preferred_sectors text[] not null default '{}',
  preferred_employment_types text[] not null default '{}',
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_provinces text[] not null default '{}',
  include_remote boolean not null default true,
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  organization text not null,
  description text not null default '',
  requirements jsonb not null default '[]'::jsonb,
  province text,
  city text,
  employment_type text not null default 'full_time'
    check (employment_type in ('full_time','part_time','contract','internship','temporary')),
  remote_allowed boolean not null default false,
  eligible_from_afghanistan boolean not null default true,
  sector text,
  source_name text not null,
  source_url text not null,
  external_id text,
  published_at timestamptz,
  application_deadline timestamptz,
  status text not null default 'draft' check (status in ('draft','published','expired')),
  content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_afghanistan_only check (eligible_from_afghanistan = true)
);

create unique index if not exists jobs_source_external_id_unique
  on public.jobs (source_name, external_id)
  where external_id is not null;

create unique index if not exists jobs_content_hash_unique
  on public.jobs (content_hash)
  where content_hash is not null;

create index if not exists jobs_published_deadline_idx
  on public.jobs (status, application_deadline);

create index if not exists jobs_location_idx
  on public.jobs (province, city);

create table if not exists public.job_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  eligible boolean not null default false,
  score_breakdown jsonb not null default '{}'::jsonb,
  explanation text not null default '',
  missing_requirements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create index if not exists job_matches_user_score_idx
  on public.job_matches (user_id, score desc);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete restrict,
  status text not null default 'saved'
    check (status in ('saved','preparing','submitted','interview','rejected','withdrawn','offer')),
  notes text,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create index if not exists applications_user_updated_idx
  on public.applications (user_id, updated_at desc);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at before update on public.user_settings
for each row execute function public.set_updated_at();

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at before update on public.jobs
for each row execute function public.set_updated_at();

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at before update on public.applications
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.jobs enable row level security;
alter table public.job_matches enable row level security;
alter table public.applications enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users create own profile" on public.profiles;
create policy "Users create own profile" on public.profiles
for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
for update to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Users read own settings" on public.user_settings;
create policy "Users read own settings" on public.user_settings
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users create own settings" on public.user_settings;
create policy "Users create own settings" on public.user_settings
for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users update own settings" on public.user_settings;
create policy "Users update own settings" on public.user_settings
for update to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Anyone can read published Afghan jobs" on public.jobs;
create policy "Anyone can read published Afghan jobs" on public.jobs
for select to anon, authenticated
using (status = 'published' and eligible_from_afghanistan = true);

-- There are intentionally no client INSERT/UPDATE/DELETE policies on jobs.
-- Only trusted server-side ingestion using the service role may manage listings.

drop policy if exists "Users read own matches" on public.job_matches;
create policy "Users read own matches" on public.job_matches
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users read own applications" on public.applications;
create policy "Users read own applications" on public.applications
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users create own applications" on public.applications;
create policy "Users create own applications" on public.applications
for insert to authenticated
with check (user_id = (select auth.uid()) and status = 'saved');

-- Users may edit their notes, but cannot mark an application as submitted.
-- Status transitions require a trusted server-side confirmation workflow.

grant select on public.jobs to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.user_settings to authenticated;
grant select on public.job_matches to authenticated;
grant select on public.applications to authenticated;
grant insert (user_id, job_id, notes) on public.applications to authenticated;
grant update (notes) on public.applications to authenticated;
