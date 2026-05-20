/**
 * Decision Synthesis output types.
 *
 * One Decision = one answer to "what do I do at this pick?" It
 * integrates across snapshot (roster holes, pick density), windows
 * (win-now vs future), ranked archetypes (path drift), and available
 * pool (scarcity math). Supersedes PickApproach as the primary
 * recommendation surface when the user is ≤5 picks away.
 *
 * Design ethos (see feedback_synthesis_over_panels memory):
 *   - ONE call, with the reasoning intact. Not 5 panels that disagree.
 *   - Tradeoff is shown. What you're SKIPPING is as important as what
 *     you're taking, because that's what the user is actually deciding.
 *   - Multi-pick plan is inline. Drafters plan picks-as-a-sequence.
 *   - Density is a context modifier. "7.12 then 8.1 back-to-back"
 *     reframes the current call.
 */

import type { Position } from "../archetypes/schema";
import type { PickDensityKind } from "../league-state/snapshot";
import type { Play } from "../plays/types";
import type { AdpVariantEntry } from "@/lib/players/projections";

// The rule that ultimately broke the tie and produced the recommendation.
// Used by the UI to choose framing (red-urgent vs green-value vs
// orange-path-push) and by the coach so it can cite the same logic.
export type DecisionRule =
  | "fill_starter_urgent" // starter hole AND top option unlikely to survive
  | "fill_starter" // starter hole, no urgency
  | "push_path" // advance a ranked archetype the user is in acquisition phase on
  | "future_stash" // every position saturated; surface youngest/rookie upside
  | "window_direction" // window is significantly below target, pick skews that way
  | "earned_value" // best dynasty-value available, no stronger signal
  | "position_steal"; // top-N at position fell significantly past ADP

// Game-theory layer over ADP-based survival. Per user 2026-04-25:
// the gap-filling opponent's roster needs change the survival math
// for any given player. A WR at an opponent who has 3 WRs already is
// safer than ADP says; a TE at an opponent who has 0 TEs is at more
// risk. These shapes carry the per-opponent roster + demand model
// computed in `analyzeOpponentsInGap`.

export type OpponentInGap = {
  roster_id: number;
  owner_name: string | null;
  // Pick numbers this opponent owns in the gap. >1 entry = wrap-
  // around or multiple traded picks; doubles their effective demand.
  pick_nos: number[];
  position_counts: Record<Position, number>;
  // Per-position likelihood (0-1) the opponent picks this position
  // on a given pick, normalized so the four skill positions sum to
  // 1.0. Heuristic: shortfall = 0.5 raw, depth = 0.15, surplus = 0.05.
  position_demand: Record<Position, number>;
};

export type OpponentGapAnalysis = {
  opponents: OpponentInGap[];
  // Aggregate demand per position summed across all gap opponents,
  // weighted by pick count. Higher = more competitive demand.
  total_demand_by_position: Record<Position, number>;
  // The single most-impactful opponent for the at-a-glance line at
  // the top of the Decision card. Picked by most picks owned.
  primary_opponent: OpponentInGap | null;
};

// Per-candidate signal derived from the gap analysis. Three states
// for the visual indicator + an optional human-readable note.
export type CandidateOpponentSignal = {
  direction: "fades" | "neutral" | "amplifies";
  // Short note for the candidate card. Null when the signal is
  // neutral (no need to display).
  note: string | null;
  // Normalized per-pick demand for the candidate's position across
  // gap opponents. 0-1, but typical values 0-0.5.
  per_pick_demand: number;
};

/**
 * Subset of the JudgmentProfile dials that Decision-card synthesis
 * actually reads. The 8-dial soundboard / lab also includes risk
 * tolerance, trade aggression, consensus lean, and continuity weight;
 * those are stored and flow into Coach but do not yet weight Decision-
 * card rule scoring. When they get wired, add them to this shape and
 * to `computeDialDeltas` in `synthesize.ts`.
 *
 * Range convention: signed -100..+100 with 0 = neutral (no effect).
 */
export type SynthesisDials = {
  youth: number;
  bellcow: number;
  rookie: number;
  horizon: number;
};

export const NEUTRAL_SYNTHESIS_DIALS: SynthesisDials = {
  youth: 0,
  bellcow: 0,
  rookie: 0,
  horizon: 0,
};

