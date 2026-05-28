/**
 * Taxi-advisable convergence tripwire (FAIL-LOUD, by design).
 *
 *   npx tsx --tsconfig tsconfig.json evals/taxi-advisable-convergence.test.ts
 *
 * `src/lib/coach/taxi-advisable.ts` is a TRACKED INTERIM forked build
 * (logged as C4a in MODEL_LIVE_PLAN.md). It answers "is this player a
 * near-term contributor, so keep him active instead of taxiing him" by
 * reaching into raw opportunity + redraft ADP with absolute thresholds.
 * That deliberately violates the evaluation-engine contract ("NO consumer
 * reaches into raw signals; read EvaluationOutput") and the roster-fit
 * "rank-based, not absolute thresholds" invariant.
 *
 * It exists because evaluate() cannot make this call yet: the
 * player_signals opportunity columns are 0% populated (Phase A4 truth
 * audit), and the canonical startable tier is dynasty-VALUE ranked, which
 * misses low-value-but-ascending players (the Higgins case).
 *
 * THIS TEST IS THE "DON'T FORGET TO CONVERGE" BACKSTOP. It is designed to
 * START FAILING the moment the data model gains the ability to make this
 * call, i.e. when Phase D adds a near-term contributor / year-1 role
 * signal to EvaluationOutput. When that happens, the failure message tells
 * the engineer to converge taxi-advisable.ts onto evaluate() and delete
 * the standalone thresholds. Closing this item means CONVERGING THE
 * CONSUMER, not deleting this test.
 *
 * Source-level (readFileSync) like coach-context-sync.test.ts; no LLM, no
 * DB, no data dependency, so it cannot go flaky.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const ROOT = resolve(process.cwd());
const EVAL_TYPES = resolve(ROOT, "src/lib/engine/evaluation/types.ts");
const TAXI = resolve(ROOT, "src/lib/coach/taxi-advisable.ts");
const PLAN = resolve(ROOT, "MODEL_LIVE_PLAN.md");

// Tokens that signal evaluate() has gained a near-term contributor read,
// the enabler for converging the taxi forked build. The working name in
// the convergence contract is `near_term_role`; the synonyms guard against
// a slightly different name landing in Phase D.
const CONVERGENCE_ENABLER_TOKENS = [
  "near_term_role",
  "near_term_contributor",
  "year1_role",
  "year1_contributor",
];

function readOrEmpty(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function run() {
  console.log("\n── taxi-advisable convergence tripwire ──");

  const evalTypes = readOrEmpty(EVAL_TYPES);
  const taxi = readOrEmpty(TAXI);
  const plan = readOrEmpty(PLAN);

  // 1. THE TRIPWIRE. While EvaluationOutput carries no near-term
  //    contributor field, the interim is legitimate and this passes. The
  //    day Phase D adds that field, this flips to a failure that demands
  //    convergence.
  const enabler = CONVERGENCE_ENABLER_TOKENS.find((t) => evalTypes.includes(t));
  check(
    "evaluate() has NOT yet exposed a near-term contributor signal",
    enabler === undefined,
    enabler
      ? `FOUND '${enabler}' in evaluation/types.ts. CONVERGE NOW: delete the absolute thresholds in src/lib/coach/taxi-advisable.ts and have assessTaxiAdvisable consume EvaluationOutput.${enabler} via EnrichedPlayer (MODEL_LIVE_PLAN C4a). Close this by converging the consumer, not by deleting this test.`
      : "interim still legitimate; evaluate() cannot make this call yet",
  );

  // 2. The interim marker must remain in the forked build, so the tracker
  //    cannot be silently erased while the fork lives on.
  check(
    "taxi-advisable.ts still carries its INTERIM-MARKER",
    taxi.includes("INTERIM-MARKER: taxi-advisable-forked-build-C4a"),
    taxi.includes("INTERIM-MARKER: taxi-advisable-forked-build-C4a")
      ? undefined
      : "marker missing: either the fork was converged (good: remove this test + the C4a plan entry) or the tracker was deleted without converging (bad)",
  );

  // 3. The Big Push plan must keep the C4a convergence item, so the owner
  //    working through Phase D sees it.
  check(
    "MODEL_LIVE_PLAN.md still tracks the C4a convergence item",
    plan.includes("C4a") && plan.includes("taxi_advisable"),
    plan.includes("C4a")
      ? undefined
      : "C4a entry missing from MODEL_LIVE_PLAN.md; the convergence task is no longer tracked in the plan the Big Push works through",
  );

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
