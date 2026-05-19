-- Class strength per-league override.
-- Migration 0014. Extends league_doctrines with a class_strength
-- JSONB column so users can override the FantasyCalc-derived
-- per-position class multipliers for their specific draft.
--
-- Per founder direction 2026-05-16: derive class strength from data
-- (FantasyCalc top-N rookies per position) by default, but allow the
-- user to hand-author overrides for their specific league at the
-- start of the draft.
--
-- Shape: jsonb of Partial<Record<Position, number>>. Example:
--   { "RB": 1.20, "WR": 0.95 }
-- Missing positions fall through to the FantasyCalc-derived value.

set search_path = public;

alter table public.league_doctrines
  add column if not exists class_strength jsonb not null default '{}'::jsonb;

comment on column public.league_doctrines.class_strength is
  'Per-position class-strength overrides for the rookie class. Sparse: only positions the user explicitly set. Missing positions fall through to FantasyCalc-derived values.';