/**
 * Pull the 4 synthesis-relevant dials out of a full JudgmentProfile
 * dials map. Defaults to neutral for any dial that is missing or has
 * a non-numeric value (e.g., select/seg axes).
 *
 * Kept on the types module so it has no runtime dependency on the
 * lab module's storage. Callers import from the lab and pass the
 * `.dials` map in.
 */
export function dialsForSynthesisFrom(
  dials: Record<string, number | string | string[] | [number, number]> | null | undefined,
): SynthesisDials {
  if (!dials) return NEUTRAL_SYNTHESIS_DIALS;
  const source = dials;
  function num(key: string): number {
    const v = source[key];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  }
  return {
    youth: num("youth_weight"),
    bellcow: num("bellcow_pref"),
    rookie: num("rookie_tilt"),
    horizon: num("horizon"),
  };
}

/**
 * Per-candidate record of which user dial(s) pushed this candidate's
 * score up or down, and by how much. Drives the per-rule "Your
 * dials" alignment chip on the Decision card (per founder direction
 * 2026-05-14: "per-rule, not per-pick").
 *
 * Only dials with |delta| above a noise floor are recorded so the UI
 * doesn't surface tiny influences.
 */
export type DialInfluence = {
  dial: "youth_weight" | "bellcow_pref" | "rookie_tilt" | "horizon";
  /** Human-readable label, e.g. "Bellcow +50". */
  label: string;
  /** Signed contribution to the candidate's score, in score units. */
  delta: number;
};

export type DecisionCandidate = {
  player_id: string;
  name: string;
  position: string | null;
  team: string | null;
  age: number | null;
  search_rank: number;
  adp: number | null;
  // The variant tag the model resolved to (e.g., "rookie",
  // "dynasty_2qb"). Surfaced on the card so the user knows which
  // variant the cited number came from.
  adp_variant?: string;
  // All available ADP variants for this player. Surfaced as a
  // tap-to-reveal block so the user can cross-reference the model's
  // resolved value against whatever variant their Sleeper UI
  // happens to default to. Per founder feedback 2026-05-08: "your
  // ADP and the ADP I'm used to seeing are different planets."
  adp_alternatives?: AdpVariantEntry[];
  is_rookie?: boolean;
  // KTC-equivalent dynasty value, FantasyCalc-sourced and normalized
  // 0-100 by top-3 average (so the game's best player is ~100 and a
  // bench piece is single-digit). Composes with pick values
  // arithmetically. Null when the resolver had no match for this id.
  // Surfaced on the Top 3 cards so the user sees value-based scarcity
  // at a glance, the way the Coach already reasons about it.
  value: number | null;
  // KTC overall rank (lower = better, top of dynasty board). Pulled
  // from FantasyCalc's overallRank field. Surfaced alongside ADP so
  // the user sees both the Sleeper-UI signal (ADP) AND the dynasty-
  // pro signal (KTC rank) and can judge any divergence themselves.
  // The Coach uses KTC ranks; without exposing them on the card the
  // user can't tell why the engine made a counterintuitive call.
  ktc_overall_rank: number | null;
  /**
   * Which user dials nudged this candidate's score and by how much.
   * Empty when all dials are at neutral. The top entry by |delta|
   * is the dominant dial; the Decision card renders it as an
   * alignment chip next to the rule label.
   */
  dial_influences?: DialInfluence[];
};

// A single line item in the next-picks-plan view. Target is the
// recommended position + named player(s) likely to be there.
//
// Replaces the now-deleted Multi-Pick Rollout card. The duplicate
// surface produced conflicting recommendations because it ranked by
// raw dynasty value and ignored starter-fill / window logic. Folded
// into here per architecture pillar "ONE Decision card per pick."
export type NextPickPlanItem = {
  pick_label: string;
  pick_no: number;
  density: PickDensityKind;
  target_position: Position | "any";
  // Usually 1-2 named players. "Stroud or Tuten (whichever survives)".
  target_names: string[];
  reason: string;
  // How seriously to read this slot's projection. Buckets mirror the
  // brand vocabulary (lock / lean / coin-flip / fade) used elsewhere.
  // Per assumption-auditor 2026-04-23: top-6 stability collapses past
  // pick 7, so any pick more than 2 slots out is "directional" only.
  // Buckets: high (next user pick), medium (one after), directional
  // (further out).
  confidence: "high" | "medium" | "directional";
  // Top 3 players by overall rank the user could pivot to if the
  // primary lane gets sniped. Excludes anyone already in target_names.
  // Position included so the user sees the cross-lane shape at a
  // glance, not just a name list.
  alternates: Array<{
    name: string;
    position: string | null;
  }>;
};

