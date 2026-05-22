/**
 * Plays. Multi-pick intentional sequences where the FIRST pick's
 * value is conditional on follow-through moves. Founder direction
 * 2026-05-20: "I want to feel like the shark, not the mark. A pick
 * isn't genius in isolation. It's genius if I use it well. We have
 * to help me see it, choose it, and then remember it / stay
 * disciplined."
 *
 * The four verbs split the architecture:
 *   SEE      → detect.ts identifies plays the current winner enables
 *              and exposes them on Decision.plays_this_enables.
 *   CHOOSE   → client commits via localStorage (plays-storage.ts).
 *   REMEMBER → ActivePlaysPanel reads localStorage on the hub.
 *   DISCIPLINE → The Call cross-references active plays against
 *                upcoming candidates and surfaces "advances play"
 *                or "deviates from play" badges.
 *
 * Phase 1 library (in library.ts):
 *   - QB-WR Stack (correlated upside)
 *   - Anchor RB + Handcuff (injury insurance)
 *   - Bridge QB → Developmental QB (SF / 2QB succession)
 */

import type { Position } from "../archetypes/schema";

export type PlayArchetype =
  | "qb_wr_stack"
  | "anchor_handcuff"
  | "bridge_qb"
  | "qb_hoard"
  | "lane_path";

/**
 * Graduated urgency for a play or a partner. Derived from survival
 * math (the canonical `urgencyFromSurvival` in urgency.ts), never a
 * fixed pick window. act_now = the piece goes before your next turn;
 * no_rush = it sits comfortably for at least a round.
 */
export type Urgency =
  | "act_now"
  | "this_round"
  | "two_round_cushion"
  | "no_rush";

/**
 * Format requirements that gate whether a play type may be emitted.
 * The engine MUST NOT emit a play whose gates are unsatisfied (see
 * CANONICAL_SOURCES.md "Play format gates"). All fields optional; an
 * empty object means the play has no format requirement.
 */
export type FormatGates = {
  requires_superflex?: boolean;
  requires_te_premium?: boolean;
  forbid_te_premium?: boolean;
  requires_1qb_starter?: boolean;
  requires_dynasty?: boolean;
  requires_deep_bench_min?: number;
};

/**
 * Per-partner survival readout, computed from the canonical
 * `survivalPctFor` to the user's next contested pick. Optional so
 * older stored PlayCommitment objects (localStorage) still parse.
 */
export type PartnerSurvival = {
  /** P(survives) to the user's next pick, 0-100. */
  pct: number;
  /** Sensitivity-band bounds (demand estimate +/- 25%). */
  ci_low: number;
  ci_high: number;
  /** The pick number survival is computed to. */
  to_pick_no: number;
  /** Graduated urgency for THIS partner. */
  urgency: Urgency;
};

export type PlayPlayerRef = {
  player_id: string;
  name: string;
  position: Position;
  team: string | null;
  /** Market value (FantasyCalc/KTC) used to EV-weight urgency. */
  ktc_value?: number | null;
  /** Survival readout; absent when no live contested gap exists. */
  survival?: PartnerSurvival | null;
};

export type Play = {
  /** Archetype identifier. */
  archetype: PlayArchetype;
  /** Human label: "Mayfield + Bucs Stack" or "McCaffrey Anchor + Handcuff." */
  name: string;
  /** The primary pick that triggers the play. */
  primary_player: PlayPlayerRef;
  /** Voice A thesis: why the play wins when executed. */
  upside_thesis: string;
  /** The follow-through move the user must execute. */
  followthrough: {
    /** Voice A description: "Take a Bucs skill player in the next 4 rounds." */
    description: string;
    /** Specific player candidates that satisfy the follow-through. */
    target_candidates: PlayPlayerRef[];
    /** Pick window after primary pick after which the play lapses. */
    picks_window: number;
  };
  /** Voice A line: "Genius if you stack a Bucs WR. Average otherwise." */
  genius_vs_average_line: string;
  /**
   * Overall play urgency, derived from the urgent EV-weighted partner
   * (canonical `derivePlayUrgency`). Absent when no partner carries a
   * survival readout (no live contested gap).
   */
  play_urgency?: Urgency;
  /** Format requirements that gated this play's emission. */
  format_gates?: FormatGates;
  /**
   * True when the roster ALREADY meets the play's conditions, so it is
   * running whether or not the user explicitly commits (e.g. QB Hoard
   * with the QBs in hand, or a build the roster FITS). The user can
   * still commit it (to govern pick/trade discipline) or dismiss it.
   * Founder direction 2026-05-21: "I don't need to commit to be on one
   * if I've met the conditions of it."
   */
  auto_active?: boolean;
};

/**
 * A player-vs-active-play match the UI uses to badge candidates that
 * advance a committed play. Computed client-side by cross-referencing
 * active plays (localStorage) against decision.top_candidates.
 */
export type PlayMatch = {
  /** Which active play this candidate advances. */
  play_archetype: PlayArchetype;
  play_name: string;
  /** Why this candidate advances the play. */
  fit_reason: string;
};

/**
 * A committed play stored in localStorage. Shaped to be stable across
 * sessions; never write league_id-tied state to global localStorage.
 */
export type PlayCommitment = {
  /** Stable id for this commitment (uuid or timestamp-based). */
  commitment_id: string;
  archetype: PlayArchetype;
  play_name: string;
  league_id: string;
  primary_player: PlayPlayerRef;
  /** Snapshot of the follow-through targets at commit time. */
  followthrough_targets: PlayPlayerRef[];
  followthrough_description: string;
  /** Pick the user committed at (so we know the play window). */
  committed_at_pick_no: number;
  /** Pick number after which the play lapses (committed + window). */
  lapses_after_pick_no: number;
  /** ISO timestamp. */
  committed_at: string;
  /** "active" | "executed" | "lapsed" | "abandoned" */
  status: "active" | "executed" | "lapsed" | "abandoned";
  /** When executed, which player satisfied it. */
  executed_with?: PlayPlayerRef;
  executed_at_pick_no?: number;
};
