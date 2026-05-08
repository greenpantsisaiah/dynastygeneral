/**
 * What-if counterfactual regression. Locks the per-candidate EV +
 * delta-vs-standing-call math.
 *
 *   npx tsx --tsconfig tsconfig.json evals/whatif.test.ts
 */

import { computeWhatIfReadout } from "../src/lib/strategy/decision-synthesis/whatif";
import type { DecisionTopCandidate } from "../src/lib/strategy/decision-synthesis/types";

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

function approxEqual(a: number, b: number, tol = 0.05): boolean {
  return Math.abs(a - b) <= tol;
}

function makeCandidate(opts: {
  id: string;
  name: string;
  value: number | null;
  adp: number | null;
  survival: number | null;
}): DecisionTopCandidate {
  return {
    player_id: opts.id,
    name: opts.name,
    position: "RB",
    team: "TST",
    age: 25,
    search_rank: 100,
    adp: opts.adp,
    is_rookie: false,
    value: opts.value,
    ktc_overall_rank: null,
    primary_reason: "test",
    rule: "fill_starter_urgent",
    timeline_lane: "balanced",
    is_lean: opts.id === "lean",
    availability_next_pick: null,
    survival_pct: opts.survival,
    opponent_signal: null,
    constraint_note: null,
  } as unknown as DecisionTopCandidate;
}

const EM_DASH_CHAR = String.fromCharCode(0x2014);

function run() {
  console.log("\n── 1. Standing call narrative is positive when EV >= 0 ──");
  {
    const candidates = [
      makeCandidate({ id: "lean", name: "Tyler Warren", value: 50, adp: 35, survival: 21 }),
    ];
    const result = computeWhatIfReadout({
      standingCallId: "lean",
      candidates,
      currentPickNo: 56,
    });
    check("standing_call_ev = 10.5", approxEqual(result.standing_call_ev!, 10.5));
    const entry = result.entries[0];
    check("entry is_standing_call = true", entry.is_standing_call);
    check("ev_if_chosen = 10.5", approxEqual(entry.ev_if_chosen!, 10.5));
    check("delta = 0 (vs self)", entry.delta_vs_standing_call === 0);
    check(
      "narrative says 'getting the asset'",
      entry.narrative.includes("getting the asset"),
      `narrative: ${entry.narrative}`,
    );
  }

  console.log("\n── 2. Standing call narrative for sharp lock (negative EV) ──");
  {
    const candidates = [
      makeCandidate({ id: "lean", name: "Mahomes", value: 80, adp: 65, survival: 35 }),
    ];
    const result = computeWhatIfReadout({
      standingCallId: "lean",
      candidates,
      currentPickNo: 50,
    });
    check("ev negative", result.standing_call_ev! < 0);
    check(
      "narrative says 'sharp lock'",
      result.entries[0].narrative.includes("sharp lock"),
      `narrative: ${result.entries[0].narrative}`,
    );
  }

  console.log("\n── 3. Alternate with higher EV than standing call ──");
  {
    const candidates = [
      makeCandidate({ id: "lean", name: "Warren", value: 50, adp: 35, survival: 21 }),
      makeCandidate({ id: "alt1", name: "Better", value: 60, adp: 30, survival: 18 }),
    ];
    const result = computeWhatIfReadout({
      standingCallId: "lean",
      candidates,
      currentPickNo: 56,
    });
    const alt = result.entries.find((e) => e.player_id === "alt1");
    check("alt EV approx 15.6", approxEqual(alt!.ev_if_chosen!, 15.6));
    check("alt delta approx +5.1", approxEqual(alt!.delta_vs_standing_call!, 5.1));
    check("alt is_standing_call = false", !alt!.is_standing_call);
    check(
      "narrative says 'Higher EV'",
      alt!.narrative.includes("Higher EV"),
      `narrative: ${alt!.narrative}`,
    );
  }

  console.log("\n── 4. Alternate with lower EV than standing call ──");
  {
    const candidates = [
      makeCandidate({ id: "lean", name: "Warren", value: 50, adp: 35, survival: 21 }),
      makeCandidate({ id: "alt1", name: "Worse", value: 30, adp: 50, survival: 50 }),
    ];
    const result = computeWhatIfReadout({
      standingCallId: "lean",
      candidates,
      currentPickNo: 56,
    });
    const alt = result.entries.find((e) => e.player_id === "alt1");
    check("alt delta < 0", alt!.delta_vs_standing_call! < 0);
    check(
      "narrative says 'Lower EV'",
      alt!.narrative.includes("Lower EV"),
      `narrative: ${alt!.narrative}`,
    );
  }

  console.log("\n── 5. Roughly equivalent EV ──");
  {
    const candidates = [
      makeCandidate({ id: "lean", name: "A", value: 50, adp: 50, survival: 60 }),
      makeCandidate({ id: "alt1", name: "B", value: 50, adp: 51, survival: 55 }),
    ];
    const result = computeWhatIfReadout({
      standingCallId: "lean",
      candidates,
      currentPickNo: 56,
    });
    const alt = result.entries.find((e) => e.player_id === "alt1");
    check(
      "narrative says 'Roughly equivalent'",
      alt!.narrative.includes("Roughly equivalent"),
      `narrative: ${alt!.narrative}`,
    );
  }

  console.log("\n── 6. Missing value or ADP: graceful null ──");
  {
    const candidates = [
      makeCandidate({ id: "lean", name: "Warren", value: 50, adp: 35, survival: 21 }),
      makeCandidate({ id: "alt1", name: "NoData", value: null, adp: null, survival: null }),
    ];
    const result = computeWhatIfReadout({
      standingCallId: "lean",
      candidates,
      currentPickNo: 56,
    });
    const alt = result.entries.find((e) => e.player_id === "alt1");
    check("alt ev null", alt!.ev_if_chosen == null);
    check("alt delta null", alt!.delta_vs_standing_call == null);
    check(
      "narrative says 'not resolved'",
      alt!.narrative.includes("not resolved"),
      `narrative: ${alt!.narrative}`,
    );
  }

  console.log("\n── 7. Voice A: no em dashes in narratives ──");
  {
    const candidates = [
      makeCandidate({ id: "lean", name: "Warren", value: 50, adp: 35, survival: 21 }),
      makeCandidate({ id: "alt1", name: "Higher", value: 60, adp: 30, survival: 18 }),
      makeCandidate({ id: "alt2", name: "Lower", value: 30, adp: 50, survival: 50 }),
    ];
    const result = computeWhatIfReadout({
      standingCallId: "lean",
      candidates,
      currentPickNo: 56,
    });
    const allNarratives = result.entries.map((e) => e.narrative).join(" ");
    check(
      "no em dashes anywhere",
      !allNarratives.includes(EM_DASH_CHAR),
      `narratives: ${allNarratives}`,
    );
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
