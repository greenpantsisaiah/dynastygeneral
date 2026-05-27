/**
 * Phase A1 (Model Live Plan) audit: signal coverage matrix.
 *
 * Read-only against production Supabase. Pages through every row of
 * `player_signals`, `team_signals`, `player_health` and reports per
 * column:
 *   - total rows
 *   - non-null populated count
 *   - percent populated
 *   - distinct value count (for categorical-ish columns)
 *   - basic numeric distribution (min, p25, median, p75, max)
 *
 * Also produces a position-stratified populated count for player_signals
 * (QB / RB / WR / TE) so the per-position rubric reads can be checked
 * against actual data availability.
 *
 * Output is printed to stdout as JSON + a human table. Pipe to a file
 * to capture (`> data/coverage_2026_05_26.json`).
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/audit-signal-coverage.ts
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const PAGE = 1000;
const SKILL_POSITIONS = ["QB", "RB", "WR", "TE"] as const;

type Row = Record<string, unknown>;

async function fetchAll(
  sb: SupabaseClient,
  table: string,
): Promise<Row[]> {
  const out: Row[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`[audit] ${table} read failed: ${error.message}`);
      return out;
    }
    if (!data || data.length === 0) break;
    out.push(...(data as Row[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

function isMeaningfullyNull(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v.length === 0) return true;
  if (typeof v === "object" && !Array.isArray(v)) {
    // empty jsonb defaults like '{}' count as null for purposes of "populated"
    const keys = Object.keys(v as Record<string, unknown>);
    if (keys.length === 0) return true;
  }
  return false;
}

function numericStats(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (q: number) => sorted[Math.floor(sorted.length * q)];
  return {
    min: sorted[0],
    p25: pick(0.25),
    median: pick(0.5),
    p75: pick(0.75),
    max: sorted[sorted.length - 1],
  };
}

function distinctValueSummary(values: unknown[], max: number = 8) {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v === null || v === undefined ? "<null>" : String(v);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return {
    distinct: entries.length,
    top: entries.slice(0, max),
  };
}

type ColumnReport = {
  column: string;
  total: number;
  populated: number;
  pct: number;
  distinct?: number;
  topValues?: Array<[string, number]>;
  numeric?: ReturnType<typeof numericStats>;
};

function auditColumns(
  rows: Row[],
  cols: string[],
  numericCols: Set<string>,
  categoricalCols: Set<string>,
): ColumnReport[] {
  const reports: ColumnReport[] = [];
  for (const col of cols) {
    const populated = rows.filter((r) => !isMeaningfullyNull(r[col])).length;
    const pct = rows.length ? (populated / rows.length) * 100 : 0;
    const report: ColumnReport = {
      column: col,
      total: rows.length,
      populated,
      pct: Math.round(pct * 10) / 10,
    };
    if (numericCols.has(col)) {
      const nums = rows
        .map((r) => r[col])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      report.numeric = numericStats(nums);
    }
    if (categoricalCols.has(col)) {
      const summary = distinctValueSummary(rows.map((r) => r[col]));
      report.distinct = summary.distinct;
      report.topValues = summary.top;
    }
    reports.push(report);
  }
  return reports;
}

function printReports(label: string, reports: ColumnReport[]) {
  console.log(`\n=== ${label} (${reports[0]?.total ?? 0} rows) ===`);
  for (const r of reports) {
    const bar =
      "[" +
      "#".repeat(Math.round(r.pct / 5)) +
      ".".repeat(20 - Math.round(r.pct / 5)) +
      "]";
    let line = `${bar} ${r.pct.toFixed(1).padStart(5)}%  ${r.column.padEnd(40)}  ${r.populated}/${r.total}`;
    if (r.numeric) {
      line += `  [${r.numeric.min} .. ${r.numeric.median} .. ${r.numeric.max}]`;
    }
    if (r.topValues && r.distinct != null) {
      const top = r.topValues
        .slice(0, 4)
        .map(([v, c]) => `${v}:${c}`)
        .join(" ");
      line += `  distinct=${r.distinct} (${top})`;
    }
    console.log(line);
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing Supabase env vars; aborting");
    process.exit(1);
  }
  const sb = createClient(url, key);

  // player_signals: read every row, audit every SQL column from 0009.
  const players = await fetchAll(sb, "player_signals");
  const playerCols = [
    "position",
    "team",
    "age",
    "snap_share_prior_year",
    "route_participation_prior_year",
    "target_share_prior_year",
    "rush_share_prior_year",
    "weighted_opportunity_prior_year",
    "high_value_touches_prior_year",
    "yprr_prior_year",
    "adot_prior_year",
    "epa_per_play_prior_year",
    "cpoe_prior_year",
    "draft_round",
    "draft_pick_no",
    "ras",
    "college_dominator",
    "breakout_age",
    "weight_lb",
    "height_in",
    "contract_years_remaining",
    "recent_extension_flag",
    "contract_year_flag",
    "rb_role_tier",
    "rb_traded_offseason_flag",
    "rb_role_at_new_team_projected",
    "rb_passdown_share_prior_year",
    "compounding_news_count",
    "source_attribution",
    "confidence_per_field",
    "updated_by",
  ];
  const playerNumeric = new Set([
    "age",
    "snap_share_prior_year",
    "route_participation_prior_year",
    "target_share_prior_year",
    "rush_share_prior_year",
    "weighted_opportunity_prior_year",
    "high_value_touches_prior_year",
    "yprr_prior_year",
    "adot_prior_year",
    "epa_per_play_prior_year",
    "cpoe_prior_year",
    "draft_round",
    "draft_pick_no",
    "ras",
    "college_dominator",
    "breakout_age",
    "weight_lb",
    "height_in",
    "contract_years_remaining",
    "rb_passdown_share_prior_year",
    "compounding_news_count",
  ]);
  const playerCategorical = new Set([
    "position",
    "team",
    "recent_extension_flag",
    "contract_year_flag",
    "rb_role_tier",
    "rb_traded_offseason_flag",
    "rb_role_at_new_team_projected",
    "updated_by",
  ]);
  printReports(
    "player_signals (all rows)",
    auditColumns(players, playerCols, playerNumeric, playerCategorical),
  );

  // Stratify by position. A WR rubric only matters for WRs.
  for (const pos of SKILL_POSITIONS) {
    const slice = players.filter(
      (r) => (r.position as string | null)?.toUpperCase() === pos,
    );
    printReports(
      `player_signals stratified position=${pos}`,
      auditColumns(slice, playerCols, playerNumeric, playerCategorical),
    );
  }

  // team_signals: every column
  const teams = await fetchAll(sb, "team_signals");
  const teamCols = [
    "ol_continuity_score",
    "ol_grade_run",
    "ol_grade_pass",
    "rookie_ol_starters_count",
    "rookie_ol_position_breakdown",
    "hc_id",
    "hc_first_time_flag",
    "hc_tenure_yrs",
    "hc_background_tag",
    "oc_id",
    "oc_tenure_yrs",
    "oc_first_year_with_team_flag",
    "scheme_tag",
    "staff_novelty_composite",
    "scheme_pace",
    "pass_rate_neutral",
    "personnel_12_rate",
    "source_attribution",
    "updated_by",
  ];
  const teamNumeric = new Set([
    "ol_continuity_score",
    "ol_grade_run",
    "ol_grade_pass",
    "rookie_ol_starters_count",
    "hc_tenure_yrs",
    "oc_tenure_yrs",
    "staff_novelty_composite",
    "scheme_pace",
    "pass_rate_neutral",
    "personnel_12_rate",
  ]);
  const teamCategorical = new Set([
    "hc_id",
    "hc_first_time_flag",
    "hc_background_tag",
    "oc_id",
    "oc_first_year_with_team_flag",
    "scheme_tag",
    "updated_by",
  ]);
  printReports(
    "team_signals (all 32 teams)",
    auditColumns(teams, teamCols, teamNumeric, teamCategorical),
  );

  // player_health
  const health = await fetchAll(sb, "player_health");
  const healthCols = [
    "games_missed_3yr",
    "injury_history",
    "chronic_flag",
    "current_status",
    "off_field_flag",
    "holdout_flag",
  ];
  const healthNumeric = new Set(["games_missed_3yr"]);
  const healthCategorical = new Set([
    "chronic_flag",
    "current_status",
    "off_field_flag",
    "holdout_flag",
  ]);
  printReports(
    "player_health",
    auditColumns(health, healthCols, healthNumeric, healthCategorical),
  );

  // historical tables (for context; the rubrics don't read these at runtime).
  const histCodes = await fetchAll(sb, "historical_signal_codes").catch(
    () => [] as Row[],
  );
  const histOutcomes = await fetchAll(sb, "historical_outcomes").catch(
    () => [] as Row[],
  );
  console.log(`\n=== historical_signal_codes: ${histCodes.length} rows (backtest-only) ===`);
  console.log(`=== historical_outcomes: ${histOutcomes.length} rows (backtest-only) ===`);

  // Final summary line for the audit doc
  console.log("\n=== SUMMARY ===");
  console.log(`player_signals: ${players.length} rows`);
  console.log(`team_signals:   ${teams.length} rows`);
  console.log(`player_health:  ${health.length} rows`);
  console.log(`historical_signal_codes: ${histCodes.length} rows`);
  console.log(`historical_outcomes:     ${histOutcomes.length} rows`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
