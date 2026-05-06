/**
 * Reads backtest_runs and produces a published scoreboard CSV.
 *
 * Output:
 *   web/data/scoreboard/scoreboard_v1.csv
 *
 * Per VALIDATION_PLAN section 7, this is the publishable artifact:
 * one row per (source, format, season, loss_function) with the headline
 * metrics. Anyone can rerun the harness and audit the numbers.
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.json scripts/build-scoreboard.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

type Row = {
  run_label: string;
  prediction_year: number;
  model_version: string;
  loss_function: string;
  mae: number | null;
  baseline_comparisons: Record<string, unknown> | null;
  notes: string | null;
};

async function main(): Promise<void> {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await supa
    .from("backtest_runs")
    .select(
      "run_label, prediction_year, model_version, loss_function, mae, baseline_comparisons, notes",
    )
    .order("loss_function")
    .order("model_version")
    .order("prediction_year");
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  console.log(`[scoreboard] read ${rows.length} backtest runs`);

  const outRows: string[] = [];
  outRows.push(
    [
      "loss_function",
      "model_version",
      "format",
      "prediction_year",
      "spearman",
      "mar",
      "n_pairs",
      "top_50_hit",
      "top_100_hit",
      "ktc_drift_mean",
      "ktc_retention_pct",
      "years_in_window",
      "notes",
    ].join(","),
  );

  for (const r of rows) {
    const bc = r.baseline_comparisons ?? {};
    const fmt = r.model_version.includes("@sf") ? "sf" : "1qb";
    const spearman =
      typeof bc.spearman === "number"
        ? bc.spearman
        : typeof bc.spearman_cumulative === "number"
          ? bc.spearman_cumulative
          : null;
    const cells = [
      r.loss_function,
      r.model_version,
      fmt,
      String(r.prediction_year),
      spearman != null ? spearman.toFixed(4) : "",
      r.mae != null ? r.mae.toFixed(2) : "",
      typeof bc.n_pairs === "number" ? String(bc.n_pairs) : "",
      typeof bc.top_50_hit_rate === "number" ? bc.top_50_hit_rate.toFixed(3) : "",
      typeof bc.top_100_hit_rate === "number" ? bc.top_100_hit_rate.toFixed(3) : "",
      typeof bc.mean_ktc_drift === "number" ? bc.mean_ktc_drift.toFixed(0) : "",
      typeof bc.value_retention_pct === "number"
        ? bc.value_retention_pct.toFixed(1)
        : "",
      typeof bc.years_in_window === "number" ? String(bc.years_in_window) : "",
      r.notes ? `"${r.notes.replace(/"/g, '""')}"` : "",
    ];
    outRows.push(cells.join(","));
  }

  const dir = resolve(process.cwd(), "data/scoreboard");
  mkdirSync(dir, { recursive: true });
  const outPath = resolve(dir, "scoreboard_v1.csv");
  writeFileSync(outPath, outRows.join("\n") + "\n", "utf8");
  console.log(`[scoreboard] wrote ${outPath} (${outRows.length - 1} data rows)`);

  // Pretty-print summary table to console
  console.log("");
  console.log("=== Phase 2 backtest scoreboard v1 ===");
  console.log("");
  // Group by loss_function for readability
  const byLoss = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byLoss.has(r.loss_function)) byLoss.set(r.loss_function, []);
    byLoss.get(r.loss_function)!.push(r);
  }
  for (const [loss, group] of byLoss) {
    console.log(`--- ${loss} ---`);
    console.log("model_version           year  spearman  MAR     n");
    for (const r of group) {
      const bc = r.baseline_comparisons ?? {};
      const sp =
        typeof bc.spearman === "number"
          ? bc.spearman
          : typeof bc.spearman_cumulative === "number"
            ? bc.spearman_cumulative
            : null;
      console.log(
        `  ${r.model_version.padEnd(22)}  ${r.prediction_year}    ${sp != null ? sp.toFixed(4) : "  -   "}    ${r.mae != null ? r.mae.toFixed(1).padStart(5) : "  -  "}   ${typeof bc.n_pairs === "number" ? String(bc.n_pairs).padStart(3) : "  -"}`,
      );
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error("[scoreboard] fatal:", err);
  process.exit(1);
});
