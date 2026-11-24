/**
 * Prediction registry: every registered prediction type is well formed
 * (id@vN, theory, metric, resolution rule, baseline, scoring, a
 * pre-registered success bar), and no type sits above `hypothesis`
 * without evidence attached. Run: npm run test:prediction-registry
 */

import {
  PREDICTION_TYPES,
  validatePredictionRegistry,
  predictionType,
  type PredictionType,
} from "../src/lib/predictions/registry";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`);
  }
}

console.log("\n── registry is well formed ──");
const errors = validatePredictionRegistry(PREDICTION_TYPES);
check("no registry violations", errors.length === 0, errors.join("; "));

console.log("\n── contend-or-sell terms are registered ──");
for (const id of [
  "playoff_odds@v1",
  "title_odds@v1",
  "title_odds_delta@v1",
  "value_decay@v1",
  "contender_premium@v1",
]) {
  check(`${id} registered`, predictionType(id) !== undefined);
}
check(
  "contender premium stays labelled 0 and unknown while hypothesis",
  (() => {
    const t = predictionType("contender_premium@v1");
    return !!t && t.status === "hypothesis" && /0 AND UNKNOWN/.test(t.metric);
  })(),
);

console.log("\n── validator catches bad entries ──");
const base: PredictionType = { ...PREDICTION_TYPES[0] };
check(
  "rejects a promoted status with no evidence",
  validatePredictionRegistry([{ ...base, status: "validated", status_evidence: "" }]).length > 0,
);
check(
  "rejects a bad id",
  validatePredictionRegistry([{ ...base, id: "PlayoffOdds" }]).length > 0,
);
check(
  "rejects duplicate ids",
  validatePredictionRegistry([base, base]).length > 0,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
