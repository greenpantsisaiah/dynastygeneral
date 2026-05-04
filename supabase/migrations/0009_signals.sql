-- Signals schema. Phase 0 of the build plan.
--
-- Three tables for the engine's evaluation inputs:
--   player_signals : per-player, slowly-changing signals (volume,
--                    efficiency, career-stage, contract, v1 transition)
--   team_signals   : per-team signals (OL, coaching, scheme)
--   player_health  : per-player injury / risk signals
--
-- Plus an audit log:
--   signal_changes : append-only log of every field write
--
-- Service role writes (cron jobs + admin console). Authenticated users
-- with admin claim can read for the admin UI. End users do not read
-- these tables directly; they read evaluation output via evaluate().

create table if not exists player_signals (
  player_id text primary key,
  position text,
  team text,
  age numeric,
  -- volume signals (last completed season)
  snap_share_prior_year numeric,
  route_participation_prior_year numeric,
  target_share_prior_year numeric,
  rush_share_prior_year numeric,
  weighted_opportunity_prior_year numeric,
  high_value_touches_prior_year numeric,
  -- efficiency signals (last completed season)
  yprr_prior_year numeric,
  adot_prior_year numeric,
  epa_per_play_prior_year numeric,
  cpoe_prior_year numeric,
  -- career-stage signals
  draft_round int,
  draft_pick_no int,
  ras numeric,
  college_dominator numeric,
  breakout_age numeric,
  weight_lb int,
  height_in int,
  -- contract signals
  contract_years_remaining int,
  recent_extension_flag boolean,
  contract_year_flag boolean,
  -- v1 transition signals (player-level)
  rb_role_tier text,
  rb_traded_offseason_flag boolean,
  rb_role_at_new_team_projected text,
  rb_passdown_share_prior_year numeric,
  compounding_news_count int default 0,
  -- meta
  source_attribution jsonb default '{}'::jsonb,
  confidence_per_field jsonb default '{}'::jsonb,
  last_updated timestamptz not null default now(),
  updated_by text
);

create index if not exists player_signals_position_idx
  on player_signals (position);
create index if not exists player_signals_team_idx
  on player_signals (team);

create table if not exists team_signals (
  team text primary key,
  -- OL signals
  ol_continuity_score numeric,
  ol_grade_run numeric,
  ol_grade_pass numeric,
  rookie_ol_starters_count int default 0,
  rookie_ol_position_breakdown jsonb default '{}'::jsonb,
  -- coaching signals
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
  scheme_pace numeric,
  pass_rate_neutral numeric,
  personnel_12_rate numeric,
  -- meta
  source_attribution jsonb default '{}'::jsonb,
  last_updated timestamptz not null default now(),
  updated_by text
);

create table if not exists player_health (
  player_id text primary key,
  games_missed_3yr int default 0,
  injury_history jsonb default '[]'::jsonb,
  chronic_flag boolean default false,
  current_status text,
  off_field_flag boolean default false,
  holdout_flag boolean default false,
  last_updated timestamptz not null default now()
);

create table if not exists signal_changes (
  id bigserial primary key,
  table_name text not null,
  row_id text not null,
  field text not null,
  old_value jsonb,
  new_value jsonb,
  changed_by text not null,
  rationale text,
  changed_at timestamptz not null default now()
);

create index if not exists signal_changes_row_idx
  on signal_changes (table_name, row_id);
create index if not exists signal_changes_changed_at_idx
  on signal_changes (changed_at desc);

-- RLS policies
alter table player_signals enable row level security;
alter table team_signals enable row level security;
alter table player_health enable row level security;
alter table signal_changes enable row level security;

-- Anyone authenticated can read; admin gate is enforced at the
-- application layer via ADMIN_EMAILS for write operations. Service
-- role bypasses RLS for cron jobs.
create policy "authenticated can read player_signals"
  on player_signals for select
  using (auth.role() = 'authenticated');

create policy "authenticated can read team_signals"
  on team_signals for select
  using (auth.role() = 'authenticated');

create policy "authenticated can read player_health"
  on player_health for select
  using (auth.role() = 'authenticated');

create policy "authenticated can read signal_changes"
  on signal_changes for select
  using (auth.role() = 'authenticated');
