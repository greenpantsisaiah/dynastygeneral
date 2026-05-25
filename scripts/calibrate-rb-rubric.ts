/**
 * RB rubric weight calibration. Read-only. Grid-searches the RB rubric
 * weights against the historical backtest to find the weights that best
 * rank realized RB production, and reports whether ANY calibration beats
 * the market prior (KTC). Uses the REAL evaluateRb with candidate weights
 * (no re-implementation) over the SAME cohort as the backtest.
 *
 * Objective: mean over decision years of Spearman(rubric grade, realized
 * PPR PPG). Per-year then averaged (avoids mixing two years' KTC scales
 * into one rank pool).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/calibrate-rb-rubric.ts
 *
 * If the best grid weights do not beat the market, the rubric's SIGNALS
 * (not its weights) are the limit on free data -> see DATA_MODEL_INTEGRITY.md.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";
import { loadCrosswalk } from "../src/lib/signals/nflverse";
import {
  buildRbCohort,
  spearman,
  type RbBacktestRecord,
} from "../src/lib/signals/rb-cohort";
import {
  evaluateRb,
  RB_DEFAULT_WEIGHTS,
  type RbWeights,
} from "../src/lib/engine/evaluation";

const DECISION_YEARS = [2023, 2024];

const GRID = {
  strictBellcow: [6, 12, 18],
  bellcow: [4, 8, 12],
  leadBack: [0, 4, 8],
  olEffect: [0, 8, 16],
  hardGateCap: [55, 60, 70],
  priorBlend: [0.15, 0.3, 0.5],
};

function meanYearlySpearman(
  cohorts: { records: RbBacktestRecord[]; outcomes: number[] }[],
  scorer: (rec: RbBacktestRecord) => number,
): number {
  let sum = 0;
  for (const c of cohorts) {
    const grades = c.records.map(scorer);
    sum += spearman(grades, c.outcomes);
  }
  return sum / cohorts.length;
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const xwalk = await loadCrosswalk();
  const cohorts: { records: RbBacktestRecord[]; outcomes: number[] }[] = [];
  for (const Y of DECISION_YEARS) {
    const { records } = await buildRbCohort(sb, xwalk, Y);
    cohorts.push({ records, outcomes: records.map((r) => r.outcomePPG) });
  }
  const n = cohorts.reduce((s, c) => s + c.records.length, 0);

  const market = meanYearlySpearman(cohorts, (r) => r.market);
  const dflt = meanYearlySpearman(cohorts, (r) => evaluateRb(r.ctx).point_estimate);

  let best = { score: -Infinity, w: RB_DEFAULT_WEIGHTS };
  let combos = 0;
  for (const strictBellcow of GRID.strictBellcow)
    for (const bellcow of GRID.bellcow)
      for (const leadBack of GRID.leadBack)
        for (const olEffect of GRID.olEffect)
          for (const hardGateCap of GRID.hardGateCap)
            for (const priorBlend of GRID.priorBlend) {
              combos++;
              const w: RbWeights = {
                ...RB_DEFAULT_WEIGHTS,
                strictBellcow,
                bellcow,
                leadBack,
                olEffect,
                hardGateCap,
                priorBlend,
              };
              const score = meanYearlySpearman(
                cohorts,
                (r) => evaluateRb(r.ctx, w).point_estimate,
              );
              if (score > best.score) best = { score, w };
            }

  console.log(`\nRB rubric calibration · ${combos} weight combos · n=${n} RBs (${DECISION_YEARS.join("+")})\n`);
  console.log(`  market (KTC) mean Spearman:        ${market.toFixed(4)}`);
  console.log(`  rubric @ default weights:          ${dflt.toFixed(4)}  (lift ${(dflt - market >= 0 ? "+" : "")}${(dflt - market).toFixed(4)})`);
  console.log(`  rubric @ BEST grid weights:        ${best.score.toFixed(4)}  (lift ${(best.score - market >= 0 ? "+" : "")}${(best.score - market).toFixed(4)})`);
  console.log(`\n  best weights vs default:`);
  for (const k of Object.keys(GRID) as (keyof typeof GRID)[]) {
    const b = (best.w as Record<string, number>)[k];
    const d = (RB_DEFAULT_WEIGHTS as Record<string, number>)[k];
    console.log(`    ${k}: ${d} -> ${b}${b !== d ? "  *" : ""}`);
  }
  console.log(
    `\n  Reading: if BEST lift <= ~0, no weighting of the free signals beats KTC; the limit is the SIGNALS, not the weights (paid/manual scrape needed). If the optimizer drives priorBlend DOWN and boosts toward 0, it is telling us to trust the market and ignore the signals.\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
