/**
 * Archetype schema. The shape of every named dynasty strategy in the
 * catalog. The catalog is a graph (pivots and counter-archetypes
 * reference other archetype IDs), so referential integrity matters.
 *
 * Ranking pipeline:
 *   archetype.fit_signals     → deterministic fit score against your roster
 *   archetype.opening_signals → boost when league state opens an unusual lane
 *   archetype.likelihood_modifiers (on gamble + each risk) → live %
 *
 * The LLM finalizer (Stage C) picks the final 4, customizes blurbs and
 * play templates with real player/pick names. The schema gives it a
 * vocabulary it cannot break out of, which keeps recommendations
 * consistent across sessions.
 */

export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DST";

/** All fantasy-relevant positions. The runtime companion to Position. */
export const FANTASY_POSITIONS: Position[] = [
  "QB",
  "RB",
  "WR",
  "TE",
  "K",
  "DST",
];

/**
 * Canonical player-position normalizer. Uppercases, merges DEF -> DST
 * (Sleeper uses both labels across eras for the same team-defense
 * position), and returns the Position union or null for anything that
 * is not a fantasy-relevant position (IDP positions, junk). Registered
 * in CANONICAL_SOURCES.md. Resolving position without this merge is a
 * recurring drift class: code checking `=== "DST"` silently misses
 * `DEF` and vice versa.
 */
export function normalizePosition(
  raw: string | null | undefined,
): Position | null {
  if (!raw) return null;
  const u = raw.toUpperCase();
  if (u === "DEF") return "DST";
  return FANTASY_POSITIONS.includes(u as Position) ? (u as Position) : null;
}

export type LeagueFormat = "1qb" | "superflex" | "2qb";

export type LeagueScoring = "PPR" | "half-PPR" | "standard" | "TE-premium";

export type Horizon = number; // -100 (full rebuild) ↔ +100 (max contender)

export type LeagueTone = "casual" | "competitive" | "industry";

export type ArchetypeCategory =
  | "QB Strategy"
  | "RB Strategy"
  | "WR Strategy"
  | "TE Strategy"
  | "Roster Construction"
  | "Macro Posture"
  | "Asset / Pick Strategy"
  | "Trade / Market Posture"
  | "Stacking"
  | "Positional Leverage";

// =====================================================================
// Fit signals. score this archetype against the user's roster.
// Deterministic. Evaluator returns a 0..1 score per signal; the ranker
// weights and combines them.
// =====================================================================

export type FitSignal =
  | {
      kind: "user_owns_top_n_at_position";
      position: Position;
      min?: number; // user owns at least this many
      max?: number; // user owns at most this many (inverse signal)
      rank_threshold?: number; // "top 12 at position". counts as one
      weight?: number; // default 1.0
    }
  | {
      kind: "user_position_count";
      position: Position;
      min?: number;
      max?: number;
      weight?: number;
    }
  | {
      kind: "league_format";
      format: LeagueFormat | LeagueFormat[];
      weight?: number;
    }
  | {
      kind: "league_scoring";
      includes: LeagueScoring | LeagueScoring[];
      weight?: number;
    }
  | {
      kind: "user_record";
      wins_min?: number;
      wins_max?: number;
      games_min?: number;
      weight?: number;
    }
  | {
      kind: "user_roster_avg_age";
      min?: number;
      max?: number;
      weight?: number;
    }
  | {
      kind: "user_owns_future_picks";
      season: number; // e.g. 2027
      round: 1 | 2 | 3;
      min?: number;
      weight?: number;
    };

// =====================================================================
// Likelihood modifiers. adjust gamble or risk likelihood live, based
// on current league state. These are what makes the % move pick-by-pick.
// =====================================================================

export type LikelihoodModifier =
  | {
      kind: "league_position_scarcity_after_round";
      position: Position;
      round: number;
      threshold_teams_without: number;
      delta: number; // applied if active
      rationale: string; // template, e.g. "{{n}}/{{total}} teams still QB-less after Rd 2"
    }
  | {
      kind: "opposing_archetype_overlap"; // counter-intel; Stage B no-op
      archetype_id: string;
      min_overlap: number;
      delta: number;
      rationale: string;
    }
  | {
      kind: "league_format_match";
      format: LeagueFormat;
      delta: number;
      rationale: string;
    }
  | {
      kind: "user_owns_top_n_at_position";
      position: Position;
      n: number;
      delta: number;
      rationale: string;
    }
  | {
      kind: "opposing_position_depth_avg";
      position: Position;
      below_threshold?: number;
      above_threshold?: number;
      delta: number;
      rationale: string;
    }
  | {
      kind: "weeks_into_season"; // in-season; Stage A no-op
      min?: number;
      max?: number;
      delta: number;
      rationale: string;
    };

