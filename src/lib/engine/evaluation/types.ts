/**
 * Shared types for the evaluation engine. Per BUILD_PLAN section 0.3
 * and MODEL_CARD section 1.2: every consumer (Decision card, Coach,
 * AAR, Quadrant) reads from EvaluationOutput. NO consumer reaches
 * into raw signals.
 */

import type {
  PlayerSignalsRow,
  TeamSignalsRow,
} from "@/lib/signals/schema";

export type EvidenceLayer =
  | "intrinsic"
  | "situation"
  | "macro"
  | "doctrine"
  | "variance";

export type EvidenceContribution = {
  layer: EvidenceLayer;
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
  adp?: number | null;
  search_rank?: number | null;
  position?: string | null;
  age?: number | null;
  is_rookie?: boolean;
  years_exp?: number | null;
};

export type RubricOutput = Pick<
  EvaluationOutput,
  "point_estimate" | "evidence_stack" | "arbitrage_flags"
> & {
  band_modifier: number;
};
