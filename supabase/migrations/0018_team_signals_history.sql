-- Phase B historical signal corpus (MODEL_LIVE_PLAN, sig-history). Give
-- the team coaching/scheme signals a SEASON dimension so the WR/QB/TE
-- rubric backtests can finally join the scheme fields they read.
--
-- The live `team_signals` table (migration 0009) is a single CURRENT-
-- season snapshot keyed by `team`. Phase A found that this snapshot
-- cannot validate a 2022-2024 temporal-blinded backtest: the rubrics
-- read `scheme_tag`, `oc_tenure_yrs`, `oc_first_year_with_team_flag`,
-- `hc_first_time_flag`, `staff_novelty_composite`, `pass_rate_neutral`,
-- and `personnel_12_rate`, but the historical seasons those fields
-- describe were never coded, so the A4 backtest ran the rubrics with
-- those branches null.
--
-- This migration adds a PARALLEL history table keyed `(team, season)`.
-- The live reader (`getTeamSignalsMap` in src/lib/players/player-signals.ts)
-- continues to read `team_signals` UNCHANGED, so there is zero regression
-- to live hub / Coach reads. The backtest reads `team_signals_history`
-- per decision year. When Phase D wires the rubric live, the current
-- season simply becomes the newest row in this table and the snapshot
-- table can be retired into it; that consolidation is out of scope here.
--
-- Columns mirror the coaching + scheme subset of `team_signals`. OL
-- grade columns (PFF-paid) and the rookie_ol_* columns are intentionally
-- absent: they are not part of the scheme-history corpus and no rubric
-- branch under backtest reads them historically.

create table if not exists team_signals_history (
  team text not null,
  season int not null,
  -- coaching signals (LLM-coded per season, founder-validated)
  hc_id text,
  hc_first_time_flag boolean,
  hc_tenure_yrs int,
  hc_background_tag text,
  oc_id text,
  oc_tenure_yrs int,
  oc_first_year_with_team_flag boolean,
  -- scheme signals
  scheme_tag text,
  staff_novelty_composite int default 0,
  -- derived game-script signals (nflverse pbp; per the temporal-blinding
  -- protocol these carry the PRIOR season's realized rate, the value
  -- known at preseason of `season`; see the ingest script header)
  scheme_pace numeric,
  pass_rate_neutral numeric,
  personnel_12_rate numeric,
  derived_pbp_season int,             -- which season the derived rates came from
  -- meta
  source_attribution jsonb default '{}'::jsonb,
  last_updated timestamptz not null default now(),
  updated_by text,
  primary key (team, season)
);

create index if not exists team_signals_history_season_idx
  on team_signals_history (season);

-- RLS: same posture as team_signals (service-role writes; authenticated
-- read for the admin UI). End users never read this directly.
alter table team_signals_history enable row level security;

create policy "authenticated can read team_signals_history"
  on team_signals_history for select
  using (auth.role() = 'authenticated');
