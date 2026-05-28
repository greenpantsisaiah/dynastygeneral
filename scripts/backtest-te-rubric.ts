/**
 * TE rubric backtest. Read-only. Does the TE rubric grade TEs better
 * than the market prior (KTC)? First-time backtest per MODEL_LIVE_PLAN
 * Phase A4.
 *
 * Cohort + helpers shared via src/lib/signals/position-cohort.ts.
 * Outcome = realized season-Y PPR points-per-game. Decision years
 * 2023 + 2024.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/backtest-te-rubric.ts
 *
 * Phase A truth audit predicts ~zero lift: the TE rubric's load-bearing
 * personnel_12_rate signal reads an empty team_signals column, so the
 * rubric reduces to market prior + age + years_exp rookie penalty. The
 * rookie penalty branch can still fire (years_exp derived from xwalk
 * draft_year), so the lift may differ from WR / QB.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";
import { loadCrosswalk } from "../src/lib/signals/nflverse";
import {
  buildPositionCohort,
  rank,
  spearman,
  bootstrapLiftCI,
} from "../src/lib/signals/position-cohort";
import { evaluateTe } from "../src/lib/engine/evaluation";

const DECISION_YEARS = [2023, 2024];

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const xwalk = await loadCrosswalk();
  const pooled = { rubric: [] as number[], market: [] as number[], outcome: [] as number[] };

  for (const Y of DECISION_YEARS) {
    const { records, snapshotDate, format } = await buildPositionCohort(sb, xwalk, Y, "TE");
    const rubric: number[] = [];
    const market: number[] = [];
    const outcome: number[] = [];
    const bullish: boolean[] = [];
    for (const rec of records) {
      const out = evaluateTe(rec.ctx);
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
      `\n=== ${Y} (KTC ${String(snapshotDate).slice(0, 10)}, fmt=${format}, n=${n} TEs) ===`,
    );
    console.log(`  market (KTC) Spearman vs ${Y} PPG: ${sMkt.toFixed(3)}`);
    console.log(`  rubric       Spearman vs ${Y} PPG: ${sRub.toFixed(3)}`);
    console.log(`  LIFT (rubric - market):           ${(sRub - sMkt).toFixed(3)}`);
    console.log(
      `  rubric-bullish TEs: ${bullPctiles.length} | mean outcome pctile: ${
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
    `\nReading: positive lift = the rubric's free signals rank TEs' realized production better than KTC alone. CI excluding zero = statistically meaningful.\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
