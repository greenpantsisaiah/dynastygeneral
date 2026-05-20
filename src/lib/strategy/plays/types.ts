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
  | "bridge_qb";

export type PlayPlayerRef = {
  player_id: string;
  name: string;
  position: Position;
  team: string | null;
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
