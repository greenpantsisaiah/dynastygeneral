/**
 * Shared helpers for position rubrics. Age curves, evidence-stack
 * builders, variance-band modifiers, and the Bayesian prior blend.
 *
 * Citations follow the format used in MODEL_CARD section 4. Where a
 * weight is INTERNAL_HEURISTIC, it's tagged so backtest results can
 * either validate or replace it.
 */

import type {
  EvidenceContribution,
  EvidenceLayer,
  RubricOutput,
} from "./types";

export const POINT_ESTIMATE_FLOOR = 0;
export const POINT_ESTIMATE_CEILING = 100;

export function clamp(
  value: number,
  lo: number = POINT_ESTIMATE_FLOOR,
  hi: number = POINT_ESTIMATE_CEILING,
): number {
  return Math.max(lo, Math.min(hi, value));
}

export function evidence(
  layer: EvidenceLayer,
  signal: string,
  weight: number,
  value: number,
  source: string,
): EvidenceContribution {
  return {
    layer,
    signal,
    weight,
    value,
    contribution: weight * value,
    source,
  };
}

/**
 * Market-value prior. Accepts either raw KTC/FantasyCalc values
 * (~0-9999 scale) or normalized 0-100 scores; auto-detects by
 * magnitude. The Bayesian blend in evaluate() uses this as the prior;
 * rubrics shift the posterior.
 *
 * Citation: MODEL_CARD section 8 (Bayesian update). KTC and
 * FantasyCalc dynasty values function as prior because they
 * aggregate trade-market consensus.
 */
export function ktcToScore(ktc: number | null | undefined): number | null {
  if (ktc == null) return null;
  if (ktc <= 100) return clamp(ktc);
  return clamp((ktc / 9999) * 100);
}

/**
 * ADP-derived score. Lower ADP = higher score. ADP rank 1 maps to
 * ~95, rank 200 to ~5. Linear in rank (not pick-value), since the
 * drop-off in fantasy points beyond top-200 is sharp.
 */
export function adpToScore(adp: number | null | undefined): number | null {
  if (adp == null || adp <= 0) return null;
  return clamp(95 - (adp / 200) * 90);
}

/**
 * Search-rank fallback when no ADP/KTC is available. Sleeper search
 * rank reflects user-search popularity, NOT fantasy relevance: it
 * includes retirees, free agents in the news, etc. Cap the prior at
 * 55 to reflect this low-quality signal; rubric signals can push
 * higher when warranted. A player whose only signal is search_rank
 * should never look elite by default.
 *
 * The Todd Gurley incident (2026-05-04): Sleeper had Gurley in the
 * top-30 RB search rank, FantasyCalc had no value for him, the old
 * search_rank cascade gave him prior 92, age curve dropped him to
 * 78, and he showed up as a top-3 RB. The cap fixes this class of
 * bug at the engine level even if the candidates filter misses one.
 */
export function searchRankToScore(
  rank: number | null | undefined,
): number | null {
  if (rank == null || rank <= 0) return null;
  return clamp(55 - (rank / 300) * 50);
}

/**
 * Position-specific age curve. SINGLE-SEASON production multiplier
 * (not a dynasty-horizon premium), centered on 1.0 at peak.
 *
 * Consolidated 2026-05-29 (Phase C3): this was a stepwise flat-peak
 * shelf with hard breakpoints at integer ages. It is now the canonical
 * smooth `ageMultiplier` from `@/lib/players/age-curve` (a flat 1.0
 * shelf with C1-smooth Gaussian shoulders, position-conditioned), so
 * the rubrics, the player pool, the scout, the contender forecast, and
 * the youth dial all read one age curve. Citations and per-position
 * grounding live in that module. QB still uses its tier-conditional
 * curve in qb.ts and does not call this.
 */
export { ageMultiplier } from "@/lib/players/age-curve";

/**
 * Variance band from base point estimate + position-specific width +
 * additive band modifiers from rubrics. Total band width is clamped
 * to [6, 40] points to keep the UI signal meaningful.
 */
export function buildVarianceBand(
  pointEstimate: number,
  position: string,
  rubricBandModifier: number,
): { lo: number; hi: number } {
  const baseWidth = positionBandBase(position);
  const totalWidth = clamp(baseWidth + rubricBandModifier, 6, 40);
  const halfWidth = totalWidth / 2;
  return {
    lo: clamp(pointEstimate - halfWidth),
    hi: clamp(pointEstimate + halfWidth),
  };
}

export function positionBandBase(position: string): number {
  switch (position) {
    case "RB":
      return 14; // RBs have most volatility (injury, role change)
    case "WR":
      return 12;
    case "TE":
      return 16; // TE has highest year-over-year volatility
    case "QB":
      return 8; // QBs most stable once tier-established
    default:
      return 14;
  }
}

/**
 * Confidence is derived from band tightness. Tighter band = higher
 * confidence. Maps band width [6, 40] to confidence [0.95, 0.35].
 */
export function bandToConfidence(band: {
  lo: number;
  hi: number;
}): number {
  const width = band.hi - band.lo;
  const normalized = clamp((40 - width) / 34, 0, 1);
  return 0.35 + normalized * 0.6;
}

/**
 * Combine rubric output with the KTC prior into a final point
 * estimate. priorWeight ∈ [0, 1] from Soundboard "Market Anchor" dial.
 *
 * If neither KTC nor ADP is available, return the rubric output
 * directly with reduced confidence (handled by caller).
 */
export function blendWithPrior(
  rubricEstimate: number,
  prior: number | null,
  priorWeight: number,
): { final: number; market_delta: number } {
  if (prior == null) {
    return { final: rubricEstimate, market_delta: 0 };
  }
  const final = clamp(
    priorWeight * prior + (1 - priorWeight) * rubricEstimate,
  );
  return { final, market_delta: rubricEstimate - prior };
}

/**
 * Empty rubric output for callers that hit a position we don't yet
 * have a rubric for (e.g., K, DST). Returns 50-point neutral.
 */
export function neutralRubric(): RubricOutput {
  return {
    point_estimate: 50,
    evidence_stack: [
      evidence(
        "intrinsic",
        "neutral_fallback",
        1.0,
        50,
        "Position has no rubric yet",
      ),
    ],
    arbitrage_flags: [],
    band_modifier: 4,
  };
}
