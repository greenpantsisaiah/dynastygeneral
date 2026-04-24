-- Path commitments + chronicle.
--
-- Per (user, league, season) the user can commit to a strategic
-- archetype. The chronicle is an append-only log of meaningful
-- events on that commitment: committed, tightened, loosened,
-- closed, abandoned. Together they become the user's dynasty
-- decision history.
--
-- Future payoff: with N commitments across M leagues across Y
-- years, the engine can offer cross-league + multi-year insight.
-- "You always lean RB Bellcow on startup picks; here's how that's
-- worked across 3 leagues." That's the long-game value the per-row
-- denormalization (archetype_name on each commitment) protects:
-- the archetype catalog WILL evolve over years; commitments must
-- still render correctly against historical data.

-- ============================================================
-- path_commitments
-- ============================================================
create table if not exists public.path_commitments (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  league_id             text not null,
  season                text not null,           -- "2026", matches Sleeper season strings

  archetype_id          text not null,           -- "qb-cartel-anchor"
  -- Denormalized so a future archetype rename doesn't break
  -- historical commitments. The id stays stable for joins; the
  -- name is what we render to the user in the chronicle.
  archetype_name        text not null,

  -- Snapshot at commit time
  committed_at          timestamptz not null default now(),
  committed_at_pick_no  integer,                  -- "you committed at pick 1.05" (overall pick number)
  viability_at_commit   integer not null check (viability_at_commit between 0 and 100),
  state_at_commit       text    not null check (state_at_commit in ('open','narrowing','closing','closed')),

  -- Last-seen state. Updated on hub render when state changes,
  -- so the chronicle catches up automatically across visits.
  current_viability     integer check (current_viability between 0 and 100),
  current_state         text    check (current_state in ('open','narrowing','closing','closed')),
  last_seen_at          timestamptz,

  -- Optional user note. Future feature ("why I'm doing this").
  user_note             text,

  -- Set when the user explicitly abandons the path. We keep the
  -- row for cross-league/multi-year history; the abandoned_at
  -- flag lets the active query exclude it.
  abandoned_at          timestamptz,

  -- A user can only have ONE active commitment per (league, season).
  -- The unique partial index lets us enforce that without
  -- preventing re-commitment to the same archetype after abandoning.
  -- Different archetype-ids per league-season are not allowed
  -- simultaneously: you commit to one path, you ride or you abandon.
  unique (user_id, league_id, season, archetype_id)
);

create index if not exists path_commitments_user_idx
  on public.path_commitments (user_id);

create index if not exists path_commitments_user_league_season_idx
  on public.path_commitments (user_id, league_id, season);

-- Active-row lookup (one per user-league-season). Partial unique
-- index instead of a check constraint because a user CAN abandon
-- + re-commit, just not have two active commitments at once.
create unique index if not exists path_commitments_active_unique
  on public.path_commitments (user_id, league_id, season)
  where abandoned_at is null;

-- ============================================================
-- path_chronicle
-- ============================================================
-- Append-only event log per commitment. Source of the user's
-- "what happened to my path" story. UI shows newest first.
create table if not exists public.path_chronicle (
  id              uuid primary key default gen_random_uuid(),
  commitment_id   uuid not null references public.path_commitments(id) on delete cascade,
  event_at        timestamptz not null default now(),

  event_kind      text not null check (event_kind in (
    'committed',     -- initial commit
    'tightened',     -- viability dropped meaningfully
    'loosened',      -- viability rose meaningfully (rare; opponent pivots away)
    'closed',        -- path slammed shut (anchors gone)
    'just_opened',   -- closed -> open (extremely rare; usually a multi-pick reversal)
    'abandoned',     -- user explicitly walked away
    'pivoted',       -- user committed to a different path (paired with new commitment)
    'note'           -- user-authored note
  )),

  pick_no         integer,
  viability       integer check (viability between 0 and 100),
  state           text    check (state in ('open','narrowing','closing','closed')),

  narrative       text not null,           -- "Path tightened: -12 viability after Bijan went at pick 1.04"
  metadata        jsonb                    -- {triggering_picks: [...], delta: -12, ...}
);

create index if not exists path_chronicle_commitment_idx
  on public.path_chronicle (commitment_id, event_at desc);

-- ============================================================
-- Row-level security
-- ============================================================
alter table public.path_commitments enable row level security;
drop policy if exists "path_commitments_self_all" on public.path_commitments;
create policy "path_commitments_self_all" on public.path_commitments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.path_chronicle enable row level security;
drop policy if exists "path_chronicle_self_all" on public.path_chronicle;
create policy "path_chronicle_self_all" on public.path_chronicle
  for all using (
    exists (
      select 1 from public.path_commitments pc
      where pc.id = path_chronicle.commitment_id and pc.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.path_commitments pc
      where pc.id = path_chronicle.commitment_id and pc.user_id = auth.uid()
    )
  );
