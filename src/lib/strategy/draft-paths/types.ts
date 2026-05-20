/**
 * Draft path projection types. A "path" is a candidate sequence of
 * the user's next N picks (default 5), each anchored to one of their
 * owned slots. The projector generates 3-5 paths varying by positional
 * sequence ("RB-WR-RB-WR-TE" vs "WR-WR-RB-RB-QB" vs "QB-TE-RB-WR-WR")
 * and ranks them by total expected value × dial weight × class
 * strength × roster fit.
 *
 * The data model is the dynasty equivalent of a chess engine's
 * top-N candidate lines. Phase D (UI) renders these side-by-side so
 * the user can compare positional sequences at a glance and drill
 * into the per-slot projection.
 */

import type { WhyDials } from "@/lib/rankings/why-breakdown";
import type { ClassStrength } from "@/lib/strategy/class-strength/compute";

export type PathPosition = "QB" | "RB" | "WR" | "TE";

/** A single candidate player at a slot under a positional constraint. */
export type PathCandidate = {
  player_id: string;
  name: string;
  position: PathPosition;
  team: string | null;
  age: number | null;
  is_rookie: boolean;
  /** Format-aware ADP. Null when unavailable. */
  adp: number | null;
  /** Which ADP variant resolved this number (e.g. "rookie", "dynasty_superflex"). */
  adp_variant: string | null;
  /** FantasyCalc dynasty value normalized 0-100. */
  value: number;
  /** Probability (0..1) this player is still available at the path's slot. */
  survival: number;
  /**
   * Score the path projector assigns to this player at this slot.
   * Composed: value × survival × class_strength × roster_fit × dial_bias.
   */
  expected_value: number;
};

/** One pick in a path: the slot + the position constraint + 1-3 candidates. */
export type PathPick = {
  pick_no: number;
  pick_label: string;
  round: number;
  slot: number;
  /** Positional constraint this pick imposes on the path. */
  position: PathPosition;
  /** Up to 3 candidates sorted by expected_value descending. */
  candidates: PathCandidate[];
  /** The recommended candidate (candidates[0]). Null when no candidate viable. */
  recommendation: PathCandidate | null;
  /**
   * Probability the recommended candidate is actually available at this
   * slot. Lower confidence late in the path because the upstream
   * picks introduce uncertainty.
   */
  confidence: number;
};

/** Sum of one dial's contribution to the path across all picks. */
export type PathDialInfluence = {
  dial: keyof WhyDials;
  /** Human-readable label, e.g. "Bellcow +50". */
  label: string;
  /** Sum of per-pick deltas across the path. */
  delta: number;
};

/** A complete candidate path: sequence + scoring + dial influences. */
export type DraftPath = {
  id: string;
  /** Position signature, e.g. "RB-WR-RB-WR-TE". Drives the chip the UI shows. */
  position_signature: string;
  /** Human-readable archetype label (e.g. "Anchor RB"). */
  archetype: string;
  /** Plain-English one-liner: "Lock the bellcow first, stack WR depth after." */
  why: string;
  /** Per-slot picks in order. */
  picks: PathPick[];
  /** Sum of per-pick expected_value. The thing paths are ranked by. */
  total_value: number;
  /** Sum of per-pick EV (value vs ADP, no dial bias). Honest non-dial number. */
  total_ev: number;
  /** Rank in this projection (1 = best). */
  rank: number;
  /** True for the leading path. */
  is_recommended: boolean;
  /** Top dial influences (sorted by absolute delta). */
  dial_influences: PathDialInfluence[];
};

/**
 * Picks the user has already made in this draft. Surfaced above the
 * projection so the user sees their full trajectory (locked picks +
 * projected future picks) instead of just the future. Updates live
 * as picks land via the noStore fresh-fetch pattern on traded_picks
 * + rosters.
 */
export type LockedPick = {
  pick_no: number;
  pick_label: string;
  round: number;
  player_id: string;
  player_name: string;
  position: PathPosition | string;
  team: string | null;
  age: number | null;
  is_rookie: boolean;
  /** FantasyCalc value when available; null if not resolvable. */
  value: number | null;
};

/**
 * Read of the user's roster state going into the projected picks.
 * Used both for the "your build so far" synthesis line in the UI and
 * for roster-aware archetype framing in the engine. Counts come from
 * snap.rosters[me].position_counts; anchors are the top 1-2 players
 * by FantasyCalc value at each position.
 */
export type RosterContext = {
  position_counts: Record<PathPosition, number>;
  starter_needs: Record<PathPosition, number>;
  /** Gap by position (need - count, clamped at 0). */
  gaps: Record<PathPosition, number>;
  /** Top 1-2 players at each position (already on the roster). */
  anchors: Record<PathPosition, Array<{ name: string; value: number }>>;
  /** Plain-English summary line. */
  summary: string;
  /** Total picks user has made so far in this draft. */
  picks_made: number;
};

/** Full projection output. */
export type DraftPathProjection = {
  /** The picks the user owns in this projection window. */
  my_slots: Array<{
    pick_no: number;
    pick_label: string;
    round: number;
    slot: number;
  }>;
  /**
   * Picks the user has already made in this draft. Last 5 by pick_no
   * descending; capped so the UI doesn't get crowded by 20+ picks
   * deep into the draft. Empty when the user hasn't picked yet.
   */
  locked_picks: LockedPick[];
  /** Synthesized roster state going into the projected picks. */
  roster_context: RosterContext;
  /** Candidate paths sorted by rank (best first). */
  paths: DraftPath[];
  /** Class-strength inputs used. Surfaced for provenance. */
  class_strength: ClassStrength;
  /** When the projection ran. */
  generated_at: string;
};
