-- ApplyFirst monitoring foundation schema.
-- Draft migration for a future Supabase backend; not required for the current local prototype.

create extension if not exists pgcrypto;

create table if not exists public.programs (
  id text primary key,
  name text not null,
  organization text not null,
  category text not null,
  role_tracks text[] not null default '{}',
  class_years text[] not null default '{}',
  timing text,
  status text not null,
  confidence text not null,
  priority text not null,
  alert_readiness text not null,
  verification_state text not null,
  monitoring_status text not null,
  monitoring_missing text[] not null default '{}',
  open_window text,
  deadline text,
  official_url text not null,
  previous_url text,
  funding text,
  location text,
  tags text[] not null default '{}',
  why text,
  prep text,
  source_note text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.official_sources (
  id text primary key,
  program_id text not null references public.programs(id) on delete cascade,
  url text not null,
  previous_url text,
  source_type text not null default 'official_program_page',
  check_cadence text not null,
  next_check text,
  alert_trigger text,
  change_signals text[] not null default '{}',
  enabled boolean not null default true,
  seeded_sample boolean not null default false,
  last_snapshot_id uuid,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.page_snapshots (
  id uuid primary key default gen_random_uuid(),
  official_source_id text not null references public.official_sources(id) on delete cascade,
  fetched_at timestamptz not null default now(),
  http_status integer,
  content_hash text not null,
  normalized_text text not null,
  error_message text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'official_sources_last_snapshot_fk'
  ) then
    alter table public.official_sources
      add constraint official_sources_last_snapshot_fk
      foreign key (last_snapshot_id)
      references public.page_snapshots(id)
      deferrable initially deferred;
  end if;
end $$;

create table if not exists public.source_checks (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references public.programs(id) on delete cascade,
  official_source_id text not null references public.official_sources(id) on delete cascade,
  page_snapshot_id uuid references public.page_snapshots(id) on delete set null,
  result text not null,
  suggested_status text,
  suggested_confidence text,
  review_decision text not null,
  changed boolean not null default false,
  new_alert_candidate boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.alert_candidates (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references public.programs(id) on delete cascade,
  source_check_id uuid not null references public.source_checks(id) on delete cascade,
  candidate_type text not null,
  title text not null,
  summary text not null,
  status text not null default 'pending_review',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  program_id text not null references public.programs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, program_id)
);

create table if not exists public.alert_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  class_year text,
  role_tracks text[] not null default '{}',
  program_groups text[] not null default '{}',
  timing_scope text not null default 'openings_and_deadlines',
  channels text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists official_sources_program_id_idx on public.official_sources(program_id);
create index if not exists official_sources_enabled_idx on public.official_sources(enabled);
create index if not exists page_snapshots_source_fetched_idx on public.page_snapshots(official_source_id, fetched_at desc);
create index if not exists source_checks_program_created_idx on public.source_checks(program_id, created_at desc);
create index if not exists source_checks_new_alert_idx on public.source_checks(new_alert_candidate) where new_alert_candidate = true;
create index if not exists alert_candidates_status_idx on public.alert_candidates(status, created_at desc);
create index if not exists saved_programs_user_id_idx on public.saved_programs(user_id);

alter table public.programs enable row level security;
alter table public.official_sources enable row level security;
alter table public.page_snapshots enable row level security;
alter table public.source_checks enable row level security;
alter table public.alert_candidates enable row level security;
alter table public.saved_programs enable row level security;
alter table public.alert_preferences enable row level security;

-- Public prototype read policies. Maintainer write policies should be added only after auth roles are defined.
drop policy if exists "Public can read programs" on public.programs;
create policy "Public can read programs"
  on public.programs for select
  using (true);

drop policy if exists "Public can read enabled official sources" on public.official_sources;
create policy "Public can read enabled official sources"
  on public.official_sources for select
  using (enabled = true);

drop policy if exists "Users can read their saved programs" on public.saved_programs;
create policy "Users can read their saved programs"
  on public.saved_programs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can manage their saved programs" on public.saved_programs;
create policy "Users can manage their saved programs"
  on public.saved_programs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read their alert preferences" on public.alert_preferences;
create policy "Users can read their alert preferences"
  on public.alert_preferences for select
  using (auth.uid() = user_id);

drop policy if exists "Users can manage their alert preferences" on public.alert_preferences;
create policy "Users can manage their alert preferences"
  on public.alert_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
