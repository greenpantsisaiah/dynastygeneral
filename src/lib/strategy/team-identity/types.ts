/**
 * Team Identity. The synthesis surface that answers "this is your
 * team" instead of "here are some metrics." Per founder direction
 * 2026-05-08: characterizing the user's team has always been core
 * mission and the product has never nailed it. This module is the
 * consolidation layer on top of the existing engine outputs
 * (archetypes, inflections, position values) that produces a
 * coherent identity readout.
 *
 * Renders ABOVE the Draft Progress Panel so identity comes before
 * performance. Identity = pattern + position fingerprint + risk
 * fingerprint + forward projection + headline narrative.
 */

import type { Position } from "../archetypes/schema";

export type BuildArchetypeReadout = {
  // Top archetype name from rankArchetypes (e.g., "QB Cartel",
  // "WR Wall", "Locked Contender").
  primary_name: string;
  // Optional secondary archetype when total_score is close (a real
  // hybrid pattern). Some teams genuinely are QB Cartel + WR Wall.
  secondary_name: string | null;
  // 0..1 confidence in the primary archetype's fit.
  primary_confidence: number;
  // Plain-English description from the archetype catalog or our
  // own composition.
  description: string;
  // Phase: "acquisition" or "executing"
  phase: "acquisition" | "executing" | null;
};

export type PositionRoomFingerprint = {
  strongest: {
    position: Position;
    rank: number;
    total: number;
    // Top 1-2 named anchor players at this position on the user's
    // roster.
    anchors: string[];
    // Total FantasyCalc value at this position on the user's roster.
    value: number;
  } | null;
  weakest: {
    position: Position;
    rank: number;
    total: number;
    // How many bodies the user has at this position right now.
    count: number;
    // Required starters at this position per format_rules.
    required: number;
  } | null;
};

export type RiskFingerprint = {
  aging_cliff_count: number;
  post_injury_count: number;
  rookie_debut_count: number;
  total_inflection_windows: number;
  // Tier: low (0-1 windows), moderate (2-3), high (4+).
  tier: "low" | "moderate" | "high";
  // Plain-English summary line.
  summary: string;
  // Up to 3 named players currently in inflection windows; the
  // "this is what we're carrying" list.
  named_players: string[];
};

export type ForwardProjection = {
  // Lineup talent: sum of FantasyCalc values for the user's
  // currently-rostered starters (top N at each position by value,
  // where N comes from format_rules). Rank computed across all
  // rosters in the league using the same metric.
  lineup_talent_value: number;
  lineup_talent_rank: number;
  total_teams: number;
  // For keeper formats: predicted next-year keeper slate (top N
  // by value, where N = max_keepers).
  keeper_slate: Array<{
    player_id: string;
    player_name: string;
    value: number;
  }> | null;
  // Max keepers (for label rendering); null when not a keeper league.
  max_keepers: number | null;
};

// Closest historical NFL team comparator for the user's roster shape.
// Data layer ships ahead of the UI refresh; the redesigned panel
// will choose how to render it. Null when no match clears the
// similarity floor (early in draft, sparse roster, idiosyncratic
// shape).
export type ComparatorReadout = {
  team: string;
  season: number;
  similarity: number;
  narrative: string;
  confidence_label: "strong" | "loose";
};

export type TeamIdentity = {
  // One-line story that summarizes everything else. Renders at the
  // top of the panel; doubles as a screenshot-share line.
  headline: string;
  build: BuildArchetypeReadout;
  position_room: PositionRoomFingerprint;
  risk: RiskFingerprint;
  forward: ForwardProjection;
  // Closest NFL team comparator for the roster shape. Null when no
  // match clears the confidence floor; the panel hides the line
  // rather than forcing a weak match.
  comparator: ComparatorReadout | null;
};
