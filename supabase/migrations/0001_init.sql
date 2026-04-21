-- Dynasty Copilot: initial schema
-- Supabase (Postgres). Apply via: supabase db push  (or paste into SQL editor)

set search_path = public;

-- ============================================================
-- profiles: one row per auth.users user, extends auth
-- ============================================================
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  sleeper_user_id     text,
  sleeper_username    text,
  display_name        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists profiles_sleeper_user_id_idx
  on public.profiles (sleeper_user_id);

-- ============================================================
-- leagues: one row per user-connected Sleeper league (per season)
-- ============================================================
create table if not exists public.leagues (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  sleeper_league_id   text not null,
  season              text not null,
  name                text,
  team_name           text,
  roster_id           int,
  is_dynasty          boolean not null default true,
  settings            jsonb,
  scoring             jsonb,
  roster_positions    text[],
  last_synced_at      timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, sleeper_league_id)
);

create index if not exists leagues_user_idx on public.leagues (user_id);
create index if not exists leagues_sleeper_idx on public.leagues (sleeper_league_id);

-- ============================================================
-- strategies: per-league strategy memory (both declared and inferred)
-- ============================================================
create type public.strategy_state as enum (
  'contender',
  'rebuild',
  'balanced',
  'undetermined'
);

create table if not exists public.strategies (
  id                  uuid primary key default gen_random_uuid(),
  league_id           uuid not null references public.leagues(id) on delete cascade,
  declared            public.strategy_state,
  inferred            public.strategy_state not null default 'undetermined',
  confidence          numeric(4,3) not null default 0, -- 0..1
  preferred_assets    text[] not null default '{}',
  avoid_list          text[] not null default '{}',
  exposure_notes      text,
  user_notes          text,
  last_inferred_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (league_id)
);

-- ============================================================
-- strategy_history: log of strategy changes over time
-- ============================================================
create table if not exists public.strategy_history (
  id                  uuid primary key default gen_random_uuid(),
  league_id           uuid not null references public.leagues(id) on delete cascade,
  declared            public.strategy_state,
  inferred            public.strategy_state,
  confidence          numeric(4,3),
  source              text, -- 'user' | 'system'
  rationale           text,
  created_at          timestamptz not null default now()
);

create index if not exists strategy_history_league_idx
  on public.strategy_history (league_id, created_at desc);

-- ============================================================
-- decisions: log of every decision the copilot is asked to help with
-- ============================================================
create type public.decision_type as enum (
  'pick',
  'trade_incoming',
  'trade_outbound',
  'strategy_clarify'
);

create type public.decision_outcome as enum (
  'pending',
  'followed',
  'overruled',
  'abandoned'
);

create table if not exists public.decisions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  league_id           uuid not null references public.leagues(id) on delete cascade,
  type                public.decision_type not null,
  inputs              jsonb not null,
  recommendation      jsonb,
  reasoning_summary   text,
  drift_flagged       boolean not null default false,
  leverage_score      numeric(4,3),
  confidence          numeric(4,3),
  outcome             public.decision_outcome not null default 'pending',
  user_feedback       jsonb,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz
);

create index if not exists decisions_league_idx
  on public.decisions (league_id, created_at desc);
create index if not exists decisions_user_idx
  on public.decisions (user_id, created_at desc);
create index if not exists decisions_type_idx on public.decisions (type);

-- ============================================================
-- waitlist: pre-launch signups (unauthenticated allowed)
-- ============================================================
create table if not exists public.waitlist (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null,
  name                text,
  sleeper_username    text,
  league_count        int,
  focus               text, -- 'drafts' | 'trades' | 'both'
  is_creator          boolean not null default false,
  pain_point          text,
  source              text,
  created_at          timestamptz not null default now(),
  unique (email)
);

-- ============================================================
-- updated_at triggers
-- ============================================================
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_leagues_updated_at on public.leagues;
create trigger set_leagues_updated_at
  before update on public.leagues
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_strategies_updated_at on public.strategies;
create trigger set_strategies_updated_at
  before update on public.strategies
  for each row execute function public.tg_set_updated_at();

-- ============================================================
-- Row-Level Security
-- ============================================================
alter table public.profiles          enable row level security;
alter table public.leagues           enable row level security;
alter table public.strategies        enable row level security;
alter table public.strategy_history  enable row level security;
alter table public.decisions         enable row level security;
alter table public.waitlist          enable row level security;

-- profiles: user sees and manages their own row
drop policy if exists "profiles self read"   on public.profiles;
drop policy if exists "profiles self insert" on public.profiles;
drop policy if exists "profiles self update" on public.profiles;

create policy "profiles self read"
  on public.profiles for select
  using (id = (select auth.uid()));

create policy "profiles self insert"
  on public.profiles for insert
  with check (id = (select auth.uid()));

create policy "profiles self update"
  on public.profiles for update
  using (id = (select auth.uid()));

-- leagues: user sees and manages their own leagues
drop policy if exists "leagues self all" on public.leagues;
create policy "leagues self all"
  on public.leagues for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- strategies: access via parent league ownership
drop policy if exists "strategies self all" on public.strategies;
create policy "strategies self all"
  on public.strategies for all
  using (
    exists (
      select 1 from public.leagues l
      where l.id = strategies.league_id and l.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.leagues l
      where l.id = strategies.league_id and l.user_id = (select auth.uid())
    )
  );

-- strategy_history: same
drop policy if exists "strategy_history self all" on public.strategy_history;
create policy "strategy_history self all"
  on public.strategy_history for all
  using (
    exists (
      select 1 from public.leagues l
      where l.id = strategy_history.league_id and l.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.leagues l
      where l.id = strategy_history.league_id and l.user_id = (select auth.uid())
    )
  );

-- decisions: user sees their own decisions
drop policy if exists "decisions self all" on public.decisions;
create policy "decisions self all"
  on public.decisions for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- waitlist: anyone may insert (anon); only service_role reads
drop policy if exists "waitlist anon insert" on public.waitlist;
create policy "waitlist anon insert"
  on public.waitlist for insert
  to anon, authenticated
  with check (true);
-- no select policy for anon/authenticated → reads require service_role
