/**
 * QB rubric backtest. Read-only. Does the QB rubric grade QBs better
 * than the market prior (KTC)? First-time backtest per MODEL_LIVE_PLAN
 * Phase A4.
 *
 * Cohort + helpers shared via src/lib/signals/position-cohort.ts.
 * Outcome = realized season-Y PPR points-per-game. Decision years
 * 2023 + 2024.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/backtest-qb-rubric.ts
 *
 * Phase A truth audit predicts ~zero lift: the QB rubric's load-bearing
 * branches (scheme_tag, oc_tenure_yrs, ol_grade_pass, hc_first_time_flag)
 * read empty team_signals columns in production, so the rubric reduces
 * to market prior + tier classification + tier-conditional age curve.
 * The tier-age branch can still fire (KTC is populated, birth year is
 * in the xwalk), so QB lift may differ from WR.
 *
 * Phase B6 (sig-ol-grade) validate-first OL comparison:
 *
 *   npx tsx --tsconfig tsconfig.json scripts/backtest-qb-rubric.ts --with-ol
 *
 * With --with-ol the cohort is run TWICE per year: once on free signals
 * only (the A4 baseline), once with vintage PFF `ol_grade_pass` joined
 * from historical_signal_codes (the only QB rubric branch that reads an
 * OL grade). The script prints both pooled lifts and the delta the PFF
 * grade contributes. The OL grades are temporal-blinded to preseason Y
 * (coded_with_knowledge_through <= Sep 15 of Y), matching the KTC
 * snapshot vintage. With no OL rows ingested the +OL pass is identical to
 * the baseline and the script says so (the honest no-data path).
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { loadCrosswalk, type Crosswalk } from "../src/lib/signals/nflverse";
import {
  buildPositionCohort,
  spearman,
  bootstrapLiftCI,
} from "../src/lib/signals/position-cohort";
import {
  loadHistoricalOlGrades,
  type HistoricalOlGrade,
} from "../src/lib/signals/historical-ol-grades";
import { evaluateQb } from "../src/lib/engine/evaluation";

const DECISION_YEARS = [2023, 2024];

// Preseason-Y vintage cutoff for temporal blinding, matching the KTC
// snapshot date the cohort builder uses (<= Sep 15 of Y).
const knowledgeCutoff = (year: number) => `${year}-09-15`;

type Pooled = { rubric: number[]; market: number[]; outcome: number[] };

/**
 * Score the QB cohort for one decision year, optionally with vintage OL
 * grades joined. Returns per-year rubric / market / outcome vectors and
 * how many records actually received a non-null ol_grade_pass (so the
 * caller can report whether OL data was present at all).
 */
async function scoreYear(
  sb: SupabaseClient,
  xwalk: Crosswalk,
  Y: number,
  olGrades?: Map<string, HistoricalOlGrade>,
): Promise<{
  rubric: number[];
  market: number[];
  outcome: number[];
  snapshotDate: string | null;
  format: string | null;
  olHits: number;
}> {
  const { records, snapshotDate, format } = await buildPositionCohort(
    sb,
    xwalk,
    Y,
    "QB",
    olGrades,
  );
  const rubric: number[] = [];
  const market: number[] = [];
  const outcome: number[] = [];
  let olHits = 0;
  for (const rec of records) {
    if (rec.ctx.team?.ol_grade_pass != null) olHits++;
    const out = evaluateQb(rec.ctx);
    rubric.push(out.point_estimate);
    market.push(rec.market);
    outcome.push(rec.outcomePPG);
  }
  return { rubric, market, outcome, snapshotDate, format, olHits };
}

function pooledReport(label: string, p: Pooled): void {
  const pRub = spearman(p.rubric, p.outcome);
  const pMkt = spearman(p.market, p.outcome);
  const ci = bootstrapLiftCI(p.rubric, p.market, p.outcome);
  console.log(`\n=== POOLED ${label} (n=${p.rubric.length}) ===`);
  console.log(`  market (KTC) Spearman: ${pMkt.toFixed(3)}`);
  console.log(`  rubric       Spearman: ${pRub.toFixed(3)}`);
  console.log(`  LIFT:                  ${(pRub - pMkt).toFixed(3)}`);
  console.log(
    `  95% CI of lift:        [${ci.lo.toFixed(3)}, ${ci.hi.toFixed(3)}]`,
  );
}

