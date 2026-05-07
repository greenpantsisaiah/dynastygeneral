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
 * Structural constraint on the user's draft. "Don't trade picks
 * while you have 0 RB and 0 TE" is a structural-constraint
 * guardrail. Surfaces automatically; user doesn't have to know
 * to ask for it.
 */
export type StructuralConstraint = {
  positions_unfilled: Position[];
  guardrail_message: string;
  // True if the constraint is currently active. False once positions
  // are filled to at least the starter requirement.
  is_active: boolean;
};

/**
 * Estimate of when the trade window peaks (when opponent panic is
 * highest and your structural pressure has eased). Phase 1 is a
 * coarse round-band heuristic; Phase 2 may incorporate per-opponent
 * panic timing.
 */
export type TradeWindowEstimate = {
  // Round number when leverage tends to peak. Phase 1 heuristic:
  // 7-9 in dynasty startups (after most teams have filled key
  // starters but some still have structural holes from chasing
  // ceiling early).
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
