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

// The rule that ultimately broke the tie and produced the recommendation.
// Used by the UI to choose framing (red-urgent vs green-value vs
// orange-path-push) and by the coach so it can cite the same logic.
export type DecisionRule =
  | "fill_starter_urgent" // starter hole AND top option unlikely to survive
  | "fill_starter" // starter hole, no urgency
  | "push_path" // advance a ranked archetype the user is in acquisition phase on
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

export type DecisionCandidate = {
  player_id: string;
  name: string;
  position: string | null;
  team: string | null;
  age: number | null;
  search_rank: number;
  adp: number | null;
  is_rookie?: boolean;
  // KTC-equivalent dynasty value, FantasyCalc-sourced and normalized
  // 0-100 by top-3 average (so the game's best player is ~100 and a
  // bench piece is single-digit). Composes with pick values
  // arithmetically. Null when the resolver had no match for this id.
  // Surfaced on the Top 3 cards so the user sees value-based scarcity
  // at a glance, the way the Coach already reasons about it.
  value: number | null;
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

// Window constraint summary surfaced in the Decision card header.
// Mirrors the WindowConstraint shape but only the user-visible bits.
export type DecisionWindowFrame = {
  direction: "win_now" | "future" | "balanced";
  strength: "heavy" | "moderate" | "none";
  label: string;
  sentence: string;
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
  // Windows frame for this pick. The header shows the label + sentence
  // so the user sees the constraint that shaped the recommendation.
  window_frame: DecisionWindowFrame;
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
};
