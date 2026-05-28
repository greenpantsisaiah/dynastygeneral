/**
 * Taxi-advisability canonical regression.
 *
 *   npx tsx --tsconfig tsconfig.json evals/taxi-advisable.test.ts
 *
 * Locks the assessTaxiAdvisable signal (src/lib/coach/taxi-advisable.ts):
 * the football read that distinguishes "eligible to taxi" (a league-rules
 * question) from "should be taxied" (a contributor question).
 *
 * The 2026-05-28 bug this enforces against: Coach recommended taxiing
 * Jayden Higgins, who ran 56% snaps / 4 tgt/g as a rookie and projects to
 * compete for WR2 at Houston this year, using his RISING role as the
 * justification. A player ascending into a real role belongs on the active
 * roster, not stashed where he cannot be started. assessTaxiAdvisable must
 * return advisable=false for that shape even though he is taxi-eligible.
 */

import { assessTaxiAdvisable } from "../src/lib/coach/taxi-advisable";
import type { OpportunityProfile } from "../src/lib/players/season-stats";

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

function prof(over: Partial<OpportunityProfile>): OpportunityProfile {
  return {
    snap_share: null,
    targets_per_game: null,
    adot: null,
    drop_rate: null,
    rz_targets_per_game: null,
    targets: null,
    ...over,
  };
}

function run() {
  console.log("\n── assessTaxiAdvisable ──");

  // The Higgins case: rookie-year established role (56% snaps), no prior-
  // prior season (rookie), low-ish dynasty value but a real role. Must
  // steer OFF taxi via the established-role trigger.
  {
    const r = assessTaxiAdvisable({
      taxiEligible: true,
      prevOpportunity: prof({ snap_share: 0.56, targets_per_game: 4 }),
      prevPrevOpportunity: null,
      redraftAdp: null,
    });
    check(
      "Higgins shape (56% snaps rookie year) is NOT taxi_advisable",
      r.advisable === false,
      r.reason,
    );
    check(
      "reason names the established role",
      /real role|56% snaps|active roster/i.test(r.reason),
      r.reason,
    );
  }

  // Rising trend: moderate level this year but climbing from last year.
  // The rising trigger should fire even when the level alone is below the
  // established bar.
  {
    const r = assessTaxiAdvisable({
      taxiEligible: true,
      prevOpportunity: prof({ snap_share: 0.42, targets_per_game: 3 }),
      prevPrevOpportunity: prof({ snap_share: 0.2, targets_per_game: 1.5 }),
      redraftAdp: null,
    });
    check(
      "rising role (20% -> 42% snaps) is NOT taxi_advisable",
      r.advisable === false,
      r.reason,
    );
    check(
      "reason names the rising trend",
      /rising|ascending|up /i.test(r.reason),
      r.reason,
    );
  }

  // Projected startable this year via redraft ADP, with no prior-year
  // usage (a rookie drafted into an immediate job). The ADP trigger is
  // the safety net for the no-usage-yet shape.
  {
    const r = assessTaxiAdvisable({
      taxiEligible: true,
      prevOpportunity: null,
      prevPrevOpportunity: null,
      redraftAdp: 90,
    });
    check(
      "projected this-year starter (redraft ADP 90) is NOT taxi_advisable",
      r.advisable === false,
      r.reason,
    );
    check(
      "reason names the redraft projection",
      /redraft adp|this-year|contributor/i.test(r.reason),
      r.reason,
    );
  }

  // Genuine dev stash: a true rookie with no role last year, no rising
  // trend, and a deep / absent redraft ADP. This is exactly who taxi is
  // for. Must be taxi_advisable.
  {
    const r = assessTaxiAdvisable({
      taxiEligible: true,
      prevOpportunity: null,
      prevPrevOpportunity: null,
      redraftAdp: 280,
    });
    check(
      "deep-ADP rookie with no role IS taxi_advisable",
      r.advisable === true,
      r.reason,
    );
  }

  // Genuine dev stash with literally no projection data at all.
  {
    const r = assessTaxiAdvisable({
      taxiEligible: true,
      prevOpportunity: null,
      prevPrevOpportunity: null,
      redraftAdp: null,
    });
    check(
      "no role + no projection IS taxi_advisable (the stash case)",
      r.advisable === true,
      r.reason,
    );
  }

  // A buried player with a small role below the established bar and no
  // rising trend and a deep ADP stays a stash.
  {
    const r = assessTaxiAdvisable({
      taxiEligible: true,
      prevOpportunity: prof({ snap_share: 0.18, targets_per_game: 1.2 }),
      prevPrevOpportunity: prof({ snap_share: 0.16, targets_per_game: 1.0 }),
      redraftAdp: 240,
    });
    check(
      "small flat role below the bar stays taxi_advisable",
      r.advisable === true,
      r.reason,
    );
  }

  // Ineligible player: advisability is moot, must be false (you cannot
  // taxi him regardless of how good a stash he would be).
  {
    const r = assessTaxiAdvisable({
      taxiEligible: false,
      prevOpportunity: null,
      prevPrevOpportunity: null,
      redraftAdp: 280,
    });
    check(
      "ineligible player is never taxi_advisable",
      r.advisable === false,
      r.reason,
    );
    check(
      "ineligible reason says so",
      /not taxi-eligible/i.test(r.reason),
      r.reason,
    );
  }

  // Targets-per-game established role (snap share absent that season).
  {
    const r = assessTaxiAdvisable({
      taxiEligible: true,
      prevOpportunity: prof({ snap_share: null, targets_per_game: 5.5 }),
      prevPrevOpportunity: null,
      redraftAdp: null,
    });
    check(
      "established pass-game role (5.5 tgt/g, no snap data) is NOT taxi_advisable",
      r.advisable === false,
      r.reason,
    );
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
