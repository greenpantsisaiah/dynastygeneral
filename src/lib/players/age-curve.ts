/**
 * Canonical position-conditioned age effect (Phase C3 of
 * MODEL_LIVE_PLAN.md). ONE smooth curve, three adapter shapes. This
 * module is the single source of truth for "how does age change a
 * player's value" anywhere in the product. Before this consolidation
 * four implementations had drifted: a piecewise rank multiplier here,
 * a stepwise production multiplier in engine/evaluation/util.ts, a
 * signed [-1,+1] dial curve in decision-synthesis/synthesize.ts, and
 * the roster-aggregate win-now / future signals in windows/compute.ts.
 * All now derive from the shoulders defined below.
 *
 * THE CORE: ageRetention(position, age) is a production-retention
 * value in [0,1]. It is 1.0 across a flat peak shelf [peakLow,
 * peakHigh] and falls off through smooth Gaussian shoulders on each
 * side. The shoulders are C1-smooth: a Gaussian has zero slope at its
 * center, so where each shoulder meets the flat shelf the value AND
 * the first derivative are continuous. There are no stepwise
 * breakpoints and no slope discontinuities at integer birthdays.
 *
 * Why smooth, not bins: INVARIANTS.md "Smooth curves, not breakpoints"
 * (age curves use Gaussian + sigmoid, not stepwise thresholds) and the
 * assumption-auditor standing rule that a categorical bin where reality
 * is continuous is at minimum Weak. The published phenomenon is a
 * distribution of peak seasons across a window (Apex peak-age series),
 * not a single integer peak with a cliff edge.
 *
 * Grounding (per RESEARCH_CORPUS.md, dynasty-canon-keeper CRITIQUE
 * 2026-05-29, verdict Defensible/USE after the WR adjustment):
 *   RB: peak 23-26 (Apex mean peak 25.46; dynasty sell window 25-26).
 *       Decline calibrated to Northwestern Sports Analytics 2020: the
 *       age 28 to 29 dropoff is 25.2% PPR PPG. This curve drops 24.1%
 *       across 28 to 29, a near-exact match.
 *   WR: peak 25-29 (Apex mean 26.95; concentrated 26-29; fades ~30).
 *       sigmaOld tuned to 2.15 so the 32+ shoulder is steep enough to
 *       have downgraded the Hill 31 / Kupp 32 / Andrews 30 busts that
 *       MODEL_CARD section 12 named as the "too gentle at 30+" failure,
 *       while keeping the gentle 30-31 entry the empirical
 *       age-curve-validation.md supports (it flags age 30-31 as
 *       underpriced under the old bins).
 *   TE: peak 25-29 (Apex mean 26.78; 41% of qualifying seasons 25-27).
 *       Widest old-side sigma + highest old floor: TE has the shallowest
 *       empirical cliff and the slowest development of the four
 *       positions, so a low young floor (slow development) and a long,
 *       gentle old shoulder (useful through 33-34).
 *   QB: peak 27-33. This is the POPULATION / mid-tier BASE curve, used
 *       only where no tier is known (the available-player pool, scout,
 *       contender forecast). The QB rubric keeps its own
 *       tier-conditional curve (qbAgeMultiplier in rubrics/qb.ts):
 *       elite QBs age past 35, mid-tier decline at 33-34. Folding QB
 *       into one base curve would re-commit the exact error the corpus
 *       debunks (Stathole "Mirage of the QB Age Cliff"; Apex elite
 *       cohort; Harstad mortality table): averaging two genuinely
 *       different distributions into one curve wrong for both. The wide
 *       base sigma respects the debunk; the tier overlay sharpens where
 *       tier is known.
 *
 * Survivorship caveat (corpus): the public cohort tables are
 * upward-biased at 32+ because retirees leave the sample, so cliff AGE
 * is more reliable than cliff MAGNITUDE. Peak windows are held tight to
 * the corpus; decline magnitudes lean on the cited effect sizes (RB)
 * and the live backtest (WR) rather than the survivor-biased medians.
 */

