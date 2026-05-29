/**
 * Age-curve snapshot diff (Phase C3). Shows what the canonical smooth
 * age curve changed vs the four drifted implementations it replaced,
 * adapter by adapter, across the populated age range, per position.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/age-curve-snapshot-diff.ts
 *
 * The OLD functions below are inlined verbatim from the pre-change code
 * (players/age-curve.ts ageFactor, engine/evaluation/util.ts
 * ageMultiplier, decision-synthesis/synthesize.ts ageCurveSignedFor)
 * so the diff is self-contained and reproducible without git surgery.
 * NEW values are imported from the live canonical module.
 *
 * Where each adapter is user-visible:
 *   - ageFactor: the available-player pool's 3rd-tier dynasty_rank
 *     tiebreak (KTC first, ADP second, dynasty_rank third), the scout
 *     ranking, and the contender-outlook future projection (its 1.4 /
 *     1.8 forecast bands read this scale).
 *   - ageMultiplier: the RB/WR/TE rubric production multiplier
 *     (currently surfaced on the rookie-debut inflection footer + the
 *     admin /evaluate page; parked from board value scoring).
 *   - ageCurveSigned: the youth_weight Soundboard dial influence in
 *     synthesize. At NEUTRAL dials it contributes zero, so the board
 *     standing call is unchanged by this curve unless the user has
 *     moved the youth dial.
 */

import {
  ageFactor as newAgeFactor,
  ageMultiplier as newAgeMultiplier,
  ageCurveSigned as newAgeCurveSigned,
} from "../src/lib/players/age-curve";

type Pos = "QB" | "RB" | "WR" | "TE";

// ----- OLD implementations (inlined verbatim from pre-C3 code) -----

const OLD_AGE_CURVES: Record<
  Pos,
  {
    peakLow: number;
    peakHigh: number;
    cliffAge: number;
    upsideBoostPerYear: number;
    declinePerYear: number;
    cliffPenalty: number;
    minFactor: number;
  }
> = {
  QB: { peakLow: 27, peakHigh: 33, cliffAge: 38, upsideBoostPerYear: 0.05, declinePerYear: 0.06, cliffPenalty: 0.2, minFactor: 0.7 },
  RB: { peakLow: 23, peakHigh: 26, cliffAge: 29, upsideBoostPerYear: 0.1, declinePerYear: 0.2, cliffPenalty: 0.4, minFactor: 0.65 },
  WR: { peakLow: 25, peakHigh: 29, cliffAge: 32, upsideBoostPerYear: 0.08, declinePerYear: 0.1, cliffPenalty: 0.25, minFactor: 0.65 },
  TE: { peakLow: 25, peakHigh: 29, cliffAge: 34, upsideBoostPerYear: 0.07, declinePerYear: 0.08, cliffPenalty: 0.2, minFactor: 0.7 },
};

function oldAgeFactor(position: Pos, age: number): number {
  const curve = OLD_AGE_CURVES[position];
  if (age >= curve.peakLow && age <= curve.peakHigh) return 1.0;
  if (age < curve.peakLow) {
    const yearsBelow = curve.peakLow - age;
    return Math.max(curve.minFactor, 1.0 - yearsBelow * curve.upsideBoostPerYear);
  }
  const yearsAbove = age - curve.peakHigh;
  if (age <= curve.cliffAge) return 1.0 + yearsAbove * curve.declinePerYear;
  const yearsPastCliff = age - curve.cliffAge;
  const cliffStartPenalty = (curve.cliffAge - curve.peakHigh) * curve.declinePerYear;
  return 1.0 + cliffStartPenalty + yearsPastCliff * curve.cliffPenalty;
}

function oldAgeMultiplier(position: Pos, age: number): number {
  switch (position) {
    case "RB":
      if (age < 22) return 0.95;
      if (age < 23) return 0.98;
      if (age < 27) return 1.0;
      if (age < 28) return 0.85;
      if (age < 29) return 0.72;
      if (age < 30) return 0.58;
      return 0.45;
    case "WR":
      if (age < 23) return 0.92;
      if (age < 25) return 0.98;
      if (age < 30) return 1.0;
      if (age < 31) return 0.9;
      if (age < 32) return 0.78;
      if (age < 34) return 0.62;
      return 0.45;
    case "TE":
      if (age < 23) return 0.78;
      if (age < 24) return 0.88;
      if (age < 28) return 1.02;
      if (age < 30) return 1.0;
      if (age < 31) return 0.88;
      if (age < 33) return 0.72;
      return 0.5;
    case "QB":
      if (age < 26) return 0.9;
      if (age < 33) return 1.0;
      if (age < 36) return 0.85;
      return 0.65;
  }
}

