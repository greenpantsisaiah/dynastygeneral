/**
 * Route-participation backtest. Read-only. Phase B #3 of
 * MODEL_LIVE_PLAN.md, validate-first protocol: does adding route
 * participation (free nflverse pbp_participation proxy) lift the WR /
 * TE rubric over the market prior (KTC), AND over the A4 (no-route)
 * baseline?
 *
 * Three-way, per position, pooled across decision years 2023 + 2024:
 *   - market   : KTC value Spearman vs realized season-Y PPR PPG
 *   - rubric A4: the rubric WITHOUT route participation (opts.withRoute
 *                = false), the current-production baseline
 *   - rubric+RP: the rubric WITH route participation joined
 *
 * The route signal reflects the PRIOR season's usage (the cohort reads
 * buildSeasonSignals(year-1)), so it is temporally blinded: a 2023
 * prediction uses 2022 route rates, known before the 2023 season.
 *
 * Two lifts reported with bootstrap 95% CI:
 *   - rubric+RP vs market   (does the rubric now beat the market?)
 *   - rubric+RP vs rubric A4 (does route specifically add signal?)
 *
 * Honest reading: a positive lift whose CI excludes zero is a
 * meaningful gate-relevant result. Any positive number from a
 * current-only snapshot is NOT a backtest; this script is per-season
 * by construction and pools two decision years.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/backtest-route-participation.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";
import { loadCrosswalk } from "../src/lib/signals/nflverse";
import {
  buildPositionCohort,
  spearman,
  bootstrapLiftCI,
  type CohortPosition,
} from "../src/lib/signals/position-cohort";
import { evaluateWr, evaluateTe } from "../src/lib/engine/evaluation";

const DECISION_YEARS = [2023, 2024];

type Vectors = {
  market: number[];
  rubricA4: number[];
  rubricRP: number[];
  outcome: number[];
  routePresent: number; // count of records with a non-null route rate
};

async function runPosition(
  sb: ReturnType<typeof createClient>,
  xwalk: Awaited<ReturnType<typeof loadCrosswalk>>,
  position: CohortPosition,
): Promise<Vectors> {
  const evaluate = position === "WR" ? evaluateWr : evaluateTe;
  const v: Vectors = {
    market: [],
    rubricA4: [],
    rubricRP: [],
    outcome: [],
    routePresent: 0,
  };

  for (const Y of DECISION_YEARS) {
    // The two cohorts are built from the same underlying season data;
    // only the route flag differs, so records align 1:1 by player order.
    const noRoute = await buildPositionCohort(sb, xwalk, Y, position, {
      withRoute: false,
    });
    const withRoute = await buildPositionCohort(sb, xwalk, Y, position, {
      withRoute: true,
    });
    const rpById = new Map(
      withRoute.records.map((r) => [r.player_id, r.ctx.route_participation]),
    );

    let yRoutePresent = 0;
    for (const rec of noRoute.records) {
      const a4 = evaluate(rec.ctx);
      const rpCtx = {
        ...rec.ctx,
        route_participation: rpById.get(rec.player_id) ?? null,
      };
      const rp = evaluate(rpCtx);
      if (rpCtx.route_participation != null) yRoutePresent++;
      v.market.push(rec.market);
      v.rubricA4.push(a4.point_estimate);
      v.rubricRP.push(rp.point_estimate);
      v.outcome.push(rec.outcomePPG);
    }
    v.routePresent += yRoutePresent;
    console.log(
      `  ${position} ${Y} (KTC ${String(noRoute.snapshotDate).slice(0, 10)}, fmt=${noRoute.format}): n=${noRoute.records.length}, route present=${yRoutePresent}`,
    );
  }
  return v;
}

function report(position: string, v: Vectors): void {
  const n = v.outcome.length;
  const sMkt = spearman(v.market, v.outcome);
  const sA4 = spearman(v.rubricA4, v.outcome);
  const sRP = spearman(v.rubricRP, v.outcome);
  const ciVsMarket = bootstrapLiftCI(v.rubricRP, v.market, v.outcome);
  const ciVsA4 = bootstrapLiftCI(v.rubricRP, v.rubricA4, v.outcome);
  const routeCoverage = ((v.routePresent / n) * 100).toFixed(0);

  console.log(`\n=== ${position} POOLED (n=${n}, route coverage ${routeCoverage}%) ===`);
  console.log(`  market (KTC)        Spearman: ${sMkt.toFixed(3)}`);
  console.log(`  rubric A4 (no route) Spearman: ${sA4.toFixed(3)}`);
  console.log(`  rubric + route      Spearman: ${sRP.toFixed(3)}`);
  console.log(
    `  LIFT route vs market: ${(sRP - sMkt).toFixed(3)}  95% CI [${ciVsMarket.lo.toFixed(3)}, ${ciVsMarket.hi.toFixed(3)}]`,
  );
  console.log(
    `  LIFT route vs A4:     ${(sRP - sA4).toFixed(3)}  95% CI [${ciVsA4.lo.toFixed(3)}, ${ciVsA4.hi.toFixed(3)}]`,
  );
  const ciExcludesZero = ciVsMarket.lo > 0 || ciVsMarket.hi < 0;
  const addsOverA4 = ciVsA4.lo > 0 || ciVsA4.hi < 0;
  console.log(
    `  READ: beats market = ${sRP > sMkt ? "yes" : "no"} (CI excludes 0: ${ciExcludesZero}); route adds over A4 = ${sRP > sA4 ? "yes" : "no"} (CI excludes 0: ${addsOverA4})`,
  );
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const xwalk = await loadCrosswalk();

  console.log("Building cohorts (prior-season route, temporally blinded):");
  const wr = await runPosition(sb, xwalk, "WR");
  const te = await runPosition(sb, xwalk, "TE");

  report("WR", wr);
  report("TE", te);

  console.log(
    "\nReading: positive lift = the rubric ranks realized PPR PPG better than the baseline. 'route adds over A4' isolates the route signal from the rest of the rubric. CI excluding zero = statistically meaningful, gate-relevant for Phase D3.\n",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
