/**
 * RB rubric backtest. Read-only. Does feeding the rubric the free signals
 * we can ingest (derived rb_role_tier + OL continuity + compounding-news
 * + age) grade RBs BETTER than the market prior (KTC) alone? Safe on-ramp
 * before wiring evaluate() into live scoring.
 *
 * Cohort + rank helpers are shared with the calibration via
 * src/lib/signals/rb-cohort.ts (one data path). Outcome = realized
 * season-Y PPR points-per-game. Decision years 2023 + 2024.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/backtest-rb-rubric.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";
import { loadCrosswalk } from "../src/lib/signals/nflverse";
import { buildRbCohort, rank, spearman } from "../src/lib/signals/rb-cohort";
import { bootstrapLiftCI } from "../src/lib/signals/position-cohort";
import { evaluateRb } from "../src/lib/engine/evaluation";

const DECISION_YEARS = [2023, 2024];

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const xwalk = await loadCrosswalk();
  const pooled = { rubric: [] as number[], market: [] as number[], outcome: [] as number[] };

  for (const Y of DECISION_YEARS) {
    const { records, snapshotDate, format } = await buildRbCohort(sb, xwalk, Y);
    const rubric: number[] = [];
    const market: number[] = [];
    const outcome: number[] = [];
    const bullish: boolean[] = [];
    for (const rec of records) {
      const out = evaluateRb(rec.ctx);
      rubric.push(out.point_estimate);
      market.push(rec.market);
      outcome.push(rec.outcomePPG);
      bullish.push(out.market_delta > 3);
    }
    const outRanks = rank(outcome);
    const n = outcome.length;
    const bullPctiles: number[] = [];
    for (let i = 0; i < n; i++) if (bullish[i]) bullPctiles.push(outRanks[i] / n);
    const bullMean = bullPctiles.length
      ? bullPctiles.reduce((s, x) => s + x, 0) / bullPctiles.length
      : null;

    const sRub = spearman(rubric, outcome);
    const sMkt = spearman(market, outcome);
    console.log(
      `\n=== ${Y} (KTC ${String(snapshotDate).slice(0, 10)}, fmt=${format}, n=${n} RBs) ===`,
    );
    console.log(`  market (KTC) Spearman vs ${Y} PPG: ${sMkt.toFixed(3)}`);
    console.log(`  rubric       Spearman vs ${Y} PPG: ${sRub.toFixed(3)}`);
    console.log(`  LIFT (rubric - market):           ${(sRub - sMkt).toFixed(3)}`);
    console.log(
      `  rubric-bullish RBs: ${bullPctiles.length} | mean outcome pctile: ${
        bullMean != null ? bullMean.toFixed(3) : "n/a"
      } (>0.5 = right-pointing)`,
    );
    pooled.rubric.push(...rubric);
    pooled.market.push(...market);
    pooled.outcome.push(...outcome);
  }

  const pRub = spearman(pooled.rubric, pooled.outcome);
  const pMkt = spearman(pooled.market, pooled.outcome);
  const ci = bootstrapLiftCI(pooled.rubric, pooled.market, pooled.outcome);
  console.log(`\n=== POOLED (n=${pooled.rubric.length}) ===`);
  console.log(`  market (KTC) Spearman: ${pMkt.toFixed(3)}`);
  console.log(`  rubric       Spearman: ${pRub.toFixed(3)}`);
  console.log(`  LIFT:                  ${(pRub - pMkt).toFixed(3)}`);
  console.log(`  95% CI of lift:        [${ci.lo.toFixed(3)}, ${ci.hi.toFixed(3)}]`);
  console.log(
    `\nReading: positive lift = the rubric's free signals rank RBs' realized production better than KTC alone. CI excluding zero = statistically meaningful.\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