import type { Position } from "@/lib/strategy/archetypes/schema";

export type SkillPosition = "QB" | "RB" | "WR" | "TE";

type AgeShape = {
  // Flat peak shelf: retention is 1.0 for peakLow <= age <= peakHigh.
  peakLow: number;
  peakHigh: number;
  // Gaussian shoulder widths (years). Larger = gentler falloff.
  sigmaYoung: number;
  sigmaOld: number;
  // Retention floor each shoulder decays toward (production never goes
  // to zero: a deep-bench veteran still has some value). floorOld is
  // ordering-defensible (RB lowest, QB highest residual) and binds only
  // in the survivor-biased tails; floorYoung is INTERNAL_HEURISTIC (not
  // citation-fit, mostly feeds the separately-floored ageFactor youth
  // boost), flagged for a future rookie-hit-rate backtest.
  floorYoung: number;
  floorOld: number;
  // The signed youth-dial adapter (ageCurveSigned) is a tanh centered
  // on the age where "young upside" crosses into "aging downside" (a
  // little past peakHigh, where the corpus zero-crossing sits), with
  // its own spread. It is steeper than the retention shoulders on
  // purpose: the dial needs to reach +/-1 across the realistic age
  // range, which the wide retention shoulders do not.
  signedCenter: number;
  signedSpread: number;
};

const AGE_SHAPES: Record<SkillPosition, AgeShape> = {
  QB: {
    peakLow: 27,
    peakHigh: 33,
    sigmaYoung: 3.5,
    sigmaOld: 6.0,
    floorYoung: 0.78,
    floorOld: 0.55,
    signedCenter: 31.5,
    signedSpread: 3.5,
  },
  RB: {
    peakLow: 23,
    peakHigh: 26,
    sigmaYoung: 2.2,
    sigmaOld: 2.3,
    floorYoung: 0.8,
    floorOld: 0.28,
    signedCenter: 26.5,
    signedSpread: 2.5,
  },
  WR: {
    peakLow: 25,
    peakHigh: 29,
    sigmaYoung: 2.5,
    sigmaOld: 2.15,
    floorYoung: 0.78,
    floorOld: 0.35,
    signedCenter: 28.5,
    signedSpread: 3.0,
  },
  TE: {
    peakLow: 25,
    peakHigh: 29,
    sigmaYoung: 2.5,
    sigmaOld: 3.2,
    floorYoung: 0.55,
    floorOld: 0.45,
    signedCenter: 29.0,
    signedSpread: 3.0,
  },
};

function isSkillPosition(p: string): p is SkillPosition {
  return p === "QB" || p === "RB" || p === "WR" || p === "TE";
}

// Gaussian shoulder below the peak shelf. 1.0 at and above peakLow,
// decaying smoothly toward 0 for younger ages. Zero slope at peakLow.
function youngShoulder(shape: AgeShape, age: number): number {
  if (age >= shape.peakLow) return 1;
  const d = shape.peakLow - age;
  return Math.exp(-(d * d) / (2 * shape.sigmaYoung * shape.sigmaYoung));
}

// Gaussian shoulder above the peak shelf. 1.0 at and below peakHigh,
// decaying smoothly toward 0 for older ages. Zero slope at peakHigh.
function oldShoulder(shape: AgeShape, age: number): number {
  if (age <= shape.peakHigh) return 1;
  const d = age - shape.peakHigh;
  return Math.exp(-(d * d) / (2 * shape.sigmaOld * shape.sigmaOld));
}

/**
 * THE CORE. Position-conditioned production-retention multiplier in
 * [floor, 1.0]. 1.0 across the flat peak shelf; smooth Gaussian
 * shoulders falling toward floorYoung (young) and floorOld (old).
 * Unknown age returns 1.0 (no adjustment); non-skill positions (K/DST)
 * have no age curve and return 1.0.
 */
