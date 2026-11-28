-- User-owned application tracking, match results, generated document drafts, and notifications.
-- All personal records are protected by ownership-based RLS.

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete restrict,
  status text not null default 'saved' check (status in ('saved','preparing','submitted','interview','rejected','withdrawn','offer')),
  notes text,
  applied_at timestamptz,
  reminder_at timestamptz,
  job_title_snapshot text,
  organization_snapshot text,
  source_url_snapshot text,
  deadline_snapshot date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);
create index if not exists applications_user_updated_idx on public.applications(user_id, updated_at desc);
create index if not exists applications_user_status_idx on public.applications(user_id, status);

create table if not exists public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  old_status text,
  new_status text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists application_events_app_created_idx on public.application_events(application_id, created_at desc);
create index if not exists application_events_user_created_idx on public.application_events(user_id, created_at desc);

create table if not exists public.job_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  score numeric(5,2) not null default 0 check (score >= 0 and score <= 100),
  eligible boolean not null default false,
  score_breakdown jsonb not null default '{}'::jsonb,
  explanation text not null default '',
  missing_requirements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, job_id)
);
create index if not exists job_matches_user_score_idx on public.job_matches(user_id, score desc);

create table if not exists public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  document_type text not null check (document_type in ('cv','cover_letter','email_draft')),
  title text not null,
  content text not null default '',
  generation_method text not null default 'template' check (generation_method in ('template','ai_assisted','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists generated_documents_user_updated_idx on public.generated_documents(user_id, updated_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null default '',
  target_path text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);

alter table public.applications enable row level security;
alter table public.application_events enable row level security;
alter table public.job_matches enable row level security;
alter table public.generated_documents enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Users read own applications" on public.applications;
drop policy if exists "Users create own applications" on public.applications;
drop policy if exists "Users update own applications" on public.applications;
drop policy if exists "Users delete own applications" on public.applications;
drop policy if exists "Users read own application events" on public.application_events;
drop policy if exists "Users add own application events" on public.application_events;
drop policy if exists "Users read own matches" on public.job_matches;
drop policy if exists "Users read own generated documents" on public.generated_documents;
drop policy if exists "Users create own generated documents" on public.generated_documents;
drop policy if exists "Users update own generated documents" on public.generated_documents;
drop policy if exists "Users delete own generated documents" on public.generated_documents;
drop policy if exists "Users read own notifications" on public.notifications;
drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users read own applications" on public.applications for select to authenticated using (user_id = (select auth.uid()));
create policy "Users create own applications" on public.applications for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users update own applications" on public.applications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users delete own applications" on public.applications for delete to authenticated using (user_id = (select auth.uid()));
create policy "Users read own application events" on public.application_events for select to authenticated using (user_id = (select auth.uid()));
create policy "Users add own application events" on public.application_events for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users read own matches" on public.job_matches for select to authenticated using (user_id = (select auth.uid()));
create policy "Users read own generated documents" on public.generated_documents for select to authenticated using (user_id = (select auth.uid()));
create policy "Users create own generated documents" on public.generated_documents for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users update own generated documents" on public.generated_documents for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users delete own generated documents" on public.generated_documents for delete to authenticated using (user_id = (select auth.uid()));
create policy "Users read own notifications" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "Users update own notifications" on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.applications to authenticated;
grant select, insert on public.application_events to authenticated;
grant select on public.job_matches to authenticated;
grant select, insert, update, delete on public.generated_documents to authenticated;
grant select, update on public.notifications to authenticated;

create or replace function public.log_application_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_events(application_id,user_id,event_type,new_status,note)
    values(new.id,new.user_id,'created',new.status,new.notes);
  elsif new.status is distinct from old.status then
    insert into public.application_events(application_id,user_id,event_type,old_status,new_status,note)
    values(new.id,new.user_id,'status_changed',old.status,new.status,new.notes);
  end if;
  return new;
end;
$$;
drop trigger if exists applications_log_change on public.applications;
create trigger applications_log_change after insert or update on public.applications
for each row execute function public.log_application_change();

create or replace function public.set_application_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at before update on public.applications
for each row execute function public.set_application_updated_at();

create or replace function public.set_generated_document_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists generated_documents_set_updated_at on public.generated_documents;
create trigger generated_documents_set_updated_at before update on public.generated_documents
for each row execute function public.set_generated_document_updated_at();
