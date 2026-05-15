-- Per-league doctrine overrides. The user can tune their Rankings Lab
-- dials globally (judgment_profiles, migration 0006) AND can override
-- those values per league when their roster shape calls for a different
-- posture. The override semantics cascade: any dial unset in
-- league_doctrines falls through to judgment_profiles; any dial set
-- in league_doctrines wins.
--
-- Phase 2.4 of the doctrine integration plan. The data model lands
-- here so the override logic + UI can be wired in a follow-up without
-- a migration round-trip. See INVARIANTS.md "Per-league doctrine
-- overrides" for the design + resolution rules.

create table if not exists league_doctrines (
  user_id uuid not null references auth.users(id) on delete cascade,
  league_id text not null,
  -- Sparse dial-override map. Only dials the user explicitly set on
  -- this league are stored; everything else falls through to the
  -- global judgment_profiles row at read time. Shape matches
  -- JudgmentProfile.dials (Record<DialId, DialValue>).
  dials jsonb not null default '{}'::jsonb,
  -- Per-dial WHY notes scoped to this league. Same shape as
  -- judgment_profiles.notes (Partial<Record<DialId, string>>).
  notes jsonb not null default '{}'::jsonb,
  -- When the user explicitly opted INTO league-specific tuning. NULL
  -- means the user has never enabled it for this league; the global
  -- doctrine applies as-is.
  enabled_at timestamptz,
  last_edited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, league_id)
);

create index if not exists league_doctrines_user_idx
  on league_doctrines (user_id);

-- RLS: users see only their own per-league doctrines.
alter table league_doctrines enable row level security;

create policy "users can read own league doctrines"
  on league_doctrines for select
  using (auth.uid() = user_id);

create policy "users can upsert own league doctrines"
  on league_doctrines for insert
  with check (auth.uid() = user_id);

create policy "users can update own league doctrines"
  on league_doctrines for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own league doctrines"
  on league_doctrines for delete
  using (auth.uid() = user_id);