export function ageRetention(
  position: string | null,
  age: number | null,
): number {
  if (age == null) return 1.0;
  if (!position || !isSkillPosition(position)) return 1.0;
  const shape = AGE_SHAPES[position];
  if (age >= shape.peakLow && age <= shape.peakHigh) return 1.0;
  if (age < shape.peakLow) {
    return shape.floorYoung + (1 - shape.floorYoung) * youngShoulder(shape, age);
  }
  return shape.floorOld + (1 - shape.floorOld) * oldShoulder(shape, age);
}

/**
 * ADAPTER A (rubrics). Single-season production multiplier, centered
 * on 1.0 at peak. This IS the core retention value. Consumed by the
 * RB / WR / TE position rubrics in engine/evaluation/. QB uses its own
 * tier-conditional curve in rubrics/qb.ts and does not call this.
 */
export function ageMultiplier(position: string, age: number | null): number {
  return ageRetention(position, age);
}

// ADAPTER B + C calibration constants. Shared across positions so a
// single tuning move propagates; position differences come from the
// shape (peak windows + sigmas), not from per-position magic numbers.
//
// AGE_FACTOR_YOUTH_BOOST: how much a fully-young player's rank factor
//   drops below 1.0 (a dynasty-horizon upside discount on the asset).
//   INTERNAL_HEURISTIC: not fit to a citation; bounded by AGE_FACTOR_MIN.
// AGE_FACTOR_DECLINE: scales lost production retention into a rank
//   penalty above 1.0. Calibrated so a 28yo RB (retention 0.77) lands
//   near 1.40 and a 30yo RB (retention 0.44) near 2.0, preserving the
//   historical ageFactor scale the contender-outlook forecast bands
//   (1.4 / 1.8) were tuned against. NOTE: this scalar was fit on the RB
//   band and is inherited by WR/TE/QB (one shared scale by design); the
//   Phase D6 snapshot-diff is the gate that confirms the inherited bands
//   still read defensibly (dynasty-assumption-auditor 2026-05-29).
// AGE_FACTOR_MIN: floor on the young-side boost so a teenage prospect
//   does not rank absurdly above proven players.
const AGE_FACTOR_YOUTH_BOOST = 0.55;
const AGE_FACTOR_DECLINE = 1.76;
const AGE_FACTOR_MIN = 0.6;

/**
 * ADAPTER B (youth dial). Signed age effect in [-1, +1]. Positive for
 * the young, upside-tilted end of a position's curve; negative for the
 * past-peak end; ~0 at the peak. Smooth (tanh), monotonic decreasing in
 * age. Consumed by the youth_weight Soundboard dial in synthesize.ts
 * (the dial scales this), so the board, /rankings, and Coach all move
 * the same direction by the same shape.
 */
export function ageCurveSigned(
  position: string | null,
  age: number | null,
): number {
  if (age == null) return 0;
  if (!position || !isSkillPosition(position)) return 0;
  const shape = AGE_SHAPES[position];
  return Math.tanh((shape.signedCenter - age) / shape.signedSpread);
}

/**
 * ADAPTER C (player pool / scout / contender forecast). Rank
 * multiplier where LOWER = better asset (factors multiply search_rank;
 * a lower rank is a better dynasty asset). 1.0 at peak, below 1.0 for
 * the young (a dynasty-horizon boost), above 1.0 for the aging (a
 * production-decline penalty derived from lost retention). The youth
 * boost uses the young Gaussian shoulder; the decline penalty scales
 * (1 - retention). Both are smooth with zero slope at the shelf edges.
 *
 * Unknown age returns 1.2 (a mild "likely aging" prior); non-skill
 * positions return 1.0.
 */
export function ageFactor(
  position: string | null,
  age: number | null,
): number {
  if (age == null) return 1.2;
  if (!position || !isSkillPosition(position)) return 1.0;
  const shape = AGE_SHAPES[position];
  if (age >= shape.peakLow && age <= shape.peakHigh) return 1.0;
  if (age < shape.peakLow) {
    const boost = AGE_FACTOR_YOUTH_BOOST * (1 - youngShoulder(shape, age));
    return Math.max(AGE_FACTOR_MIN, 1.0 - boost);
  }
  const penalty = AGE_FACTOR_DECLINE * (1 - ageRetention(position, age));
  return 1.0 + penalty;
}

