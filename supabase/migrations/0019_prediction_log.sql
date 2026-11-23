-- Prediction ledger (stats-steward). RED TIER: do NOT apply until Isaiah approves.
--
-- Append-only log of model predictions made BEFORE the outcome is known,
-- with a baseline prediction alongside so the model can be scored against
-- a no-skill reference once `resolve_after` passes. `prediction_type` is a
-- registry id such as `value_decay@v1`. Service role only: RLS is enabled
-- with no public policies, so anon / authenticated clients see nothing.

create table if not exists public.prediction_log (
  id uuid primary key default gen_random_uuid(),
  prediction_type text not null,
  subject_kind text not null
    check (subject_kind in ('player', 'team', 'league', 'cohort')),
  subject_id text not null,
  league_id text,
  logged_at timestamptz not null default now(),
  resolve_after date not null,
  predicted numeric not null,
  -- { "p25": number, "p75": number } when the type emits a band.
  predicted_band jsonb,
  baseline_predicted numeric not null,
  -- Inputs snapshot incl. source and snapshot date, so the row is auditable.
  inputs jsonb not null,
  source text not null
    check (source in ('shadow_weekly', 'surfaced_advice', 'cohort')),
  resolved_at timestamptz,
  outcome numeric,
  score jsonb,
  voided_reason text
);

-- Idempotent weekly runs: one row per type + subject + league per UTC day.
-- Expression index (not a table constraint) because it casts logged_at, and
-- coalesce makes a null league_id participate in uniqueness.
create unique index if not exists prediction_log_daily_unique
  on public.prediction_log (
    prediction_type,
    subject_kind,
    subject_id,
    coalesce(league_id, ''),
    ((logged_at at time zone 'UTC')::date)
  );

-- The resolver scans unresolved rows that are due.
create index if not exists prediction_log_due
  on public.prediction_log (prediction_type, resolve_after)
  where resolved_at is null;

alter table public.prediction_log enable row level security;
-- Intentionally no policies: service role only.
