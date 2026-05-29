/**
 * Canonical age-curve regression tests (Phase C3 of MODEL_LIVE_PLAN.md).
 *
 *   npx tsx --tsconfig tsconfig.json evals/age-curve.test.ts
 *
 * Locks the ONE canonical position-conditioned age effect that replaced
 * four drifted implementations. Covers each position (QB/RB/WR/TE) and
 * the shape contract the curve must satisfy:
 *
 *   - Flat peak shelf: retention == 1.0 across [peakLow, peakHigh].
 *   - Monotonic decline moving away from the shelf on each side.
 *   - SMOOTH, not stepwise: the per-year decline ACCELERATES away from
 *     the shelf edge (a Gaussian shoulder), the opposite signature of a
 *     bin curve (a flat run then a single cliff step). The slope at the
 *     shelf edge is near zero (C1-smooth), so the first post-peak year
 *     moves less than the second and third.
 *   - Floors respected; bounded output ranges.
 *   - Grounding anchors: RB 28->29 production drop matches Northwestern
 *     2020 (25.2% PPR PPG); WR 32 retention is steep enough (~0.60) to
 *     have flagged the MODEL_CARD section 12 aging-WR busts.
 *   - Adapter consistency: ageMultiplier == ageRetention; ageFactor is
 *     1.0 at peak, <1 young, >1 old; ageCurveSigned is in [-1,1],
 *     monotonic decreasing, ~0 at the signed center.
 *   - Roster-aggregate signals (relocated, number-preserving) reproduce
 *     their documented sample values.
 */

