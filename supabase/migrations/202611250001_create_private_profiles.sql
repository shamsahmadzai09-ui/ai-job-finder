-- Phase 2: private user profiles and repeatable profile sections.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  father_name text,
  birth_date date,
  origin_province text,
  current_province text,
  current_address text,
  phone text,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('education','skill','language','experience','certificate','project')),
  position integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.profile_items enable row level security;

create policy "Users can read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Users can insert own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Users can update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Users can delete own profile" on public.profiles for delete to authenticated using ((select auth.uid()) = id);

create policy "Users can read own profile items" on public.profile_items for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own profile items" on public.profile_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own profile items" on public.profile_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own profile items" on public.profile_items for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.profile_items to authenticated;
revoke all on public.profiles from anon;
revoke all on public.profile_items from anon;

create index if not exists profile_items_user_type_position_idx
  on public.profile_items(user_id, item_type, position);
