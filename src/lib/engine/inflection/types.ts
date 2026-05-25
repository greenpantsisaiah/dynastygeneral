/**
 * Inflection-point bifurcation types.
 *
 * Per the 2026-05-07 calibration architecture: predicting a single point
 * estimate is the wrong frame for high-variance moments. When a player is
 * in an inflection window (aging cliff, post-injury return, rookie debut,
 * traded, contract year, etc.), the conditional distribution Y|X is
 * bimodal. The mean of a bimodal distribution lands in the valley between
 * modes; no actual player ends up there. Our diagnostic showed this is
 * exactly where the engine has been making bullish-but-wrong calls
 * (Akers, Dobbins, Mitchell, Tyreek, Cooper Kupp, Burks, Coleman).
 *
 * The fix: detect inflection-window players, surface the two stories
 * (A success / B bust) with named historical comparators, and list the
 * signals that distinguish A from B with confidence labels. The user
 * sees the scorecard and makes the call. The engine doesn't pretend to
 * collapse a bimodal distribution into a point.
 *
 * Statistical framing: this is a finite mixture model with a logistic-
 * regression resolver per inflection type. Phase 1 ships heuristic
 * probabilities; Phase 2 fits the logistic regression on backtest data.
 *
 * Reference: Massey-Thaler 2013 (rookie outcomes are bimodal and
 * draft markets misprice variance), Tetlock superforecaster work
 * (calibrated bifurcation > single-point estimates), Kahneman
 * reference-class forecasting (named comparators beat unconditioned
 * intuition).
 */

import type { Position } from "../../strategy/archetypes/schema";
import type { OpportunityProfile } from "@/lib/players/season-stats";

// Confidence level for a signal's inclusion in the bifurcation.
// - validated: peer-reviewed citation OR observed effect size in our
//   backtest with n > 20
// - partial: industry-analyst observation (PFF, Football Outsiders)
//   without formal study, OR small-n backtest pattern
// - weak: pundit / community knowledge with no data backing
// The user sees this label so they know which signals to trust most.
export type SignalConfidence = "validated" | "partial" | "weak";

// Which story a signal currently points toward for THIS player.
// "data_missing" is honest about what we don't yet observe.
export type SignalDirection =
  | "story_a"
  | "story_b"
  | "neutral"
  | "data_missing";

// One signal in the inflection scorecard.
export type InflectionSignal = {
  // Short label for the user-facing scorecard.
  name: string;
  // One-line plain-English description of what this signal measures.
  description: string;
  confidence: SignalConfidence;
  // Where this signal CURRENTLY points for the player at hand.
  direction: SignalDirection;
  // The observed value or qualitative readout (e.g. "1462 career carries",
  // "team drafted RB1 at pick 28", "data not in our pipeline yet").
  observation: string | null;
  // Optional citation pointer (corpus reference, PFF article, etc.).
  citation?: string;
};

// A historical comparator named in the scorecard.
export type InflectionComparator = {
  player: string;
  year: number | null; // the inflection year
  outcome_summary: string; // "rushing title at 32 post-ACL", "cliff at 29"
  story: "a" | "b";
};

// One inflection window resolution for a player at decision time.
export type InflectionResolution = {
  // The window type. Stable IDs for cross-system reference.
  window:
    | "aging_cliff_rb"
    | "aging_cliff_wr"
    | "aging_cliff_te"
    | "aging_cliff_qb"
    | "rookie_debut"
    | "post_major_injury";
  // Story labels for the two modes of the bimodal distribution.
  story_a_label: string; // e.g., "Continued bellcow"
  story_b_label: string; // e.g., "Cliff"
  // Heuristic probabilities (Phase 1). Phase 2 will replace with fitted
  // logistic-regression posteriors. Always sum to 1.0 (rounded).
  p_story_a: number;
  p_story_b: number;
  // Calibration honesty fields. Tells the user how confident we are in
  // the bifurcation itself, not just the call.
  confidence_summary: {
    validated_count: number;
    partial_count: number;
    weak_count: number;
    data_missing_count: number;
    // Count of signals that actually point somewhere for this player
    // (validated + partial + weak, i.e. NOT data_missing).
    live_signal_count: number;
    // How much the bifurcation rests on live signals vs the position
    // base rate. "prior_driven" when 0-1 signals are live (the split is
    // essentially the prior); "evidence_backed" when nothing is missing;
    // "mixed" in between. Drives the honest-framing caveat in the UI so a
    // mostly-blind card does not read as a confident, evidence-backed call.
    evidence_basis: "prior_driven" | "mixed" | "evidence_backed";
    // Voice A caveat shown when the read leans on the prior more than on
    // live signals. Null when evidence_backed (the scorecard speaks for
    // itself). Carries its own counts so the surface never hardcodes them.
    calibration_note: string | null;
    // Plain-English summary: "5 of 7 signals validated; 1 data missing."
    text: string;
  };
  // The K signals (typically 3-7) that distinguish A from B at this window.
  signals: InflectionSignal[];
  // 2-3 comparators per story.
  comparators: InflectionComparator[];
  // Plain-English summary the LLM and UI lead with.
  // "Player X is in the aging-RB cliff window. The model leans Story B
  // (cliff) at 65% based on signals X, Y. The user should decide..."
  headline: string;
  // Conversation-ready framing the user can paste into a league chat.
  // Per founder ask 2026-05-07: "give me intel I can have a good
  // conversation about with friends."
  league_chat_framing: string;
};

// A player can be in MULTIPLE inflection windows simultaneously. E.g., an
// aging RB returning from injury AND newly traded.
export type InflectionContext = {
  player_id: string;
  player_name: string;
  position: Position;
  resolutions: InflectionResolution[];
};

// Snapshot-level inputs the inflection layer needs to do its work.
// Decoupled from the strategy snapshot so the inflection module is
// independently testable.
export type InflectionInputs = {
  player_id: string;
  player_name: string;
  position: Position;
  age: number | null;
  years_exp: number | null;
  team: string | null;
  // Career-cumulative usage where available (typically null in v1 since
  // we don't have it in the pipeline yet).
  career_carries: number | null;
  career_targets: number | null;
  // Most-recent-season usage if available.
  prev_season_carries: number | null;
  prev_season_targets: number | null;
  prev_prev_season_carries: number | null;
  prev_prev_season_targets: number | null;
  // Canonical opportunity read (snap share, targets/game, aDOT, RZ role,
  // drop rate) for the most-recent two seasons, from buildOpportunityProfile
  // over the Sleeper /stats feed. Feeds the aging-cliff opportunity signal
  // (buildOpportunitySignal). Null when no prior-season usage is available.
  prev_season_opportunity: OpportunityProfile | null;
  prev_prev_season_opportunity: OpportunityProfile | null;
  // Roster signals. The set of player_ids on the same team at the same
  // position, with their ages and years_exp, lets us detect "team drafted
  // a backup RB" or "rookie inheriting a crowded WR room."
  same_team_same_position: Array<{
    player_id: string;
    age: number | null;
    years_exp: number | null;
    is_rookie: boolean;
  }>;
  // Draft pick number (overall, 1-262) when available. Surfaces draft
  // capital for rookies.
  draft_pick_overall: number | null;
  // Compounding-news count (RB-specific signal we already extract). Used
  // as a partial proxy for "new role uncertainty." More-developed
  // injury-history signal is queued for v2.
  compounding_news_count: number | null;
};