export type DecisionTradeoff = {
  // What the user GAINS by taking the recommended player.
  gains: string[];
  // What the user LOSES by not taking the runner-up candidates. Each
  // entry names the player + why skipping is OK (or what pivots if
  // they're still here next pick).
  losses: string[];
};

export type EmergencyTradeUp = {
  // Why the scarcity is critical enough to surface the nuclear option.
  reasoning: string;
  // Suggested target pick(s) to trade up to, in pick-number order.
  target_picks: string[];
};

// Three-state availability classifier. Replaces the old binary
// `survives_to_next_pick` per user feedback 2026-04-25: ADP at slot
// is a coin flip, not "gone." Three buckets unify the engine's
// previously-divergent ADP filters so the Top 3 card and the Next
// Picks Plan tell the same story about the same player.
export type DecisionAvailability =
  | "likely_here"
  | "coin_flip"
  | "probably_gone";

// One row in the top-3 candidates view. The recommendation is always
// `top_candidates[0]` (the lean). The other 1-2 are real alternatives
// the user should see, each with its own one-line take and the rule
// that surfaced it (so diverse lanes are visible: a "push_path" pick
// next to an "earned_value" pick lets the user pick the lane they want).
export type DecisionTopCandidate = DecisionCandidate & {
  primary_reason: string;
  rule: DecisionRule;
  // Timeline lane. Independent of the rule that surfaced the
  // candidate. "future" for rookies / age <= 23; "win-now" for age >=
  // 27; "balanced" for age 24-26. Lets the UI badge each candidate
  // with its lane so the user sees at a glance which timeline each
  // option represents. Per founder ultrathink 2026-04-27 (lanes-not-
  // declarations reframe).
  timeline_lane: "win-now" | "balanced" | "future";
  // True for the leading pick (same as decision.recommendation). The
  // card highlights this one as "MY LEAN".
  is_lean: boolean;
  // Three-state availability hint relative to the user's NEXT pick.
  // Null when ADP is unknown. Drives the survival badge on each
  // candidate card.
  availability_next_pick: DecisionAvailability | null;
  // Approximate survival probability (5-95) for the visual indicator.
  // Computed from availability_next_pick with a small nudge from the
  // opponent signal. Imperfect but communicates the intuition.
  survival_pct: number | null;
  // Game-theory signal layered over ADP-based availability. When the
  // gap-filling opponents have low demand for this player's position,
  // signal "fades" the risk; high demand "amplifies" it. Null when
  // we don't have enough data (no opponents in gap, no ADP).
  opponent_signal: CandidateOpponentSignal | null;
  // Window-constraint penalty note when applicable (e.g. "Violates
  // win-now window: age 33 (ideal 24-28)"). Null when no penalty.
  constraint_note: string | null;
};

// One dot in the Decision Quadrant. Each candidate is plotted at
// (horizon_pct, confidence_pct) so the user can see at a glance which
// picks pull which direction and which the system is most decisive
// about. Replaces or augments the strategic forks card grid.
//   horizon_pct:    -100 (full win-now) ... 0 (balanced) ... +100 (full future)
//                   Derived from age + is_rookie. A 21yo rookie pegs +100;
//                   a 33yo vet pegs -100.
//   confidence_pct: 0 (low confidence) ... 100 (high confidence).
//                   Derived from the rule + synthesized score after the
//                   window constraint penalty applies. The lean is the
//                   highest-confidence dot.
export type DecisionQuadrantCandidate = DecisionTopCandidate & {
  horizon_pct: number;
  confidence_pct: number;
};

