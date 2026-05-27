-- Account-level persistence for plays (the cornerstone strategic frame,
-- Principle 12).
--
-- Until now, committed plays + dismissed suggestions lived only in the
-- browser's localStorage. A user switching devices (or browsers) had to
-- re-track every play. Founder report 2026-05-26: "I still have to go
-- back and click track pretty often. It should remember on my account,
-- not just browser."
--
-- These tables mirror the expectations-ledger pattern (migration 0015):
-- one row per (user, league, stable-client-id), RLS-scoped to auth.uid().
-- The client localStorage stays as the anonymous-user fallback and as a
-- device-side cache; an upload-pass on first authed load pushes any
-- local-only rows up. The domain shapes live in
-- src/lib/strategy/plays/types.ts; read/write helpers in
-- src/lib/plays/storage-server.ts.

create table if not exists public.play_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  league_id text not null,
  -- Client-provided stable id (today: `${archetype}-${Date.now()}`).
  -- The (user_id, league_id, commitment_id) triple is unique so a
  -- re-commit of the same client object is idempotent.
  commitment_id text not null,
  archetype text not null,
  play_name text not null,
  -- Snapshot of the primary player at commit time (PlayPlayerRef).
  primary_player jsonb not null,
  -- Snapshot of the follow-through targets at commit time
  -- (PlayPlayerRef[]).
  followthrough_targets jsonb not null default '[]'::jsonb,
  followthrough_description text not null default '',
  committed_at_pick_no integer not null,
  lapses_after_pick_no integer not null,
  committed_at timestamptz not null default now(),
  -- "active" | "executed" | "lapsed" | "abandoned".
  status text not null default 'active',
  executed_with jsonb,
  executed_at_pick_no integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, league_id, commitment_id)
);

-- Most reads want a league's active set, newest first.
create index if not exists play_commitments_lookup
  on public.play_commitments (user_id, league_id, status, committed_at desc);

alter table public.play_commitments enable row level security;

drop policy if exists "users read their own play_commitments"
  on public.play_commitments;
create policy "users read their own play_commitments"
  on public.play_commitments for select
  using (auth.uid() = user_id);

drop policy if exists "users insert their own play_commitments"
  on public.play_commitments;
create policy "users insert their own play_commitments"
  on public.play_commitments for insert
  with check (auth.uid() = user_id);

drop policy if exists "users update their own play_commitments"
  on public.play_commitments;
create policy "users update their own play_commitments"
  on public.play_commitments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users delete their own play_commitments"
  on public.play_commitments;
create policy "users delete their own play_commitments"
  on public.play_commitments for delete
  using (auth.uid() = user_id);

create or replace function public.touch_play_commitments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists play_commitments_updated_at on public.play_commitments;
create trigger play_commitments_updated_at
  before update on public.play_commitments
  for each row
  execute function public.touch_play_commitments_updated_at();

-- Dismissed suggestions are stored separately so a forgiveness un-dismiss
-- is a single delete, never an update of the commitment row. Founder
-- direction 2026-05-21 "dismissed plays are forgiven; one click to
-- dismiss, one click to un-dismiss."
create table if not exists public.play_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  league_id text not null,
  -- `${archetype}:${primary_player_id}`. Stable, idempotent.
  dismissal_key text not null,
  archetype text not null,
  play_name text not null,
  dismissed_at timestamptz not null default now(),
  unique (user_id, league_id, dismissal_key)
);

create index if not exists play_dismissals_lookup
  on public.play_dismissals (user_id, league_id, dismissed_at desc);

alter table public.play_dismissals enable row level security;

drop policy if exists "users read their own play_dismissals"
  on public.play_dismissals;
create policy "users read their own play_dismissals"
  on public.play_dismissals for select
  using (auth.uid() = user_id);

drop policy if exists "users insert their own play_dismissals"
  on public.play_dismissals;
create policy "users insert their own play_dismissals"
  on public.play_dismissals for insert
  with check (auth.uid() = user_id);

drop policy if exists "users delete their own play_dismissals"
  on public.play_dismissals;
create policy "users delete their own play_dismissals"
  on public.play_dismissals for delete
  using (auth.uid() = user_id);
