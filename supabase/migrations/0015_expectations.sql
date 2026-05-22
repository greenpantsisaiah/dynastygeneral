-- Companion expectation ledger (the emotional-ROI loop, Principle 13).
--
-- The companion's memory. At a decision moment (a pick taken over the
-- standing call, a lineup set, a pregame win probability) the engine
-- writes a row recording WHAT WAS EXPECTED, the road not taken, and the
-- user's logged thesis. When real data lands (the next picks, a game
-- result, an injury) the row is reconciled and an outcome is stamped,
-- which is what produces the vindication / bad-beat / critique beat.
--
-- This is the durable half of the loop. Every beat that fires off a
-- resolved row carries the row as its `source` provenance, which is the
-- anti-slime guarantee: no remembered expectation, no memory beat. The
-- domain shape lives in src/lib/strategy/companion/types.ts
-- (ExpectationRecord); read/write helpers in src/lib/companion/ledger.ts.

create table if not exists public.expectations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  league_id text not null,
  -- Stable client-provided id (e.g. "pick-30-evans"). The
  -- (user_id, league_id, bet_id) triple is unique so loading the same
  -- expectation twice is idempotent (upsert, not duplicate).
  bet_id text not null,
  -- "pick" | "survival" | "lineup" | "matchup" | "play".
  kind text not null,
  -- Draft context (null in-season) and season context (null in-draft).
  created_at_pick_no integer,
  created_at_week integer,
  subject_player_id text,
  -- "Mike Evans" or "Week 9 vs Saquonatraitor".
  subject_label text not null,
  -- "ev" | "win_prob" | "survival_pct" | "points".
  expected_metric text not null,
  expected_value double precision not null,
  expected_ci_low double precision,
  expected_ci_high double precision,
  -- The road not taken (the alternative the engine favored, if any).
  alternative_label text,
  alternative_value double precision,
  -- The user's logged reasoning (the investment phase of the loop).
  thesis text,
  resolution_condition text not null,
  -- "next_pick" | "this_week" | "this_season".
  horizon text not null,
  resolved boolean not null default false,
  resolved_value double precision,
  -- "confirmed" | "variance_loss" | "process_error" | "neutral".
  outcome text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, league_id, bet_id)
);

-- Most lookups want open (unresolved) rows for a league, newest first,
-- to reconcile against fresh data.
create index if not exists expectations_lookup
  on public.expectations (user_id, league_id, resolved, created_at desc);

alter table public.expectations enable row level security;

drop policy if exists "users read their own expectations" on public.expectations;
create policy "users read their own expectations"
  on public.expectations for select
  using (auth.uid() = user_id);

drop policy if exists "users write their own expectations" on public.expectations;
create policy "users write their own expectations"
  on public.expectations for insert
  with check (auth.uid() = user_id);

drop policy if exists "users update their own expectations" on public.expectations;
create policy "users update their own expectations"
  on public.expectations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users delete their own expectations" on public.expectations;
create policy "users delete their own expectations"
  on public.expectations for delete
  using (auth.uid() = user_id);

-- Keep updated_at fresh on edits (reuses the shared touch pattern).
create or replace function public.touch_expectations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists expectations_updated_at on public.expectations;
create trigger expectations_updated_at
  before update on public.expectations
  for each row
  execute function public.touch_expectations_updated_at();
