/**
 * EvaluationEngine: single source of truth for player evaluation.
 *
 * Phase 1 (current): real per-position rubrics live for RB / QB / WR
 * / TE. Phase 0 stub fallback removed. Position-specific rubrics map
 * onto MODEL_CARD section 4. Variance bands per section 5.8.
 *
 * The contract:
 *   evaluate(ctx) -> EvaluationOutput
 *
 * Every consumer (Decision card, Coach context, AAR, Quadrant) reads
 * from this output. NO consumer reaches into raw signals; they read
 * the evidence stack and the engine resolves what feeds into what.
 *
 * See MODEL_CARD section 1.2 for architecture and BUILD_PLAN
 * sections 0.3-0.4 + 1.3 for the migration plan.
 */

import { dispatchRubric } from "./rubrics";
import {
  bandToConfidence,
  buildVarianceBand,
  clamp,
  ktcToScore,
} from "./util";

export type {
  EvaluationOutput,
  EvaluationContext,
  EvidenceContribution,
  EvidenceLayer,
  ArbitrageFlag,
} from "./types";

// Re-exported for the RB rubric backtest/calibration tooling. Production
// goes through evaluate(); calibration runs evaluateRb with candidate
// weights against the REAL rubric (no re-implementation).
export { evaluateRb, RB_DEFAULT_WEIGHTS, type RbWeights } from "./rubrics/rb";

import type { EvaluationContext, EvaluationOutput } from "./types";

export function evaluate(ctx: EvaluationContext): EvaluationOutput {
  const position =
    (ctx.position ?? ctx.player?.position ?? "").toUpperCase() || "UNKNOWN";

  const rubric = dispatchRubric(position, ctx);
  const point_estimate = clamp(rubric.point_estimate);

  const variance_band = buildVarianceBand(
    point_estimate,
    position,
    rubric.band_modifier,
  );
  const confidence = bandToConfidence(variance_band);

  const ktcPrior = ktcToScore(ctx.ktc_value);
  const market_delta = ktcPrior == null ? 0 : point_estimate - ktcPrior;

  return {
    point_estimate,
    variance_band,
    evidence_stack: rubric.evidence_stack,
    market_delta,
    confidence,
    arbitrage_flags: rubric.arbitrage_flags,
  };
}
