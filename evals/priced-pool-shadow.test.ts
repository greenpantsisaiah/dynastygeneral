/**
 * Priced-pool seam regression. Locks the value-pipe seam behind the
 * value-pipe architecture migration (MODEL_LIVE_PLAN Phase D / FORWARD_EV
 * Stage 3a). VALUE_MODE flipped to "rubric" 2026-06-19 (the Phase 4 gate),
 * so the live default is the rubric point estimate. This test still proves
 * BOTH modes: the shadow path ("market") must return the FantasyCalc value
 * byte-identically (the revert path), and the live path ("rubric") must
 * return the point estimate. The market-mode assertions are the guarantee
 * that flipping back to "market" in an incident restores the exact pre-flip
 * numbers.
 *
 *   npx tsx --tsconfig tsconfig.json evals/priced-pool-shadow.test.ts
 *
 * The seam (`scoringValueFor`) selects the value that reaches rerank +
 * startable depth + synthesize. In "market" mode it returns the FantasyCalc
 * value LITERALLY (float-identical, ignoring the rubric output entirely);
 * in "rubric" mode (the live default) it returns the rubric point estimate,
 * falling back to the market value only when the rubric produced nothing.
 *
 * This test exercises the pure seam directly (no network), which is the
 * load-bearing equality contract. It does NOT call buildPricedPool (that
 * needs FantasyCalc + Supabase IO); the equality it proves is exactly the
 * number buildPricedPool writes into playerValuesById.
 */

import {
  VALUE_MODE,
  scoringValueFor,
  scoringValueByIds as ppScoringValueByIds,
  type ValueMode,
} from "../src/lib/strategy/decision-synthesis/priced-pool";
import {
  VALUE_MODE as vmVALUE_MODE,
  scoringValueFor as vmScoringValueFor,
  scoringValueByIds as vmScoringValueByIds,
} from "../src/lib/players/value-mode";
import type { PlayerValue } from "../src/lib/players/values";
import type { EvaluationOutput } from "../src/lib/engine/evaluation/types";

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

function mkValue(value: number): PlayerValue {
  return {
    player_id: "x",
    name: "Test Player",
    position: "WR",
    team: "BUF",
    value,
    raw_value: value * 99,
    overall_rank: 10,
    position_rank: 4,
  };
}

function mkEval(point_estimate: number): EvaluationOutput {
  return {
    point_estimate,
    variance_band: { lo: point_estimate - 5, hi: point_estimate + 5 },
    evidence_stack: [],
    market_delta: 0,
    confidence: 0.5,
    arbitrage_flags: [],
  };
}

console.log("── live mode: VALUE_MODE flipped to 'rubric' (Phase 4, 2026-06-19) ──");
// The flip is the one number-changing step (gated by the value-flip diff +
// canon-keeper + assumption-auditor + founder eyeball). The seam still
// supports market mode (the revert path), proven by the explicit-mode
// assertions below; this asserts the LIVE default is the rubric.
check("VALUE_MODE default is rubric", VALUE_MODE === "rubric", VALUE_MODE);

console.log("── market mode returns v.value byte-identically, ignoring the rubric ──");
// A spread of values including float-heavy ones that would drift under any
// arithmetic. The rubric output is deliberately DIFFERENT so a leak would show.
const cases: number[] = [0, 0.1, 1 / 3, 12.3456789, 47, 63.0000001, 88.8, 100];
for (const v of cases) {
  const out = mkEval(v + 17.5); // a rubric estimate that differs from market
  const got = scoringValueFor(mkValue(v), out, "market");
  check(
    `market(${v}) === v.value`,
    Object.is(got, v),
    `got ${got}`,
  );
}

console.log("── market mode ignores a null rubric output too (no fallback read) ──");
for (const v of cases) {
  const got = scoringValueFor(mkValue(v), null, "market");
  check(`market(${v}) with null out === v.value`, Object.is(got, v), `got ${got}`);
}

console.log("── a pre/post-seam value map is byte-identical in shadow mode ──");
// Build a control map directly from v.value (the pre-seam behavior) and a
// seam map via scoringValueFor in market mode; assert key-for-key identity.
const ids = ["a", "b", "c", "d"];
const values = [55.5, 1 / 7, 0, 99.999];
const control: Record<string, number> = {};
const seam: Record<string, number> = {};
ids.forEach((id, i) => {
  const v = mkValue(values[i]);
  control[id] = v.value; // pre-seam: playerValuesById[id] = v.value
  seam[id] = scoringValueFor(v, mkEval(values[i] - 3), "market"); // post-seam
});
const sameKeys =
  Object.keys(control).length === Object.keys(seam).length &&
  Object.keys(control).every((k) => k in seam);
check("same key set", sameKeys);
check(
  "every value Object.is-identical",
  ids.every((id) => Object.is(control[id], seam[id])),
);

console.log("── rubric mode returns point_estimate, falling back to market on null ──");
const rubricMode: ValueMode = "rubric";
check(
  "rubric returns point_estimate when out present",
  scoringValueFor(mkValue(40), mkEval(58.2), rubricMode) === 58.2,
);
check(
  "rubric falls back to v.value when out is null",
  Object.is(scoringValueFor(mkValue(40), null, rubricMode), 40),
);

console.log("── the seam is re-exported from the light value-mode module ──");
// The Phase 2 sites import the seam from the light `players/value-mode`
// module to avoid the priced-pool -> roster-fit -> llm-contract cycle. Assert
// both export points resolve to the SAME function (identity), so priced-pool's
// re-export and the direct import never drift.
check("value-mode exports scoringValueByIds", typeof vmScoringValueByIds === "function");
check("value-mode VALUE_MODE is rubric", vmVALUE_MODE === "rubric");
check(
  "priced-pool re-export is the same scoringValueFor",
  ppScoringValueByIds === vmScoringValueByIds && scoringValueFor === vmScoringValueFor,
);

console.log(`\n${passed} passed · ${failed} failed`);
if (failed > 0) process.exit(1);