export type Decision = {
  // Pick label + countdown. "7.12" and 2 picks away.
  pick_label: string;
  pick_no: number;
  picks_until_me: number;
  density: PickDensityKind;
  // Always present, even in "watch" mode (>5 picks away). UI decides
  // whether to surface urgency framing based on picks_until_me.
  recommendation: DecisionCandidate & {
    // One-line primary reason. The take.
    primary_reason: string;
    // The rule that chose this player. Drives UI color/framing.
    rule: DecisionRule;
  };
  // Top 3 candidates side-by-side. Element 0 is the lean (same player
  // as `recommendation`). Always 1-3 entries. Replaces the older
  // tradeoff-driven "what you're skipping" framing in the UI: the user
  // sees real alternatives directly instead of the loss framing only.
  top_candidates: DecisionTopCandidate[];
  // Wider candidate set for the Decision Quadrant viz. Up to 12 dots,
  // each plotted at (horizon_pct, confidence_pct). Includes the top_3
  // PLUS additional viable candidates so the user can see the full
  // landscape of options pulling in different directions.
  quadrant_candidates: DecisionQuadrantCandidate[];
  // Supporting evidence. 2-4 bullets.
  why: string[];
  // Kept on the type so the coach context can still cite gains/losses.
  // The card no longer renders this section; top_candidates does the job.
  tradeoff: DecisionTradeoff;
  // Game-theory layer: who picks between you and your next slot,
  // what they need, what they likely target. Drives the OPPONENT
  // BETWEEN PICKS line at the top of the card. Null when no draft
  // is active (no gap to analyze).
  opponent_between_picks: OpponentGapAnalysis | null;
  // Next 2-3 user picks with projected targets. Empty when no draft.
  next_picks_plan: NextPickPlanItem[];
  // "If you skip X here, next viable is ~N picks away via Y/Z." Null
  // when no meaningful scarcity gap.
  scarcity_callout: string | null;
  // Nuclear option: trade up when scarcity math is genuinely broken.
  emergency_trade_up: EmergencyTradeUp | null;
  // Counter-view: a named dissenting frame the engine surfaces inline
  // on the Decision card so the user sees BOTH the lean and the
  // strongest argument against it. Per cross-panel decision framework
  // 2026-04-24 (auditor derivation): hiding dissent makes panels feel
  // like competing advisors; surfacing it as a one-line counter makes
  // them feel like multiple perspectives that have wrestled. Initial
  // detector: positional tier-cliff at a starter-required position
  // the user has 0 of, when the lean is at a different position.
  // Future detectors (Coach scarcity, StrategyLab path violation) can
  // emit additional kinds. Null when no counter-view earns the line.
  counter_view: {
    kind: "tier_cliff" | "path_violation" | "coach_dissent";
    headline: string; // "QB cliff: 3 QB1s left, +20 picks until next slot"
    detail: string; // longer reasoning, 1-2 sentences
    suggested_player: string | null; // e.g. "Trevor Lawrence" if specific
  } | null;
  // Counterintuitive-pick disclaimer. Populated when the standing
  // call is a sharp lock (taken 10+ picks before ADP). Voice A line
  // the redesigned UI renders as a transitional band above the
  // standing call: "Counterintuitive lock. Mahomes would normally
  // fall 14 more picks. Survival to your next slot is 35%. Trust
  // the math." Null when the standing call is not a sharp lock.
  feel_weird_disclaimer: string | null;
  // Trade-up consideration. Populated when the engine identifies a
  // high-value but unreachable player (probably_gone) whose unweighted
  // EV exceeds the (survival-weighted) standing call by a meaningful
  // margin. Surfaces "or trade up to lock him" as a secondary path on
  // The Call card. Founder direction 2026-05-19: when a player is
  // wanted but unreachable from the user's slot, the engine should
  // name him AND name the trade lever, not pretend he's reachable.
  trade_up_consideration: {
    player_id: string;
    player_name: string;
    position: Position;
    // Player's ADP. Anchors "how big a trade-up would this require."
    adp: number | null;
    // P(player is on the board when user picks), in 5-95 range.
    survival_pct: number;
    // Voice A line for the card. Names the player, the EV gap, and
    // the trade lever explicitly.
    framing: string;
  } | null;
  // Plays this pick enables. Multi-pick intentional sequences where
  // the winner's value is conditional on follow-through moves
  // (stack a Bucs WR after Mayfield, lock down the handcuff after an
  // elite RB, pair an aging QB with a developmental QB in SF). The
  // user "commits" to a play via the UI (localStorage) and the
  // active play surfaces as a discipline reminder on subsequent
  // picks. Founder direction 2026-05-20: "We have to help me see
  // it, choose it, and then remember it / stay disciplined."
  plays_this_enables: Play[];
};
