/**
 * League Read: in-draft trade leverage and strategic-position analysis.
 *
 * The 2026-05-07 chat-gap diagnostic surfaced this missing layer.
 * Founder repeatedly chats Coach for: opponent softness reads, trade
 * asset surplus on their own roster, structural constraints on when
 * to trade picks, conditional pivots ("if X player survives, take
 * for trade-asset purposes"), and sophistication signals on
 * opponent picks ("they took Mendoza behind Cousins, that reads as
 * ceiling-chase").
 *
 * The data exists in `league_profile.dynamics` and `TeamProfile`
 * labels (qb_banker, qb_needy, tilted_buyer, desperation). What's
 * missing is the synthesis: ranked leverage pairings, structural
 * guardrails, timing forecasts, conditional rules.
 *
 * This module computes the synthesis. Coach consumes it via context;
 * a future UI surface ("Trade Strategy Map" / "League Read") renders
 * it. Per founder direction, UI redesign is a separate phase.
 */

import type { Position } from "../archetypes/schema";

/**
 * Named-asset hint for a leverage opportunity. Phase 2 upgrade: name
 * specific players by KTC value (e.g., "Bijan Robinson (KTC 87)")
 * instead of generic prose ("their best RB"). Surfaces in
 * receive_asset_hint when the opponent's roster has KTC-valued
 * players at the receive position.
 */
export type NamedAssetHint = {
  player_id: string;
  player_name: string;
  ktc_value: number;
};

/**
 * One trade-leverage opportunity: an opponent whose structural hole
 * matches a surplus on the user's roster.
 *
 * Example: founder holds Lamar (75) + Mahomes (59) in SF. Opponent
 * joeboch has 0 QB after 4 rounds in SF (qb_needy + desperation
 * label). User's surplus QB (Mahomes) maps to joeboch's QB hole.
 * Leverage score reflects (joeboch's pain) x (Mahomes's value as
 * QB asset) x (joeboch's lower sophistication if observed).
 */
export type LeverageOpportunity = {
  // The opponent.
  opponent_roster_id: number;
  opponent_name: string;
  // Their structural state. One-line label the user can use in chat.
  opponent_panic_label: string;
  // Why this opponent is soft (specific signals).
  opponent_softness_signals: string[];
  // Position you'd send (where you have surplus).
  send_position: Position;
  // Position you'd ask for (where they have surplus AND you have hole).
  receive_position: Position | null;
  // Specific named asset of yours that's the natural send.
  // Phase 1: best by KTC value where applicable; Phase 2 may use
  // surplus-after-starter math.
  send_asset_hint: string;
  // Specific named asset you'd target. Phase 2 names specific players
  // by KTC value when the opponent's roster has them.
  receive_asset_hint: string;
  // Phase 2: top 1-3 specific named assets on the opponent's roster
  // at the receive position. Empty when KTC values aren't available
  // for that opponent. Coach uses these to write specific trade
  // proposals naming actual players, not generic prose.
  receive_asset_candidates: NamedAssetHint[];
  // 0-100 leverage score: higher = stronger leverage you have.
  leverage_score: number;
  // One-line conversation framing the user can paste.
  framing_one_liner: string;
};

/**
 * Structural state of the user's roster, surfaced as DATA, not as a
 * prescriptive guardrail. Per dynasty-canon-keeper DEBUNK (2026-05-20)
 * and dynasty-assumption-auditor: the prior binary "any position
 * below starter_max fires a hold-pick-equity guardrail" was research-
 * indefensible. Massey-Thaler 2013 ("The Loser's Curse," Mgmt Sci
 * 59(7)) puts pick value on a steeply convex curve; round-9+ picks
 * carry near-zero arbitrage equity. KTC repricing latency (FAQ) is
 * days, not multi-round windows. The research-supported cautious
 * "hold equity" case is narrow: unrecoverable severity AND early-
 * round pick equity AND pick-out without positional return. All
 * other states are recoverable through normal drafting and surplus-
 * to-need swaps remain the doctrine.
 *
 * `is_active: true` now fires ONLY in that narrow conditional. The
 * Coach system prompt reads the underlying fields and reasons.
 */
export type StructuralConstraint = {
  positions_unfilled: Position[];
  // Per-position gap (starter_max - current_count) for unfilled
  // positions. Zero or positive.
  starter_gap_by_position: Partial<Record<Position, number>>;
  // Sum of starter_gap_by_position. Total bodies short of starting
  // a full lineup at QB / RB / WR / TE.
  total_starter_gap: number;
  // Number of picks the user has remaining in the draft (counted
  // from `my_pick_schedule` post-traded_picks). Null when not in an
  // active draft or the schedule isn't available.
  picks_remaining: number | null;
  // True when total_starter_gap exceeds picks_remaining minus a
  // small tolerance (some picks land on depth, not starters). This
  // is the Massey-Thaler path-dependence case: the gap is
  // structurally tight or impossible to close.
  unrecoverable_severity: boolean;
  // True when the user's near-term pick sits in a round where AV-
  // weighted pick value is non-trivial (Stuart, Football Perspective
  // AV-based draft chart). Late-round picks have near-zero "equity
  // worth protecting," so the cautious read is incoherent there.
  early_round_pick_equity: boolean;
  // Plain-English summary of the structural state. NOT a
  // prescription; describes the data. The Coach system prompt owns
  // the conditional prescription that wraps these fields.
  guardrail_message: string;
  // True only when the narrow research-supported conditional holds
  // (unrecoverable_severity AND early_round_pick_equity AND a real
  // starter gap). UI surfaces the warning only when this is true.
  is_active: boolean;
};

/**
 * Estimate of when the trade window peaks (when opponent panic is
 * highest and your structural pressure has eased). Phase 1 is a
 * coarse format-adjusted heuristic; Phase 2 will key on positional-
 * run intensity in the last N picks.
 *
 * Calibration source needed: KTC trade-volume-by-round data
 * segmented by format (SF vs 1QB vs TE-premium). Until that lands,
 * the format baselines below are dynasty community consensus, not
 * a fit.
 */
export type TradeWindowEstimate = {
  // Round number when leverage tends to peak. Format-aware:
  // SF dynasty around round 5 (after the QB1 tier clears), TE-
  // premium around round 7-8 (after the TE1 tier drop), 1QB
  // dynasty / redraft around round 10 (late QB panic). Floored
  // against currentRound + 2 so the forecast always points
  // forward.
  peak_round: number;
  // Plain-English: "Hold conversations until round 7-8; let
  // QB-starved teams sweat through round 6 first."
  message: string;
};

/**
 * The full league-read synthesis.
 */
export type LeagueRead = {
  // Top-3 leverage opportunities ranked by score. Empty when no
  // opponent softness or no user surplus to leverage.
  top_leverage_opportunities: LeverageOpportunity[];
  // The user's structural constraints (don't trade picks while
  // these hold).
  structural_constraints: StructuralConstraint[];
  // Trade timing estimate.
  trade_window: TradeWindowEstimate | null;
  // Plain-English headline summary the Coach uses to lead with.
  headline: string;
};