import {
  ageRetention,
  ageMultiplier,
  ageFactor,
  ageCurveSigned,
  projectedAgeFactor,
  winNowAgeSignal,
  futureAgeSignal,
  type SkillPosition,
} from "../src/lib/players/age-curve";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function approx(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

// Peak shelves per the canonical shapes (kept in sync with age-curve.ts).
const PEAK: Record<SkillPosition, [number, number]> = {
  QB: [27, 33],
  RB: [23, 26],
  WR: [25, 29],
  TE: [25, 29],
};

const POSITIONS: SkillPosition[] = ["QB", "RB", "WR", "TE"];

function run() {
  console.log("Age curve · canonical shape + per-position grounding\n");

  // --- 1. Flat peak shelf: retention == 1.0 across the shelf ---
  for (const pos of POSITIONS) {
    const [lo, hi] = PEAK[pos];
    let allOne = true;
    for (let age = lo; age <= hi; age++) {
      if (!approx(ageRetention(pos, age), 1.0, 1e-9)) allOne = false;
    }
    check(`${pos}: retention is flat 1.0 across peak shelf ${lo}-${hi}`, allOne);
  }

  // --- 2. Monotonic decline on each shoulder ---
  for (const pos of POSITIONS) {
    const [lo, hi] = PEAK[pos];
    // Young side: retention should INCREASE from young toward peakLow.
    let youngMono = true;
    for (let age = 18; age < lo; age++) {
      if (ageRetention(pos, age) > ageRetention(pos, age + 1) + 1e-9) {
        youngMono = false;
      }
    }
    check(`${pos}: retention rises monotonically toward peakLow`, youngMono);

    // Old side: retention should DECREASE past peakHigh.
    let oldMono = true;
    for (let age = hi; age < hi + 12; age++) {
      if (ageRetention(pos, age) < ageRetention(pos, age + 1) - 1e-9) {
        oldMono = false;
      }
    }
    check(`${pos}: retention falls monotonically past peakHigh`, oldMono);
  }

  // --- 3. SMOOTH, not stepwise: decline ACCELERATES off the shelf ---
  // A Gaussian shoulder has ~zero slope at the shelf edge, so the drop
  // from peakHigh to peakHigh+1 is SMALLER than peakHigh+1 to +2, which
  // is smaller than +2 to +3. A bin curve would show a flat run then
  // one big step (the opposite signature).
  for (const pos of POSITIONS) {
    const [, hi] = PEAK[pos];
    const d1 = ageRetention(pos, hi) - ageRetention(pos, hi + 1);
    const d2 = ageRetention(pos, hi + 1) - ageRetention(pos, hi + 2);
    const d3 = ageRetention(pos, hi + 2) - ageRetention(pos, hi + 3);
    check(
      `${pos}: old-side decline accelerates (d1<d2<d3), no cliff step`,
      d1 < d2 + 1e-9 && d2 < d3 + 1e-9,
      `Δ ${d1.toFixed(3)} < ${d2.toFixed(3)} < ${d3.toFixed(3)}`,
    );
    // No single-year drop is a hard cliff (> 0.30 of total range).
    let maxStep = 0;
    for (let age = hi; age < hi + 12; age++) {
      maxStep = Math.max(
        maxStep,
        ageRetention(pos, age) - ageRetention(pos, age + 1),
      );
    }
    check(
      `${pos}: no single-year stepwise cliff in retention`,
      maxStep <= 0.3,
      `max single-year drop ${maxStep.toFixed(3)}`,
    );
  }

  // --- 4. Floors + bounds ---
  for (const pos of POSITIONS) {
    let inBounds = true;
    for (let age = 18; age <= 44; age++) {
      const r = ageRetention(pos, age);
      if (r < 0 || r > 1.0 + 1e-9) inBounds = false;
    }
    check(`${pos}: retention stays within [0, 1]`, inBounds);
  }

  // --- 5. Grounding anchors ---
  // RB 28->29 production drop matches Northwestern 2020 (25.2% PPG).
  {
    const r28 = ageRetention("RB", 28);
    const r29 = ageRetention("RB", 29);
    const dropPct = ((r28 - r29) / r28) * 100;
    check(
      "RB 28->29 retention drop matches Northwestern ~25.2%",
      approx(dropPct, 25.2, 4),
      `drop ${dropPct.toFixed(1)}% (r28=${r28.toFixed(3)}, r29=${r29.toFixed(3)})`,
    );
  }
  // WR 32 retention steep enough to flag the section-12 aging-WR busts.
  {
    const r32 = ageRetention("WR", 32);
    check(
      "WR age-32 retention is steep (~0.60), catches Kupp/Hill/Andrews class",
      r32 <= 0.65,
      `retention(WR,32)=${r32.toFixed(3)}`,
    );
    // ...while the 30-31 entry stays gentle (empirical underprice finding).
    const r30 = ageRetention("WR", 30);
    check(
      "WR age-30 stays gentle (>0.90), honors empirical 30-31 underprice",
      r30 > 0.9,
      `retention(WR,30)=${r30.toFixed(3)}`,
    );
  }
  // QB base curve ages gracefully (debunk of the uniform 32 cliff).
  {
    const r35 = ageRetention("QB", 35);
    const r38 = ageRetention("QB", 38);
    check(
      "QB base ages gracefully (35>0.9, 38>0.8): respects cliff debunk",
      r35 > 0.9 && r38 > 0.8,
      `r35=${r35.toFixed(3)}, r38=${r38.toFixed(3)}`,
    );
  }
  // TE has the shallowest cliff of the four (useful through 33-34).
  {
    const teDrop = ageRetention("TE", 30) - ageRetention("TE", 34);
    const rbDrop = ageRetention("RB", 27) - ageRetention("RB", 31);
    check(
      "TE old-side decline is shallower than RB's over a 4-year span",
      teDrop < rbDrop,
      `TE Δ ${teDrop.toFixed(3)} < RB Δ ${rbDrop.toFixed(3)}`,
    );
  }

  // --- 6. Adapter A: ageMultiplier == ageRetention; null + non-skill ---
  {
    let identical = true;
    for (const pos of POSITIONS) {
      for (let age = 18; age <= 40; age++) {
        if (!approx(ageMultiplier(pos, age), ageRetention(pos, age), 1e-12)) {
          identical = false;
        }
      }
    }
    check("ageMultiplier === ageRetention across positions/ages", identical);
    check("ageMultiplier(null age) == 1.0", approx(ageMultiplier("RB", null), 1.0, 1e-9));
    check("ageMultiplier(K, 30) == 1.0 (no curve)", approx(ageMultiplier("K", 30), 1.0, 1e-9));
  }

  // --- 7. Adapter C: ageFactor (rank multiplier, lower = better) ---
  for (const pos of POSITIONS) {
    const [lo, hi] = PEAK[pos];
    check(`${pos}: ageFactor == 1.0 at peak`, approx(ageFactor(pos, lo), 1.0, 1e-9) && approx(ageFactor(pos, hi), 1.0, 1e-9));
    check(`${pos}: ageFactor < 1 for the young (boost)`, ageFactor(pos, lo - 3) < 1.0);
    check(`${pos}: ageFactor > 1 for the aging (penalty)`, ageFactor(pos, hi + 3) > 1.0);
    // Monotonic non-decreasing in age past the peak.
    let mono = true;
    for (let age = hi; age < hi + 10; age++) {
      if (ageFactor(pos, age) > ageFactor(pos, age + 1) + 1e-9) mono = false;
    }
    check(`${pos}: ageFactor rises monotonically past peak`, mono);
  }
  check("ageFactor(null age) == 1.2 (mild aging prior)", approx(ageFactor("WR", null), 1.2, 1e-9));
  check("ageFactor(DST, 30) == 1.0 (no curve)", approx(ageFactor("DST", 30), 1.0, 1e-9));
  // Preserves the historical decline scale the forecast 1.4/1.8 bands rely on.
  check(
    "ageFactor(RB,28) ~1.4 (forecast band scale preserved)",
    approx(ageFactor("RB", 28), 1.4, 0.12),
    `ageFactor(RB,28)=${ageFactor("RB", 28).toFixed(3)}`,
  );
  // projectedAgeFactor ages forward through the curve.
  check(
    "projectedAgeFactor(RB,27,+3) == ageFactor(RB,30)",
    approx(projectedAgeFactor("RB", 27, 3), ageFactor("RB", 30), 1e-9),
  );

  // --- 8. Adapter B: ageCurveSigned (youth dial, [-1, +1]) ---
  for (const pos of POSITIONS) {
    let inRange = true;
    let mono = true;
    let prev = ageCurveSigned(pos, 18);
    for (let age = 19; age <= 42; age++) {
      const v = ageCurveSigned(pos, age);
      if (v < -1 - 1e-9 || v > 1 + 1e-9) inRange = false;
      if (v > prev + 1e-9) mono = false; // must be non-increasing in age
      prev = v;
    }
    check(`${pos}: ageCurveSigned within [-1, 1]`, inRange);
    check(`${pos}: ageCurveSigned decreases monotonically with age`, mono);
    check(`${pos}: ageCurveSigned positive for the young, negative for the old`, ageCurveSigned(pos, 21) > 0 && ageCurveSigned(pos, 36) < 0);
  }
  check("ageCurveSigned(null age) == 0", approx(ageCurveSigned("RB", null), 0, 1e-9));
  check("ageCurveSigned(K, 24) == 0 (no curve)", approx(ageCurveSigned("K", 24), 0, 1e-9));

  // --- 9. Roster-aggregate signals (relocated, number-preserving) ---
  check("winNowAgeSignal(27) == 1.0 (peak)", approx(winNowAgeSignal(27), 1.0, 1e-9));
  check("winNowAgeSignal(22) ~0.49", approx(winNowAgeSignal(22), 0.49, 0.02), `${winNowAgeSignal(22).toFixed(3)}`);
  check("winNowAgeSignal(33) ~0.65", approx(winNowAgeSignal(33), 0.65, 0.02), `${winNowAgeSignal(33).toFixed(3)}`);
  check("winNowAgeSignal(null) == 0.5", approx(winNowAgeSignal(null), 0.5, 1e-9));
  check("futureAgeSignal(28) ~0.55", approx(futureAgeSignal(28), 0.55, 0.01), `${futureAgeSignal(28).toFixed(3)}`);
  check("futureAgeSignal(22) ~0.92", approx(futureAgeSignal(22), 0.92, 0.02), `${futureAgeSignal(22).toFixed(3)}`);
  check("futureAgeSignal monotonically decreasing", futureAgeSignal(24) > futureAgeSignal(28) && futureAgeSignal(28) > futureAgeSignal(32));

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