/**
 * Project the age factor as if the player had aged N years from today.
 * Used by the contender-outlook forecast to score the same roster
 * against multiple future seasons. A 25-year-old WR aged +3 lands at 28
 * (still peak); a 27-year-old RB aged +3 lands at 30 (past cliff). The
 * position curves do the rest.
 */
export function projectedAgeFactor(
  position: string | null,
  currentAge: number | null,
  yearsForward: number,
): number {
  if (currentAge == null) return 1.2;
  return ageFactor(position, currentAge + yearsForward);
}

/**
 * ROSTER-AGGREGATE win-now age signal (0..1). Skew-Gaussian peak curve,
 * smooth everywhere. Distinct from the per-player position curve above:
 * this reads a single roster-level average age (no position to
 * condition on) and answers "how strong is the lineup right now."
 * Relocated here from windows/compute.ts so all age math lives in one
 * tunable module; the math is unchanged.
 *
 *   peakAge 27       proven prime production
 *   sigma 3.5 / 5.5  steeper ramp up, gentler decline
 *   baseline 0.2     floor for very young (unproven) rosters
 *   peak 1.0         maximum at peakAge
 * Sample: 22->0.49, 25->0.86, 27->1.00, 30->0.89, 33->0.65, 36->0.36.
 */
export function winNowAgeSignal(age: number | null): number {
  if (age == null) return 0.5;
  const peakAge = 27;
  const sigma = age < peakAge ? 3.5 : 5.5;
  const baseline = 0.2;
  const peak = 1.0;
  const distance = age - peakAge;
  const gaussian = Math.exp(-(distance * distance) / (2 * sigma * sigma));
  return baseline + (peak - baseline) * gaussian;
}

/**
 * ROSTER-AGGREGATE future-value age signal (0..1). Logistic decline,
 * monotonically decreasing, smooth everywhere. Distinct from the
 * per-player curve (roster-level average age in, no position).
 * Relocated from windows/compute.ts unchanged.
 *
 *   midAge 28   inflection point   k 2.5   transition sharpness
 *   floor 0.1   residual future value for very-old rosters
 * Sample: 22->0.92, 25->0.79, 28->0.55, 31->0.27, 34->0.14.
 */
export function futureAgeSignal(age: number | null): number {
  if (age == null) return 0.5;
  const midAge = 28;
  const k = 2.5;
  const floor = 0.1;
  const peak = 1.0;
  const sigmoid = 1 / (1 + Math.exp((age - midAge) / k));
  return floor + (peak - floor) * sigmoid;
}

/**
 * Tier-aware superflex QB premium. A flat 0.9 multiplier (the prior
 * implementation) compressed the entire SF QB scarcity gradient into a
 * rounding error. Community pricing (RosterIQ, DLF) describes the SF QB
 * premium as "Grand Canyon" sized at the elite tier and shallow at the
 * replacement tier.
 *
 * Mapping Sleeper search_rank -> tier (skill-position rank):
 *   top-12 QB  ~ rank <= 50
 *   QB13-24    ~ rank 51-100
 *   QB25+      ~ rank 101+
 */
export function positionFactor(
  position: string | null,
  isSuperflex: boolean,
  searchRank: number,
): number {
  if (position !== "QB" || !isSuperflex) return 1.0;
  if (searchRank <= 50) return 0.55;
  if (searchRank <= 100) return 0.7;
  return 0.85;
}

/**
 * Position-aware cutoff for filtering "retired but not marked retired"
 * veterans (stale active status). The prior flat age-35 cutoff
 * amputated legitimate aging-vet QBs. Per-position cutoffs match the
 * cliff ages from the age-curve research above, plus a couple years of
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
 * rookies are slowest to develop. Sources: Dynasty Nerds R1-RB study,
 * Late Round rookie-hit-rate series, Statchasers rookie hit rates.
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