// =====================================================================
// Opening signals. special class. Detect when an archetype is
// unusually viable RIGHT NOW because of what other teams have/haven't
// done. The ranker can surface an opening even when fit_signals are
// weak: this is the "QB hole opens up in front of you" insight.
// =====================================================================

export type OpeningSignal =
  | {
      kind: "league_position_scarcity_after_round";
      position: Position;
      round: number;
      threshold_teams_without: number;
      label: string; // e.g. "QB hole in front of you"
    }
  | {
      kind: "league_position_overdrafted_through_round";
      position: Position;
      round: number;
      threshold_picks: number;
      label: string;
    };

// =====================================================================
// Required moves. what the user must do to execute this archetype.
// =====================================================================

export type Priority = "critical" | "high" | "medium" | "low";

export type TimingTag =
  | `wk:${number}` // single week
  | `wk:${number}-${number}` // week range
  | "this-draft"
  | "this-week"
  | "next-trade-window"
  | "off-season";

// Completion check. Lets the system flag a required_move as already
// done so the UI can mark it complete instead of showing it as "still
// critical." Without this, a "Acquire 3rd QB before Wk4" move stays
// red even when the user already drafted three QBs in rounds 1-3.
export type CompletionCheck =
  | { kind: "min_position_count"; position: Position; min: number }
  | { kind: "max_position_count"; position: Position; max: number };

export type RequiredMove = {
  description: string;
  by_when: TimingTag;
  priority: Priority;
  // Optional state predicate. If present and satisfied at evaluation
  // time, the move renders as completed (struck-through, demoted out
  // of "critical" tone). Omit for moves that can't be auto-checked
  // (negotiation guidance, "don't sell early," etc.).
  completion_check?: CompletionCheck;
};

// Runtime representation of a required move with completion state
// resolved against a snapshot. Returned alongside RankedArchetype.
export type EvaluatedRequiredMove = RequiredMove & {
  completed: boolean;
};

// =====================================================================
// Pivots. the graph that makes strategies adaptive. Each trigger has
// 1+ branches pointing at other archetype IDs. Catalog must keep
// referential integrity (validated at startup).
// =====================================================================

export type PivotTrigger =
  | {
      kind: "anchor_injury";
      position: Position;
      duration_weeks_min: number;
    }
  | {
      kind: "opposing_archetype_overlap";
      archetype_id: string;
      min: number;
    }
  | {
      kind: "league_market_shift";
      signal: string; // e.g. "WR scarcity"
      direction: "up" | "down";
    }
  | {
      kind: "own_strategy_drift";
      drift_threshold: number; // 0..1
    }
  | {
      kind: "approaching_byes";
      positions: Position[];
    }
  | {
      kind: "user_record_collapse";
      wins_max: number;
      games_min: number;
    };

export type PivotBranch = {
  archetype_id: string;
  why: string;
  timing_window?: TimingTag;
};

export type Pivot = {
  trigger: PivotTrigger;
  branches: PivotBranch[];
  transition_plays?: Play[]; // messages that smooth/disguise the pivot
};

// =====================================================================
// Plays. the counter-intel + negotiation layer. Suggested chats,
// probes, market-making moves. Copy-only in v1: user pastes into
// Sleeper themselves.
// =====================================================================

export type PlayIntent =
  | "probe"
  | "market-make"
  | "misdirect"
  | "pressure"
  | "setup"
  | "verify-archetype"
  | "negotiate";

export type PlayChannel = "dm" | "all-chat" | "trade-message";

export type PlayTargetKind =
  | "specific-opponent"
  | "all-league"
  | "specific-archetype-holder";

export type PlayTone =
  | "friendly"
  | "casual"
  | "needling"
  | "professional"
  | "fishing";

export type PlayExclusivity =
  | "single-use"
  | "burns-rapport"
  | "safe-to-repeat";

export type ReadGuide = {
  if_they_say: string; // pattern, sentiment, or behavior (e.g. "silence from {{team}}")
  it_likely_means: string;
  recommended_action: string;
};

export type TimingHint =
  | { kind: "weeks_into_season"; min?: number; max?: number }
  | { kind: "approaching_byes"; positions: Position[] }
  | { kind: "after_pick"; number: number }
  | { kind: "on_clock"; who: "me" | "opponent" }
  | { kind: "during_draft" }
  | { kind: "any_time" };

