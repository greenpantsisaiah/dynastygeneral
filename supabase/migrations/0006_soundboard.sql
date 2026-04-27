-- Soundboard scaffold tables.
--
-- Three tables:
--   judgment_profiles  per-user dial values (currently cookie-mirrored;
--                      DB row gives cross-device sync for Pro and a
--                      stable identity for argue/suggest provenance)
--   mixer_feedback     "argue with this dial" submissions
--   mixer_suggestions  "I wish you had a dial that did X" submissions
--
-- All three are additive: no existing table is modified, no existing
-- query is affected. Engine wiring of dial values is a planned
-- follow-up. Today the dial values are stored but not yet read by
-- penalizeForConstraint / fill_starter / etc.

-- ─────────────────────────────────────────────────────────────────
-- judgment_profiles: one row per signed-in user
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.judgment_profiles (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  -- dial values stored as JSON. Schema documented in
  -- src/lib/soundboard/types.ts. Values are -100..+100 ints (most
  -- dials) or one of a small enum (e.g. position_bias).
  dials               jsonb not null default '{}'::jsonb,
  -- When the user explicitly saved (vs default). Lets us
  -- differentiate "never touched" from "touched and reset to 0."
  last_edited_at      timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists set_judgment_profiles_updated_at on public.judgment_profiles;
create trigger set_judgment_profiles_updated_at
  before update on public.judgment_profiles
  for each row execute function public.tg_set_updated_at();

alter table public.judgment_profiles enable row level security;

drop policy if exists "judgment_profiles self all" on public.judgment_profiles;
create policy "judgment_profiles self all"
  on public.judgment_profiles for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────────
-- mixer_feedback: arguments against a specific dial
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.mixer_feedback (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete set null,
  dial_id             text not null,
  -- Predefined dissent shapes plus free text. UI sends one of:
  --   "weights_too_heavy" "weights_too_light" "ignores_signal"
  --   "wrong_for_format" "other"
  shape               text not null,
  comment             text,
  -- Snapshot of context when the user argued. JSON blob:
  --   { league_id, current_decision: { pick_label, recommendation: { name, position } },
  --     dial_state: <full JudgmentProfile>, league_format, etc. }
  context             jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists mixer_feedback_dial_idx
  on public.mixer_feedback (dial_id, created_at desc);
create index if not exists mixer_feedback_user_idx
  on public.mixer_feedback (user_id, created_at desc);

alter table public.mixer_feedback enable row level security;

-- Users can insert their own feedback. Reads are admin-only (founder
-- reviews via service role). Anonymous users (user_id null) can
-- insert too, since the argue UX should work without auth.
drop policy if exists "mixer_feedback self insert" on public.mixer_feedback;
create policy "mixer_feedback self insert"
  on public.mixer_feedback for insert
  with check (user_id is null or user_id = (select auth.uid()));

drop policy if exists "mixer_feedback self read" on public.mixer_feedback;
create policy "mixer_feedback self read"
  on public.mixer_feedback for select
  using (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────────
-- mixer_suggestions: "I wish you had a dial that..."
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.mixer_suggestions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete set null,
  proposal            text not null,
  -- Optional context the user chose to attach (current league, current
  -- decision, etc.). Same shape as mixer_feedback.context.
  context             jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists mixer_suggestions_created_idx
  on public.mixer_suggestions (created_at desc);
create index if not exists mixer_suggestions_user_idx
  on public.mixer_suggestions (user_id, created_at desc);

alter table public.mixer_suggestions enable row level security;

drop policy if exists "mixer_suggestions self insert" on public.mixer_suggestions;
create policy "mixer_suggestions self insert"
  on public.mixer_suggestions for insert
  with check (user_id is null or user_id = (select auth.uid()));

drop policy if exists "mixer_suggestions self read" on public.mixer_suggestions;
create policy "mixer_suggestions self read"
  on public.mixer_suggestions for select
  using (user_id = (select auth.uid()));
