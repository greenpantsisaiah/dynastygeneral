/**
 * Phase 3c evaluation-wiring regression.
 *
 *   npx tsx --tsconfig tsconfig.json evals/evaluation-wiring.test.ts
 *
 * Locks the narrow live wiring of evaluate() (engine/evaluation/wiring.ts):
 * the adapter builds an EvaluationContext from already-fetched data and
 * calls the rubric pipeline. It returns null only when position is
 * unknown; otherwise it returns the rubric's output, including the
 * Bayesian-prior shape for sparse-signal players. The isRubricPriorDriven
 * helper flags low-evidence reads so the UI footer can render the
 * calibration-honesty caveat instead of a confident projection it isn't.
 */
import {
  evaluateForPlayer,
  isRubricPriorDriven,
} from "../src/lib/engine/evaluation/wiring";

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

function run() {
  console.log("\n── evaluateForPlayer ──");

  // Sparse-signal rookie: only position + age + draft pick known via the
  // wider PlayerSignalsRow shape (draft_pick_no is column-only, not in
  // the TS PlayerSignalsRow alias yet). The rubric's Bayesian fallback
  // produces a sensible point estimate inside the variance band.
  const rookieWr = evaluateForPlayer({
    player_signals: {
      player_id: "rk1",
      position: "WR",
      team: "ATL",
      age: 22,
      rb_role_tier: null,
      rb_traded_offseason_flag: null,
      rb_role_at_new_team_projected: null,
      rb_passdown_share_prior_year: null,
      compounding_news_count: 0,
      contract_years_remaining: null,
      recent_extension_flag: null,
      contract_year_flag: null,
      weight_lb: 200,
      height_in: 73,
      last_updated: "2026-05-26T00:00:00Z",
      updated_by: "test",
    },
    team_signals: null,
    ktc_value: 60,
    adp: 80,
    search_rank: 50,
    position: "WR",
    age: 22,
    years_exp: 0,
  });
  check(
    "WR rookie returns an EvaluationOutput",
    rookieWr != null && typeof rookieWr.point_estimate === "number",
  );
  check(
    "point estimate is clamped to 0-100",
    rookieWr != null &&
      rookieWr.point_estimate >= 0 &&
      rookieWr.point_estimate <= 100,
    rookieWr ? String(rookieWr.point_estimate.toFixed(1)) : "null",
  );
  check(
    "variance band wraps the point estimate",
    rookieWr != null &&
      rookieWr.variance_band.lo <= rookieWr.point_estimate &&
      rookieWr.variance_band.hi >= rookieWr.point_estimate,
    rookieWr
      ? `[${rookieWr.variance_band.lo.toFixed(1)}, ${rookieWr.variance_band.hi.toFixed(1)}]`
      : "null",
  );

  // No position -> null (the wiring refuses to run the rubric without a
  // position; the dispatcher would have nothing to dispatch on).
  const noPos = evaluateForPlayer({
    player_signals: null,
    team_signals: null,
    position: null,
    age: 22,
    years_exp: 0,
  });
  check("missing position -> null read", noPos === null);

  // is_rookie is wired from years_exp === 0 so the rubric can branch on
  // it without the caller restating it.
  const veteranQb = evaluateForPlayer({
    player_signals: null,
    team_signals: null,
    ktc_value: 45,
    position: "QB",
    age: 31,
    years_exp: 9,
  });
  check(
    "veteran QB (no player_signals row) returns an output, not null",
    veteranQb != null,
  );

  console.log("\n── isRubricPriorDriven ──");
  check(
    "empty evidence stack -> prior-driven",
    isRubricPriorDriven({
      point_estimate: 50,
      variance_band: { lo: 40, hi: 60 },
      evidence_stack: [],
      market_delta: 0,
      confidence: 0.2,
      arbitrage_flags: [],
    }),
  );
  check(
    "low total contribution -> prior-driven",
    isRubricPriorDriven({
      point_estimate: 50,
      variance_band: { lo: 40, hi: 60 },
      evidence_stack: [
        {
          layer: "intrinsic",
          signal: "x",
          weight: 0.1,
          value: 50,
          contribution: 0.2,
          source: "test",
        },
      ],
      market_delta: 0,
      confidence: 0.2,
      arbitrage_flags: [],
    }),
  );
  check(
    "substantial contributions -> NOT prior-driven",
    !isRubricPriorDriven({
      point_estimate: 65,
      variance_band: { lo: 55, hi: 75 },
      evidence_stack: [
        {
          layer: "intrinsic",
          signal: "rb_role_tier=bellcow",
          weight: 0.8,
          value: 80,
          contribution: 8,
          source: "test",
        },
      ],
      market_delta: 5,
      confidence: 0.65,
      arbitrage_flags: [],
    }),
  );
  check("null output -> prior-driven (defensive)", isRubricPriorDriven(null));

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
