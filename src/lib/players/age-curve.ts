/**
 * Position-specific age curves for dynasty valuation.
 *
 * Replaces the prior one-size-fits-all `ageFactor` step function
 * (0.7 / 1.0 / 1.3 / 1.7 across QB/RB/WR/TE) which the assumption
 * auditor flagged as indefensible: a 30-year-old QB is in his prime
 * while a 30-year-old RB is past his cliff, and one bin cannot serve
 * both. Sources: Dynasty Edge 2014-2024 EPA study, PFF aging curves,
 * Apex Fantasy peak-age series, Footballguys Harstad shelf-life work.
 *
 * Peak windows (published consensus as of 2026-04-22):
 *   QB: peak 27-33, useful into late 30s
 *   RB: peak 23-26, hard cliff at 28-29
 *   WR: peak 25-29, cliff at 32
 *   TE: peak 25-29, useful through 33, cliff at 34
 *
 * Lower factor = better for the player (factors multiply search_rank;
 * lower rank = better asset).
 */

import type { Position } from "@/lib/strategy/archetypes/schema";

export type SkillPosition = "QB" | "RB" | "WR" | "TE";

type AgeCurve = {
  peakLow: number;
  peakHigh: number;
  // Age at which soft decline accelerates into the cliff regime.
  cliffAge: number;
  // Multiplier reduction per year below peak (lower = better).
  upsideBoostPerYear: number;
  // Multiplier increase per year above peak (soft decline).
  declinePerYear: number;
  // Multiplier increase per year past the cliff age (accelerated).
  cliffPenalty: number;
  // Floor on upside boost to avoid unrealistic discounts on very
  // young prospects (a 19-year-old RB is still uncertain).
  minFactor: number;
};

const AGE_CURVES: Record<SkillPosition, AgeCurve> = {
  QB: {
    peakLow: 27,
    peakHigh: 33,
    cliffAge: 38,
    upsideBoostPerYear: 0.05,
    declinePerYear: 0.06,
    cliffPenalty: 0.20,
    minFactor: 0.70,
  },
  RB: {
    peakLow: 23,
    peakHigh: 26,
    cliffAge: 29,
    upsideBoostPerYear: 0.10,
    declinePerYear: 0.20,
    cliffPenalty: 0.40,
    minFactor: 0.65,
  },
  WR: {
    peakLow: 25,
    peakHigh: 29,
    cliffAge: 32,
    upsideBoostPerYear: 0.08,
    declinePerYear: 0.10,
    cliffPenalty: 0.25,
    minFactor: 0.65,
  },
  TE: {
    peakLow: 25,
    peakHigh: 29,
    cliffAge: 34,
    upsideBoostPerYear: 0.07,
    declinePerYear: 0.08,
    cliffPenalty: 0.20,
    minFactor: 0.70,
  },
};

function isSkillPosition(p: string): p is SkillPosition {
  return p === "QB" || p === "RB" || p === "WR" || p === "TE";
}

/**
 * Project the age factor as if the player had aged N years from
 * today. Used by the contender-outlook forecast to score the same
 * roster against multiple future seasons. A 25-year-old WR aged
 * +3 years lands at 28 (still in peak); a 27-year-old RB aged +3
 * years lands at 30 (past cliff). The position curves do the rest.
 */
export function projectedAgeFactor(
  position: string | null,
  currentAge: number | null,
  yearsForward: number,
): number {
  if (currentAge == null) return 1.2;
  return ageFactor(position, currentAge + yearsForward);
}

export function ageFactor(
  position: string | null,
  age: number | null,
): number {
  // Unknown age: mildly negative prior (treat as "likely aging").
  if (age == null) return 1.2;
  if (!position || !isSkillPosition(position)) return 1.0;
  const curve = AGE_CURVES[position];
  if (age >= curve.peakLow && age <= curve.peakHigh) return 1.0;
  if (age < curve.peakLow) {
    const yearsBelow = curve.peakLow - age;
    return Math.max(
      curve.minFactor,
      1.0 - yearsBelow * curve.upsideBoostPerYear,
    );
  }
  const yearsAbove = age - curve.peakHigh;
  if (age <= curve.cliffAge) {
    return 1.0 + yearsAbove * curve.declinePerYear;
  }
  const yearsPastCliff = age - curve.cliffAge;
  const cliffStartPenalty =
    (curve.cliffAge - curve.peakHigh) * curve.declinePerYear;
  return 1.0 + cliffStartPenalty + yearsPastCliff * curve.cliffPenalty;
}

/**
 * Tier-aware superflex QB premium. A flat 0.9 multiplier (the prior
 * implementation) compressed the entire SF QB scarcity gradient into
 * a rounding error. Community pricing (RosterIQ, DLF) describes the
 * SF QB premium as "Grand Canyon" sized at the elite tier and
 * shallow at the replacement tier.
 *
 * Mapping Sleeper search_rank → tier (skill-position rank, not overall):
 *   top-12 QB  ≈ rank ≤ 50
 *   QB13-24    ≈ rank 51-100
 *   QB25+      ≈ rank 101+
 */
export function positionFactor(
  position: string | null,
  isSuperflex: boolean,
  searchRank: number,
): number {
  if (position !== "QB" || !isSuperflex) return 1.0;
  if (searchRank <= 50) return 0.55;
  if (searchRank <= 100) return 0.70;
  return 0.85;
}

/**
 * Position-aware cutoff for filtering "retired but not marked retired"
 * veterans (Brady, Brees, Roethlisberger types with stale active status).
 * The prior flat age-35 cutoff amputated legitimate aging-vet picks at
 * QB (Brady, Rodgers, Stafford). Per-position cutoffs match the cliff
 * ages from the age-curve research above, plus a couple of years of
 * tolerance for the occasional outlier.
 */
const AGE_CUTOFF_BY_POSITION: Record<Position, number> = {
  QB: 38,
  RB: 32,
  WR: 33,
  TE: 34,
  K: 39,
  DST: 99,
};

export function positionAgeCutoff(position: string | null): number {
  if (!position) return 35;
  const key = position as Position;
  return AGE_CUTOFF_BY_POSITION[key] ?? 35;
}

/**
 * Position-aware rookie penalty for window constraints. RB rookies hit
 * top-24 at year 1 roughly 30-40% of the time; WR rookies ~15-25%; TE
 * rookies are slowest to develop. Prior implementation used a flat
 * 40 / 20 penalty that penalized Bijan-like rookie RBs the same as
 * rookie TEs, which misprices the actual hit-rate distribution.
 * Sources: Dynasty Nerds R1-RB study, Late Round rookie-hit-rate
 * series, Statchasers rookie hit rates.
 */
const ROOKIE_PENALTY_BY_POSITION: Record<
  Position,
  { heavy: number; moderate: number }
> = {
  QB: { heavy: 50, moderate: 25 },
  RB: { heavy: 25, moderate: 12 },
  WR: { heavy: 50, moderate: 25 },
  TE: { heavy: 60, moderate: 30 },
  K: { heavy: 30, moderate: 15 },
  DST: { heavy: 30, moderate: 15 },
};

export function rookiePenalty(
  position: string | null,
  strength: "heavy" | "moderate",
): number {
  if (!position) return strength === "heavy" ? 40 : 20;
  const key = position as Position;
  const entry = ROOKIE_PENALTY_BY_POSITION[key];
  if (!entry) return strength === "heavy" ? 40 : 20;
  return entry[strength];
}