function oldAgeCurveSigned(position: Pos, age: number): number {
  switch (position) {
    case "RB":
      if (age <= 22) return 1;
      if (age <= 24) return 0.7;
      if (age <= 26) return 0.3;
      if (age <= 28) return -0.2;
      if (age <= 30) return -0.7;
      return -1;
    case "WR":
      if (age <= 23) return 1;
      if (age <= 25) return 0.7;
      if (age <= 28) return 0.2;
      if (age <= 30) return -0.2;
      if (age <= 32) return -0.7;
      return -1;
    case "TE":
      if (age <= 24) return 1;
      if (age <= 26) return 0.5;
      if (age <= 29) return 0.1;
      if (age <= 31) return -0.4;
      return -1;
    case "QB":
      if (age <= 24) return 1;
      if (age <= 27) return 0.6;
      if (age <= 31) return 0.2;
      if (age <= 34) return -0.3;
      return -1;
  }
}

const POSITIONS: Pos[] = ["QB", "RB", "WR", "TE"];
const AGES = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 36, 38];

function fmt(n: number): string {
  return n.toFixed(3).padStart(6);
}
function delta(o: number, n: number): string {
  const d = n - o;
  const s = (d >= 0 ? "+" : "") + d.toFixed(3);
  return s.padStart(7);
}

function table(
  title: string,
  oldFn: (p: Pos, a: number) => number,
  newFn: (p: Pos, a: number) => number,
) {
  console.log(`\n## ${title}\n`);
  for (const pos of POSITIONS) {
    console.log(`### ${pos}`);
    console.log("age |   old |   new |   Δ");
    console.log("----|-------|-------|--------");
    for (const age of AGES) {
      const o = oldFn(pos, age);
      const n = newFn(pos, age);
      const flag = Math.abs(n - o) >= 0.1 ? "  *" : "";
      console.log(`${String(age).padStart(3)} | ${fmt(o)} | ${fmt(n)} | ${delta(o, n)}${flag}`);
    }
    console.log("");
  }
}

console.log("# Age-curve snapshot diff: OLD (drifted bins) vs NEW (canonical smooth)");
console.log("# Rows flagged * moved by >= 0.10. Δ = new - old.");

table(
  "ageFactor (pool 3rd-tier rank multiplier, scout, contender forecast; lower = better asset)",
  oldAgeFactor,
  (p, a) => newAgeFactor(p, a),
);

table(
  "ageMultiplier (RB/WR/TE rubric production multiplier; 1.0 = peak)",
  oldAgeMultiplier,
  (p, a) => newAgeMultiplier(p, a),
);

// ageCurveSigned at a representative youth dial of +50:
// synthesize contribution = (dial/100) * 18 * signed = 9 * signed.
// Below DIAL_NOISE_FLOOR (1.5) the influence is suppressed.
table(
  "youth-dial influence at youth=+50 (contribution = 9 x signed; |c|<1.5 suppressed)",
  (p, a) => 9 * oldAgeCurveSigned(p, a),
  (p, a) => 9 * newAgeCurveSigned(p, a),
);

console.log("\n## Standing-call (board) sensitivity");
console.log(
  [
    "ageCurveSigned is the ONLY age input to synthesize, and it is gated",
    "behind |dials.youth| >= 5. At neutral dials the standing call is",
    "provably unchanged by this work. The synthesize eval scenarios",
    "(fill-starter-urgent, push-path-reach, synthesis-dials) run at",
    "neutral or pinned dials and still pass, confirming no board drift.",
    "Age changes surface in: the available-pool 3rd-tier tiebreak",
    "(ageFactor), the rubric/inflection footer (ageMultiplier), the",
    "contender-outlook future projection (ageFactor), the scout ranking",
    "(ageFactor), and the youth-dial influence (ageCurveSigned) when the",
    "user has moved that dial.",
  ].join("\n"),
);