async function main() {
  const withOl = process.argv.includes("--with-ol");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const xwalk = await loadCrosswalk();

  if (withOl) {
    await runWithOlComparison(sb, xwalk);
    return;
  }

  const pooled: Pooled = { rubric: [], market: [], outcome: [] };
  for (const Y of DECISION_YEARS) {
    const { rubric, market, outcome, snapshotDate, format } = await scoreYear(
      sb,
      xwalk,
      Y,
    );
    const sRub = spearman(rubric, outcome);
    const sMkt = spearman(market, outcome);
    console.log(
      `\n=== ${Y} (KTC ${String(snapshotDate).slice(0, 10)}, fmt=${format}, n=${
        outcome.length
      } QBs) ===`,
    );
    console.log(`  market (KTC) Spearman vs ${Y} PPG: ${sMkt.toFixed(3)}`);
    console.log(`  rubric       Spearman vs ${Y} PPG: ${sRub.toFixed(3)}`);
    console.log(`  LIFT (rubric - market):           ${(sRub - sMkt).toFixed(3)}`);
    pooled.rubric.push(...rubric);
    pooled.market.push(...market);
    pooled.outcome.push(...outcome);
  }
  pooledReport("", pooled);
  console.log(
    `\nReading: positive lift = the rubric's free signals rank QBs' realized production better than KTC alone. CI excluding zero = statistically meaningful.\n`,
  );
}

/**
 * Validate-first comparison: baseline (free signals) vs +PFF OL grades.
 * The delta in pooled lift is the PFF grade's marginal contribution to
 * the QB rubric's rank correlation. This is the number that decides
 * whether the paid feed earns its keep (per Phase B6 decision framework).
 */
async function runWithOlComparison(sb: SupabaseClient, xwalk: Crosswalk) {
  const base: Pooled = { rubric: [], market: [], outcome: [] };
  const ol: Pooled = { rubric: [], market: [], outcome: [] };
  let totalOlHits = 0;
  let totalRecords = 0;

  for (const Y of DECISION_YEARS) {
    const grades = await loadHistoricalOlGrades(sb, Y, knowledgeCutoff(Y));
    const b = await scoreYear(sb, xwalk, Y);
    const o = await scoreYear(sb, xwalk, Y, grades);
    totalOlHits += o.olHits;
    totalRecords += o.outcome.length;
    console.log(
      `\n=== ${Y} (n=${o.outcome.length} QBs, OL grades joined: ${o.olHits}) ===`,
    );
    console.log(
      `  baseline lift: ${(spearman(b.rubric, b.outcome) - spearman(b.market, b.outcome)).toFixed(3)}` +
        `   +OL lift: ${(spearman(o.rubric, o.outcome) - spearman(o.market, o.outcome)).toFixed(3)}`,
    );
    base.rubric.push(...b.rubric);
    base.market.push(...b.market);
    base.outcome.push(...b.outcome);
    ol.rubric.push(...o.rubric);
    ol.market.push(...o.market);
    ol.outcome.push(...o.outcome);
  }

  pooledReport("BASELINE (free signals)", base);
  pooledReport("+PFF OL grades", ol);

  const baseLift = spearman(base.rubric, base.outcome) - spearman(base.market, base.outcome);
  const olLift = spearman(ol.rubric, ol.outcome) - spearman(ol.market, ol.outcome);
  console.log(`\n=== OL DELTA ===`);
  console.log(`  records with ol_grade_pass joined: ${totalOlHits}/${totalRecords}`);
  console.log(`  baseline pooled lift:  ${baseLift.toFixed(3)}`);
  console.log(`  +OL pooled lift:       ${olLift.toFixed(3)}`);
  console.log(`  marginal OL lift:      ${(olLift - baseLift).toFixed(3)}`);
  if (totalOlHits === 0) {
    console.log(
      `\nNo PFF OL grades ingested for the decision years yet. The +OL pass is identical to the baseline by construction. Ingest a vintage sample (scripts/ingest-pff-ol-grades.ts) before reading the delta as evidence. NEVER claim lift from a current-only snapshot.\n`,
    );
  } else {
    console.log(
      `\nReading: a marginal OL lift that is positive AND whose CI excludes zero is the validate-first signal that PFF ol_grade_pass earns its ongoing cost for QB. A marginal lift at/below zero is a money-saving negative result: keep the free ol_continuity proxy.\n`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
