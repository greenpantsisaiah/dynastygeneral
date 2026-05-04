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
 * Position-specific age curves. Returns the SINGLE-SEASON production
 * multiplier (not a dynasty horizon premium).
 *
 * Curves are flat-peak-shelf, not gradients. Cohort production data
 * shows year-over-year variance within peak windows is statistical
 * noise, not a meaningful age effect. The cliff is sharp.
 *
 * Citations:
 * - RB: Mass 2018 RB cliff studies + Apex peak-age series. Peak shelf
 *   23-26 is flat; cliff begins at 27. Harstad career-touch framework
 *   provides the why (touches accumulate, not years).
 * - WR: peak shelf 25-29; gradual decline (target_share-conditioned).
 * - TE: pre-breakout discount through year 2; peak shelf 24-30.
 * - QB: tier-conditional, handled in qb.ts (Tier-1 ages well past 35;
 *   Tier-2/3 declines at 33+).
 *
 * Why no "youth premium" for a 24yo over a 26yo at RB: the production
 * data does not support one. Dynasty horizon premium is a SEPARATE
 * concern (sum of remaining peak seasons, discounted) and is not
 * implemented here because KTC already encodes it in the prior; adding
 * it again would double-count. Phase 2 backtest will tell us whether
 * a horizon premium ABOVE KTC is empirically justified.
 */
export function ageMultiplier(
  position: string,
  age: number | null,
): number {
  if (age == null) return 1.0;
  switch (position) {
    case "RB":
      if (age < 22) return 0.95; // rookie ramp
      if (age < 23) return 0.98; // year 2 ramp
      if (age < 27) return 1.0; // peak shelf 23-26 (flat)
      if (age < 28) return 0.85; // cliff begins at 27
      if (age < 29) return 0.72;
      if (age < 30) return 0.58;
      return 0.45;
    case "WR":
      if (age < 23) return 0.92; // rookie/year-2 ramp
      if (age < 25) return 0.98;
      if (age < 30) return 1.0; // peak shelf 25-29
      if (age < 32) return 0.9;
      if (age < 34) return 0.75;
      return 0.55;
    case "TE":
      if (age < 23) return 0.78; // strong pre-breakout discount
      if (age < 24) return 0.88; // late pre-breakout
      if (age < 28) return 1.02; // breakout window 24-27
      if (age < 31) return 1.0;
      if (age < 33) return 0.85;
      return 0.65;
    case "QB":
      // Default curve; tier-1 override applied in qb.ts
      if (age < 26) return 0.9;
      if (age < 33) return 1.0;
      if (age < 36) return 0.85;
      return 0.65;
    default:
      return 1.0;
  }
}

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
