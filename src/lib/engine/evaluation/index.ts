/**
 * EvaluationEngine: single source of truth for player evaluation.
 *
 * Phase 0 (current): STUB. Returns placeholder values that mirror
 * existing logic so consumers can start importing this without
 * breaking. Phase 1 incrementally swaps in real position rubrics
 * (RB first, then QB / WR / TE).
 *
 * The contract:
 *   evaluate(player, team, health, league, user) -> EvaluationOutput
 *
 * Every consumer (Decision card, Coach context, AAR, Quadrant, etc.)
 * reads from this output. NO consumer reaches into raw signals; they
 * read the evidence stack and the engine resolves what feeds into
 * what.
 *
 * See MODEL_CARD section 1.2 for architecture and BUILD_PLAN
 * sections 0.3-0.4 for migration plan.
 */

import type { PlayerSignalsRow, TeamSignalsRow } from "@/lib/signals/schema";

export type EvidenceContribution = {
  layer: "intrinsic" | "situation" | "macro" | "doctrine" | "variance";
  signal: string;
  weight: number;
  value: number;
  contribution: number;
  source: string;
};

export type ArbitrageFlag =
  | "rb_cliff_breaker"
  | "rookie_wr_year1_breakout"
  | "te_early_breakout"
  | "aging_wr_sustaining"
  | "late_round_qb_hit"
  | "compounding_news";

export type EvaluationOutput = {
  point_estimate: number;
  variance_band: { lo: number; hi: number };
  evidence_stack: EvidenceContribution[];
  market_delta: number;
  confidence: number;
  arbitrage_flags: ArbitrageFlag[];
};

export type EvaluationContext = {
  player: PlayerSignalsRow | null;
  team: TeamSignalsRow | null;
  ktc_value?: number | null;
  search_rank?: number | null;
  // Future fields: health, league, user. Phase 1 expansion.
};

// Phase 0 stub. Returns a placeholder output derived from the
// existing search_rank + ktc_value path. Real position-rubric
// implementations land in Phase 1.
export function evaluate(ctx: EvaluationContext): EvaluationOutput {
  const ktc = ctx.ktc_value ?? null;
  const rank = ctx.search_rank ?? null;
  // Use KTC if available; fall back to search_rank-derived score.
  const point_estimate =
    ktc != null
      ? ktc
      : rank != null
        ? Math.max(0, 100 - (rank / 200) * 100)
        : 50;
  return {
    point_estimate: Math.max(0, Math.min(100, point_estimate)),
    variance_band: {
      lo: Math.max(0, point_estimate - 10),
      hi: Math.min(100, point_estimate + 10),
    },
    evidence_stack: [
      {
        layer: "intrinsic",
        signal: ktc != null ? "ktc_value" : "search_rank",
        weight: 1.0,
        value: ktc != null ? ktc : rank ?? 0,
        contribution: point_estimate,
        source: "Phase 0 stub",
      },
    ],
    market_delta: 0,
    confidence: ktc != null ? 0.6 : 0.4,
    arbitrage_flags: [],
  };
}
