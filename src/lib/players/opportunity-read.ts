/**
 * Opportunity READ (CANONICAL).
 *
 * Turns the canonical OpportunityProfile (snap share, targets/game, aDOT,
 * red-zone targets, drop rate) for the most-recent two seasons into a
 * display-ready, trend-aware role read. ONE place owns the role-description
 * string AND the rising/falling threshold, so the inflection scorecard
 * signal (buildOpportunitySignal) and the candidate-card detail render
 * cite identical numbers and identical trend calls. No re-derivation.
 *
 * Direction is TREND-based (this season vs last), not an absolute level: a
 * high snap share is normal for a featured starter and says little, but a
 * FALLING role is the leading edge of decline. snap share is primary; when
 * it is absent both seasons, per-game targets is the fallback. With only
 * one season of role data there is no trend, so the level is reported and
 * the trend is "flat" with an honest no-prior-year detail.
 *
 * Type-only dependency on season-stats, so this is safe to import on the
 * server hub render without pulling the fetch/zod machinery into a bundle.
 * Registered in CANONICAL_SOURCES.md.
 *
 * Per the dynasty-canon-keeper grounding (2026-05-25): opportunity is the
 * research-defensible usage signal. This read informs a PROJECTION display,
 * never a value-scale multiplier.
 */

import type { OpportunityProfile } from "./season-stats";

// A snap-share swing of >= 7 percentage points (e.g. 65% -> 58%) is a
// material role change; below that is season-to-season noise. The
// per-game-target fallback (used when snap share is absent in either
// season) trips at >= 1.0 target/game.
const SNAP_SHARE_MATERIAL_DELTA = 0.07;
const TARGETS_PG_MATERIAL_DELTA = 1.0;

export type OpportunityTrend = "rising" | "falling" | "flat" | "single_season";

export type OpportunityRead = {
  /** Role readout, e.g. "49% snaps, 4.6 tgt/g, 5 aDOT, 0.4 RZ tgt/g". */
  line: string;
  /** Direction of the year-over-year role change (flat when no prior year). */
  trend: OpportunityTrend;
  /** Plain-English trend detail, e.g. "snap share up 14 pts from 35%". */
  detail: string;
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

// Snap-share deltas are reported in percentage POINTS, not percent: a
// 35% -> 49% rise is +14 pts, not +14%. Units matter (BRAND_VOICE rule 3).
function ppt(delta: number): string {
  return `${Math.round(delta * 100)} pts`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Human-readable role readout from a single season's profile. */
export function describeRole(prof: OpportunityProfile): string {
  const parts: string[] = [];
  if (prof.snap_share != null) parts.push(`${pct(prof.snap_share)} snaps`);
  if (prof.targets_per_game != null)
    parts.push(`${round1(prof.targets_per_game)} tgt/g`);
  if (prof.adot != null) parts.push(`${round1(prof.adot)} aDOT`);
  if (prof.rz_targets_per_game != null)
    parts.push(`${round1(prof.rz_targets_per_game)} RZ tgt/g`);
  if (prof.drop_rate != null) parts.push(`${pct(prof.drop_rate)} drop rate`);
  return parts.join(", ");
}

/**
 * The shared role read. Returns null when the prior season carries no
 * role data at all (a rookie, an injury year, a pre-rotation season) so
 * callers degrade to data_missing / hide the line gracefully.
 */
export function readOpportunity(args: {
  prev: OpportunityProfile | null;
  prevPrev: OpportunityProfile | null;
}): OpportunityRead | null {
  const { prev, prevPrev } = args;
  const prevHasRole =
    prev != null && (prev.snap_share != null || prev.targets_per_game != null);
  if (!prevHasRole || prev == null) return null;

  const line = describeRole(prev);

  // Trend on snap share (preferred) or per-game targets (fallback).
  if (prev.snap_share != null && prevPrev?.snap_share != null) {
    const delta = prev.snap_share - prevPrev.snap_share;
    if (delta >= SNAP_SHARE_MATERIAL_DELTA) {
      return {
        line,
        trend: "rising",
        detail: `snap share up ${ppt(delta)} from ${pct(prevPrev.snap_share)}`,
      };
    }
    if (delta <= -SNAP_SHARE_MATERIAL_DELTA) {
      return {
        line,
        trend: "falling",
        detail: `snap share down ${ppt(Math.abs(delta))} from ${pct(prevPrev.snap_share)}`,
      };
    }
    return {
      line,
      trend: "flat",
      detail: `snap share stable vs ${pct(prevPrev.snap_share)}`,
    };
  }

  if (prev.targets_per_game != null && prevPrev?.targets_per_game != null) {
    const delta = prev.targets_per_game - prevPrev.targets_per_game;
    if (delta >= TARGETS_PG_MATERIAL_DELTA) {
      return {
        line,
        trend: "rising",
        detail: `targets up ${round1(delta)}/g from ${round1(prevPrev.targets_per_game)}`,
      };
    }
    if (delta <= -TARGETS_PG_MATERIAL_DELTA) {
      return {
        line,
        trend: "falling",
        detail: `targets down ${round1(Math.abs(delta))}/g from ${round1(prevPrev.targets_per_game)}`,
      };
    }
    return {
      line,
      trend: "flat",
      detail: `targets stable vs ${round1(prevPrev.targets_per_game)}/g`,
    };
  }

  // Only one season of role data: report the level, claim no direction.
  return {
    line,
    trend: "single_season",
    detail: "one season of role data; no prior-year trend",
  };
}