export type Play = {
  id: string;
  intent: PlayIntent;
  channel: PlayChannel;
  target_kind: PlayTargetKind;
  target_archetype?: string; // populated when intent = verify-archetype | pressure
  tone: PlayTone;
  template: string; // {{vars}} filled by LLM finalizer with real names/picks/weeks
  read_their_response: ReadGuide[];
  follow_up?: string; // ID of next play if useful signal lands
  best_when: TimingHint[];
  risks: string[];
  exclusivity?: PlayExclusivity;
  min_league_tone?: LeagueTone; // hide spicier plays in casual leagues
};

// =====================================================================
// The thing itself.
// =====================================================================

export type Gamble = {
  statement: string;
  base_likelihood: number; // 0..1
  likelihood_modifiers: LikelihoodModifier[];
};

export type Risk = {
  statement: string;
  base_likelihood: number; // 0..1
  likelihood_modifiers: LikelihoodModifier[];
};

export type Archetype = {
  id: string; // kebab-case, stable, e.g. "qb-cartel-anchor"
  name: string; // display, e.g. "QB Cartel"
  category: ArchetypeCategory;
  tagline: string; // one-line gambit
  horizon: Horizon;

  the_gamble: Gamble;
  the_risks: Risk[];

  fit_signals: FitSignal[];
  opening_signals?: OpeningSignal[];
  required_moves: RequiredMove[];
  pivots: Pivot[];

  plays?: Play[]; // archetype-level plays (intel + market-making while running this build)

  counter_archetypes?: string[]; // IDs this preys on or is preyed on by
  exemplar_profiles?: string[]; // descriptive, e.g. "Top-12 QB anchor"
};

// =====================================================================
// Enriched output of the ranker (what the UI consumes).
// =====================================================================

export type ActiveModifier = {
  rationale: string; // already-templated, real numbers substituted
  delta: number;
};

export type LiveLikelihood = {
  pct: number; // 0..1
  base: number;
  active_modifiers: ActiveModifier[];
};

export type ActiveOpening = {
  label: string;
  signal_kind: OpeningSignal["kind"];
  // 0..1 strength. Decays as the qualifying population covers itself.
  // 1.0 = signal still as strong as when it first fired. 0.5 = half
  // closed. Below ~0.1 the opening is considered inactive and not
  // surfaced. Lets UI fade the badge instead of binary on/off.
  strength: number;
  // Optional context note appended when the opening is fading,
  // e.g. "6 were short at R2; 3 still are."
  decay_note?: string;
};

export type DriftDirection = "up" | "down" | "steady";

export type DriftTrajectory = {
  direction: DriftDirection;
  delta: number; // signed, -1..+1 (rough magnitude)
  reasons: string[]; // observable evidence for the direction
};

export type ArchetypeCandidate = {
  player_id: string;
  name: string;
  position: string | null;
  team: string | null;
  age: number | null;
  search_rank: number;
  // Sleeper ADP for the league's format/scoring. null = no data.
  // Lower = drafted earlier across the Sleeper community.
  adp: number | null;
  // Incoming rookie (years_exp === 0). UI tags as ROOKIE so the user
  // knows landing spot may still be unknown pre-NFL-draft.
  is_rookie?: boolean;
  reason: string; // one-line "why this player fits this path"
};

export type RankedArchetype = {
  archetype: Archetype;
  drift_score: number; // 0..1. partial fit, "how much you're drifting toward this"
  opening_boost: number; // 0..1, additive
  total_score: number; // 0..1, used for sort
  trajectory: DriftTrajectory; // increasing or decreasing
  live_gamble: LiveLikelihood;
  live_risks: Array<{ statement: string; live: LiveLikelihood }>;
  active_openings: ActiveOpening[];
  // Optional: top 2-3 named players currently available who fit this
  // path's primary position. Server-enriched after rank() runs.
  top_candidates?: ArchetypeCandidate[];
  // Optional: per-move completion state evaluated against snapshot.
  // Server-enriched after rank() runs.
  evaluated_moves?: EvaluatedRequiredMove[];
  // Optional: phase derived from drift_score + completion ratio.
  // "acquisition" = still building toward the archetype.
  // "executing"   = drift maxed AND key required moves complete.
  phase?: "acquisition" | "executing";
  // Optional: per-play counterparty matches. Replaces generic
  // "anyone need QB help?" templates with named-target plays like
  // "DM SparkWoods · they're QB-saturated, may sell at a discount."
  targeted_plays?: TargetedPlay[];
};

export type PlayTarget = {
  owner_name: string;
  reason: string; // why this opponent is the right counterparty
};

export type TargetedPlay = {
  play_id: string; // matches Play.id
  targets: PlayTarget[];
};
