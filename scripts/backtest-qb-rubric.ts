/**
 * QB rubric backtest. Read-only. Does the QB rubric grade QBs better than
 * the market prior (KTC)?
 *
 * Phase B sig-history upgrade: by default runs the cohort twice per year
 * (A4 baseline with no team signals, then rubric + historical scheme) via
 * the shared runPositionBacktest harness and prints both lifts plus the
 * scheme marginal. The QB rubric's team branches are scheme_tag,
 * oc_tenure_yrs, oc_first_year_with_team_flag, and hc_first_time_flag.
 * One data path; outcome = realized season-Y PPR PPG; decision years
 * 2023 + 2024.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/backtest-qb-rubric.ts
 *
 * Before team_signals_history is ingested the two rubric columns are
 * identical and the harness says so.
 *
 * Phase B6 (sig-ol-grade) validate-first OL comparison (separate axis):
 *
 *   # free check, no DB writes:
 *   npx tsx --tsconfig tsconfig.json scripts/backtest-qb-rubric.ts \
 *     --with-ol --ol-file data/free-ol-grades.json
 *   # or read vintage OL from historical_signal_codes:
 *   npx tsx --tsconfig tsconfig.json scripts/backtest-qb-rubric.ts --with-ol
 *
 * With --with-ol the cohort is run twice per year: once with no OL grade,
 * once with `ol_grade_pass` joined (the only QB rubric branch that reads
 * an OL grade). It prints both pooled lifts and the marginal OL delta. OL
 * grades are temporal-blinded to preseason Y (a season-S grade enriches
 * decision year S+1). With no OL joined the +OL pass equals the baseline
 * and the script says so (the honest no-data path). This OL axis holds
 * team scheme signals OFF (includeTeamSignals: false) so the only moving
 * part is the OL grade.
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
import { runPositionBacktest } from "../src/lib/signals/position-backtest";
import {
  loadHistoricalOlGrades,
  olMapFromRows,
  type HistoricalOlGrade,
} from "../src/lib/signals/historical-ol-grades";
import { evaluateQb } from "../src/lib/engine/evaluation";
import { readFileSync } from "node:fs";

const DECISION_YEARS = [2023, 2024];

// Preseason-Y vintage cutoff for temporal blinding, matching the KTC
// snapshot date the cohort builder uses (<= Sep 15 of Y).
const knowledgeCutoff = (year: number) => `${year}-09-15`;

type Pooled = { rubric: number[]; market: number[]; outcome: number[] };

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

async function main() {
  const withOl = process.argv.includes("--with-ol");
  // --ol-file <path>: load free OL grades from a local JSON file (the
  // validate-first FREE check), so the backtest never reads/writes the DB
  // for OL. Without it, --with-ol reads historical_signal_codes.
  const olFile = argValue("--ol-file");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  if (withOl) {
    const xwalk = await loadCrosswalk();
    await runWithOlComparison(sb, xwalk, olFile);
    return;
  }

  await runPositionBacktest({ sb, position: "QB", evaluate: evaluateQb });
}

/**
 * Score the QB cohort for one decision year, optionally with OL grades
 * joined. Team scheme signals are held OFF so the only moving part across
 * the baseline vs +OL comparison is the OL grade. Returns the vectors plus
 * how many records received a non-null ol_grade_pass.
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
    { includeTeamSignals: false, olGrades },
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

/**
 * Validate-first comparison: baseline (no OL) vs +OL grades. The delta in
 * pooled lift is the OL grade's marginal contribution to the QB rubric's
 * rank correlation, the number that decides whether OL data earns its
 * keep (Phase B6 decision framework). The OL source is the DB
 * (historical_signal_codes) by default, or a local JSON file when
 * --ol-file is passed (the FREE check, zero DB writes).
 */
async function runWithOlComparison(
  sb: SupabaseClient,
  xwalk: Crosswalk,
  olFile: string | null,
) {
  const base: Pooled = { rubric: [], market: [], outcome: [] };
  const ol: Pooled = { rubric: [], market: [], outcome: [] };
  let totalOlHits = 0;
  let totalRecords = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fileRows: any[] | null = null;
  if (olFile) {
    fileRows = JSON.parse(readFileSync(olFile, "utf8"));
    console.log(
      `OL source: local file ${olFile} (${fileRows?.length ?? 0} team-season rows) [FREE check, no DB OL read].`,
    );
  } else {
    console.log("OL source: historical_signal_codes (DB).");
  }

  for (const Y of DECISION_YEARS) {
    const grades = fileRows
      ? olMapFromRows(fileRows, Y)
      : await loadHistoricalOlGrades(sb, Y, knowledgeCutoff(Y));
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

  pooledReport("BASELINE (no OL)", base);
  pooledReport("+OL grades", ol);

  const baseLift = spearman(base.rubric, base.outcome) - spearman(base.market, base.outcome);
  const olLift = spearman(ol.rubric, ol.outcome) - spearman(ol.market, ol.outcome);
  console.log(`\n=== OL DELTA ===`);
  console.log(`  records with ol_grade_pass joined: ${totalOlHits}/${totalRecords}`);
  console.log(`  baseline pooled lift:  ${baseLift.toFixed(3)}`);
  console.log(`  +OL pooled lift:       ${olLift.toFixed(3)}`);
  console.log(`  marginal OL lift:      ${(olLift - baseLift).toFixed(3)}`);
  if (totalOlHits === 0) {
    console.log(
      `\nNo OL grades joined for the decision years. The +OL pass is identical to the baseline by construction. Provide grades (--ol-file for the free check, or ingest a vintage sample) before reading the delta. NEVER claim lift from a current-only snapshot.\n`,
    );
  } else {
    console.log(
      `\nReading: a marginal OL lift that is positive AND meaningfully sized is the validate-first signal that the OL grade earns its place for QB. A marginal lift at/below zero is the money-saving negative result: this OL source does not beat the rubric's existing signals, so do not pay for it (and, if free, do not wire it).\n`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
