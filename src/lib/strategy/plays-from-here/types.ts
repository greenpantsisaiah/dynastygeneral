/**
 * PlayFromHere. the move-level menu for THIS draft moment.
 *
 * Distinct from archetypes (multi-week strategies) and from plays
 * (counter-intel chats). A PlayFromHere is "what should I do with the
 * next 1-2 picks given where I am right now?" Each comes with
 * win-now/future deltas so the user sees how the move shifts their
 * windows, and a counter-signal list so they know when to pivot.
 *
 * Catalog is hand-authored and indexed by `applies_when` rules. The
 * selector returns the top 3-4 applicable plays, sorted by relevance.
 */

import type { LeagueFormat, Position } from "../archetypes/schema";

export type PlayFromHereDelta = {
  win_now: number; // signed integer, e.g. +18, -8
  future_value: number;
};

export type AppliesWhen = {
  formats?: LeagueFormat[];
  slot_in?: number[]; // user's draft slot (1..total_teams)
  pick_in_round_in?: number[]; // current pick's offset within round (1..total_teams)
  round_in?: number[]; // 1..N
  total_picks_made_min?: number;
  total_picks_made_max?: number;
};

/**
 * Roster-aware filtering. Each entry must pass against the user's
 * current roster for the play to apply.
 *
 * Example: "take a QB anchor" plays should set
 *   { position: "QB", max: 0 }
 * so they don't show up after the user has already drafted Allen.
 *
 * Example: "build around your QB1" plays set
 *   { position: "QB", min: 1 }
 */
export type RosterRequirement = {
  position: Position;
  min?: number;
  max?: number;
};

export type CounterSignal = {
  watch_for: string;
  if_it_fires: string;
};

// Lets a play opt into runtime resolution against the snapshot +
// available player pool. When set, the enrichment step computes a
// concrete action (e.g. "Take Trey Benson (RB-ARI, age 23)") and
// attaches named targets so the card stops reading like jargon.
export type PlayContextResolution =
  | { kind: "scarcest_position"; n_players?: number }
  | { kind: "user_top_need"; n_players?: number };

export type PlayFromHere = {
  id: string;
  title: string;
  move: string; // imperative. "Take the QB1 anchor"
  rationale: string; // why this works in this state
  delta: PlayFromHereDelta;
  chance_pays_off: number; // 0..1
  counter_signals: CounterSignal[];
  applies_when: AppliesWhen;
  roster_requirements?: RosterRequirement[]; // ALL must match user's roster
  exemplar_targets?: string[]; // descriptive. "Josh Allen-tier QB". LLM fills with real name
  // Optional: opt this play into runtime context resolution. Server
  // computes named players + concrete action based on snapshot state.
  context_resolution?: PlayContextResolution;
};

// Runtime view of a PlayFromHere with snapshot-resolved context.
// Returned by the enrichment step.
export type ResolvedPlayFromHere = PlayFromHere & {
  // Computed override of `title` and `move` when context_resolution
  // produces a concrete answer. UI prefers these when present.
  resolved_title?: string;
  resolved_move?: string;
  resolved_rationale?: string;
  // Top 1-3 named players to take. Each carries position/team/age so
  // the card can render "Trey Benson (RB-ARI, age 23)" without UI
  // having to call back into the player cache.
  named_targets?: Array<{
    player_id: string;
    name: string;
    position: string | null;
    team: string | null;
    age: number | null;
    search_rank: number;
    adp: number | null;
    is_rookie?: boolean;
    reason: string;
  }>;
};
