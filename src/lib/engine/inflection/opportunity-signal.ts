/**
 * Inflection opportunity signal (CANONICAL).
 *
 * Turns the canonical OpportunityProfile (snap share, targets/game, aDOT,
 * red-zone targets, drop rate) into one inflection-scorecard signal for
 * the aging-cliff windows. Per the dynasty-canon-keeper grounding
 * (2026-05-25, ARCHITECTURE_UNIFICATION_PLAN.md addendum): opportunity is
 * THE research-defensible usage signal. Target / weighted-opportunity
 * share is sticky (~0.70 year over year) and ~0.95 correlated with PPR,
 * so a rising or eroding earned role is a real read on whether an aging
 * player holds his production. Raw production stickiness alone is mostly
 * autocorrelation.
 *
 * Direction is TREND-based (this season's role vs last season's), not an
 * absolute threshold. A high snap share is normal for a featured starter
 * and says little about the cliff; a FALLING one is the leading edge of
 * role loss. When only one season of role data exists (no prior to
 * compare), the level is reported but the direction stays neutral, since
 * a single snapshot does not argue a story. data_missing when the prior
 * season carries no snap-share or per-game-target data.
 *
 * Consumes buildOpportunityProfile; never re-derives snap share / aDOT /
 * drop rate inline. Registered in CANONICAL_SOURCES.md.
 *
 * Confidence is "partial": the underlying signal (opportunity) is
 * research-backed, but the material-change threshold below is an
 * observation-tier heuristic until the Phase 2 logistic fit calibrates
 * it. Marking it "validated" would over-claim the threshold.
 */

import type { Position } from "../../strategy/archetypes/schema";
import type { OpportunityProfile } from "@/lib/players/season-stats";
import type { InflectionSignal } from "./types";

// A snap-share swing of >= 7 percentage points (e.g. 65% -> 58%) is a
// material role change; below that is season-to-season noise. The
// per-game-target fallback (used when snap share is absent in either
// season) trips at >= 1.0 target/game.
const SNAP_SHARE_MATERIAL_DELTA = 0.07;
const TARGETS_PG_MATERIAL_DELTA = 1.0;

const OPPORTUNITY_CITATION =
  "Opportunity stickiness ~0.70 YoY, ~0.95 corr with PPR (dynasty-canon-keeper grounding 2026-05-25)";

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
function describeRole(prof: OpportunityProfile): string {
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

export function buildOpportunitySignal(args: {
  position: Position;
  prev: OpportunityProfile | null;
  prevPrev: OpportunityProfile | null;
}): InflectionSignal {
  const { position, prev, prevPrev } = args;
  const base: Pick<
    InflectionSignal,
    "name" | "description" | "confidence" | "citation"
  > = {
    name:
      position === "RB"
        ? "Pass-down role + snap share"
        : "Earned opportunity (snap share + targets)",
    description:
      position === "RB"
        ? "Snap share and per-game targets. High pass involvement is the strongest 'ages better' signal for RBs; a pure early-down workhorse cliffs harder."
        : "Snap share and per-game targets. Role volume is the stickiest, most predictive usage signal for receivers.",
    confidence: "partial",
    citation: OPPORTUNITY_CITATION,
  };

  // No prior-season role data at all -> honest data_missing.
  const prevHasRole =
    prev != null && (prev.snap_share != null || prev.targets_per_game != null);
  if (!prevHasRole || prev == null) {
    return {
      ...base,
      direction: "data_missing",
      observation: "Snap share / per-game targets not in the prior-season feed.",
    };
  }

  const prevRole = describeRole(prev);

  // Trend on snap share (preferred) or per-game targets (fallback).
  if (prev.snap_share != null && prevPrev?.snap_share != null) {
    const delta = prev.snap_share - prevPrev.snap_share;
    let direction: InflectionSignal["direction"];
    let trendWord: string;
    if (delta >= SNAP_SHARE_MATERIAL_DELTA) {
      direction = "story_a";
      trendWord = `up ${ppt(delta)} from ${pct(prevPrev.snap_share)}`;
    } else if (delta <= -SNAP_SHARE_MATERIAL_DELTA) {
      direction = "story_b";
      trendWord = `down ${ppt(Math.abs(delta))} from ${pct(prevPrev.snap_share)}`;
    } else {
      direction = "neutral";
      trendWord = `stable vs ${pct(prevPrev.snap_share)}`;
    }
    return {
      ...base,
      direction,
      observation: `${prevRole} (snap share ${trendWord}).`,
    };
  }

  if (prev.targets_per_game != null && prevPrev?.targets_per_game != null) {
    const delta = prev.targets_per_game - prevPrev.targets_per_game;
    let direction: InflectionSignal["direction"];
    let trendWord: string;
    if (delta >= TARGETS_PG_MATERIAL_DELTA) {
      direction = "story_a";
      trendWord = `up ${round1(delta)}/g from ${round1(prevPrev.targets_per_game)}`;
    } else if (delta <= -TARGETS_PG_MATERIAL_DELTA) {
      direction = "story_b";
      trendWord = `down ${round1(Math.abs(delta))}/g from ${round1(prevPrev.targets_per_game)}`;
    } else {
      direction = "neutral";
      trendWord = `stable vs ${round1(prevPrev.targets_per_game)}/g`;
    }
    return {
      ...base,
      direction,
      observation: `${prevRole} (targets ${trendWord}).`,
    };
  }

  // Only one season of role data: report the level, no direction. A single
  // snapshot of a featured role does not argue cliff vs continuation.
  return {
    ...base,
    direction: "neutral",
    observation: `${prevRole} (one season of role data; no prior-year trend).`,
  };
}
