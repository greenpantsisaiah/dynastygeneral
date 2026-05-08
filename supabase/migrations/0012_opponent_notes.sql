-- Counterparty-stated-plans: structured notes the user types when an
-- opponent says something quotable about their build, plan, or trade
-- intent. The opponent's own words become named-pressure ammunition
-- for trade construction (per coach trade-creativity Rule 5; per
-- the Opponent Dossier moat pattern).
--
-- Today the user pastes opponent statements into the Coach prompt as
-- free-form text. Coach then handles them per system-prompt rule
-- "USE the opponent's own words as ammunition" but the data does
-- not persist across sessions. This table makes them durable.
--
-- Per founder memory project_opponent_dossier_pattern: this is the
-- single most-named "I'd pay for this intelligence" feature. Schema
-- ships first; the small UI control + Coach context plumbing land
-- alongside in the same commit. The full Opponent Dossier (trade
-- history, trigger conditions, psychological labels) accretes on
-- this table over time.

create table if not exists public.opponent_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  league_id text not null,
  -- Sleeper roster_id of the opponent the note is about. The
  -- (league_id, opponent_roster_id, user_id) triple lets a user keep
  -- separate notes per league per opponent. Stored as int because
  -- Sleeper roster_ids are 1-indexed integers.
  opponent_roster_id integer not null,
  -- Free-form user text. The opponent's stated plan / quote / trade
  -- intent / behavioral observation. We do NOT structure this further
  -- yet; per opponent dossier pattern, the user's own framing IS the
  -- intelligence.
  body text not null,
  -- Optional category for the chip. "stated_plan" | "trade_intent" |
  -- "trigger_condition" | "psych_read" | "other". Lets the Coach
  -- context surface them with the right framing rule.
  kind text not null default 'stated_plan',
  -- When the user logged it. Most-recent-first when surfaced to Coach.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opponent_notes_lookup
  on public.opponent_notes (user_id, league_id, opponent_roster_id, created_at desc);

alter table public.opponent_notes enable row level security;

drop policy if exists "users read their own opponent notes" on public.opponent_notes;
create policy "users read their own opponent notes"
  on public.opponent_notes for select
  using (auth.uid() = user_id);

drop policy if exists "users write their own opponent notes" on public.opponent_notes;
create policy "users write their own opponent notes"
  on public.opponent_notes for insert
  with check (auth.uid() = user_id);

drop policy if exists "users update their own opponent notes" on public.opponent_notes;
create policy "users update their own opponent notes"
  on public.opponent_notes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users delete their own opponent notes" on public.opponent_notes;
create policy "users delete their own opponent notes"
  on public.opponent_notes for delete
  using (auth.uid() = user_id);

-- Trigger to keep updated_at fresh on edits.
create or replace function public.touch_opponent_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists opponent_notes_updated_at on public.opponent_notes;
create trigger opponent_notes_updated_at
  before update on public.opponent_notes
  for each row
  execute function public.touch_opponent_notes_updated_at();
