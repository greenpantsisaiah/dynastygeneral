-- Phase 1.7 / Phase 2 backtest storage. Historical market values,
-- consensus rankings, season outcomes, and hand-coded signals with
-- vintage tags for the temporal-blinding protocol.
--
-- See VALIDATION_PLAN.md section 4 (vintaging) and section 5 (backtest
-- spec). Each table is queried by (year, player_id) primarily; indexes
-- support both axes.
--
-- All tables use service-role-only writes (no RLS read policies for
-- authenticated end users yet; backtest results land in MODEL_CARD).

-- 1. Historical market values. Multiple snapshots per (player_id) at
--    different dates from different sources. Source column lets us
--    discriminate KTC vs FantasyCalc vs FantasyPros.
create table if not exists historical_market_values (
  id bigserial primary key,
  player_id text not null,             -- Sleeper player_id (canonical)
  source text not null,                -- 'ktc' / 'fantasycalc' / 'fantasypros'
  snapshot_date date not null,         -- date of the snapshot
  format text not null,                -- '1qb' / 'sf' / 'redraft'
  value numeric not null,              -- raw source value (e.g., KTC 0-9999)
  overall_rank int,                    -- overall dynasty rank at snapshot
  position_rank int,                   -- positional rank at snapshot
  position text,                       -- copied from snapshot for convenience
  raw_attributes jsonb,                -- full source record for debugging
  created_at timestamptz not null default now()
);

create index if not exists idx_historical_market_values_player
  on historical_market_values(player_id, snapshot_date);
create index if not exists idx_historical_market_values_source_date
  on historical_market_values(source, snapshot_date);
create index if not exists idx_historical_market_values_format
  on historical_market_values(format);

-- 2. Historical consensus rankings (FantasyPros, beat-reporter
--    aggregates, etc.). Distinct from market values because rankings
--    don't have a "value" scalar; they're rank-only.
create table if not exists historical_consensus_rankings (
  id bigserial primary key,
  player_id text not null,
  source text not null,                -- 'fantasypros_ecr' / 'mike_clay' / etc.
  snapshot_date date not null,
  format text not null,
  rank int not null,
  position text,
  position_rank int,
  raw_attributes jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_historical_consensus_player
  on historical_consensus_rankings(player_id, snapshot_date);
create index if not exists idx_historical_consensus_source_date
  on historical_consensus_rankings(source, snapshot_date);

-- 3. Historical outcomes. Actual fantasy points realized per
--    player-week and season totals. nflfastR / Sleeper / PFR sourced.
create table if not exists historical_outcomes (
  id bigserial primary key,
  player_id text not null,
  season int not null,
  week int,                            -- null for season-total rows
  ppr_points numeric,
  half_ppr_points numeric,
  std_points numeric,
  games_played int,
  source text not null,                -- 'sleeper' / 'nflfastr' / 'pfr'
  raw_attributes jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_historical_outcomes_player_season
  on historical_outcomes(player_id, season);
create index if not exists idx_historical_outcomes_season_week
  on historical_outcomes(season, week);

-- 4. Historical signal codes. Hand-coded or LLM-extracted signals
--    with vintage tags so the temporal-blinding harness can verify
--    no post-cutoff knowledge bled in.
create table if not exists historical_signal_codes (
  id bigserial primary key,
  player_id text,                      -- nullable for team-level signals
  team text,                           -- nullable for player-level signals
  prediction_year int not null,        -- which year this code is FOR
  signal_name text not null,           -- 'rb_role_tier' / 'scheme_tag' / etc.
  signal_value jsonb not null,         -- the coded value (string, number, bool)
  confidence text,                     -- 'high' / 'medium' / 'low'
  coded_with_knowledge_through date,   -- vintage cutoff per VALIDATION_PLAN s.4
  source_urls text[],                  -- citing sources used for the code
  source_paragraphs text[],            -- inline quotes from sources
  rationale text,                      -- why this code (free text)
  coded_by text,                       -- 'manual:user_id' / 'agent:historical-signal-extractor'
  spot_check_pass boolean,             -- true once a 10% sample re-extraction agreed
  created_at timestamptz not null default now()
);

create index if not exists idx_historical_signal_codes_target
  on historical_signal_codes(player_id, team, signal_name, prediction_year);
create index if not exists idx_historical_signal_codes_year
  on historical_signal_codes(prediction_year);

-- 5. Backtest run metadata. Each Phase 2 calibration run gets a row
--    so we can compare results over time.
create table if not exists backtest_runs (
  id bigserial primary key,
  run_label text not null,             -- e.g., 'phase2_v0_2026-07-01'
  prediction_year int not null,
  model_version text not null,
  loss_function text not null,         -- 'L_redraft' / 'L_dynasty' / etc.
  rmse numeric,
  mae numeric,
  band_coverage_pct numeric,           -- % of outcomes in 80% band
  baseline_comparisons jsonb,          -- { naive_last_year_rmse, fp_consensus_rmse, ... }
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_backtest_runs_label on backtest_runs(run_label);

-- RLS: enable but no read policies yet. Service role writes from
-- ingestion scripts; admin console reads via service role.
alter table historical_market_values enable row level security;
alter table historical_consensus_rankings enable row level security;
alter table historical_outcomes enable row level security;
alter table historical_signal_codes enable row level security;
alter table backtest_runs enable row level security;
