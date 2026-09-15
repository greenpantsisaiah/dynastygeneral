/**
 * Scoreboard integrity (G03, 2026-09-15). Locks three things:
 *   1. The published CSV carries ONE row per cell key. The append-only
 *      backtest_runs table produced four rows for the 2022 v1 cell and
 *      the page rendered a stale one while the model card quoted another.
 *   2. dedupeNewest keeps the LAST row per key (the build script writes
 *      in created_at order), so a stale CSV still resolves to the newest.
 *   3. headlineAverages derives the headline from the rows, includes a
 *      model only when it has every requested year, and rounds to 3.
 *
 *   npx tsx --tsconfig tsconfig.json evals/scoreboard.test.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  dedupeNewest,
  duplicateKeys,
  headlineAverages,
  parseScoreboardCsv,
  type ScoreRow,
} from "../src/lib/scoreboard/rows";

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

function row(p: Partial<ScoreRow>): ScoreRow {
  return {
    loss_function: "dynasty_v0_3yr_cumulative",
    model_version: "m@1qb",
    format: "1qb",
    prediction_year: "2022",
    spearman: "0.4",
    mar: "",
    n_pairs: "80",
    top_50_hit: "",
    top_100_hit: "",
    ktc_drift_mean: "",
    ktc_retention_pct: "",
    years_in_window: "3",
    notes: "",
    ...p,
  };
}

function run() {
  console.log("\n── scoreboard integrity ──");

  const csv = readFileSync(
    resolve(process.cwd(), "data/scoreboard/scoreboard_v1.csv"),
    "utf8",
  );
  const rows = parseScoreboardCsv(csv);
  check("published CSV parses to rows", rows.length > 0, `${rows.length} rows`);
  const dupes = duplicateKeys(rows);
  check(
    "published CSV has one row per cell key (no superseded runs)",
    dupes.length === 0,
    dupes.length ? dupes.join("; ") : "clean",
  );
  const v1_2022 = rows.find(
    (r) =>
      r.model_version === "dynasty_general_v0_signals@1qb" &&
      r.prediction_year === "2022" &&
      r.loss_function === "dynasty_v0_3yr_cumulative",
  );
  check(
    "2022 v1 cell is the full-coverage run the model card quotes (0.4415)",
    v1_2022?.spearman === "0.4415",
    v1_2022?.spearman,
  );

  // dedupeNewest: last row per key wins.
  const stale = [
    row({ spearman: "0.3756" }),
    row({ spearman: "0.3778" }),
    row({ spearman: "0.4415" }),
    row({ model_version: "other@1qb", spearman: "0.1" }),
  ];
  const deduped = dedupeNewest(stale);
  check(
    "dedupeNewest keeps the last row per key",
    deduped.length === 2 &&
      deduped.find((r) => r.model_version === "m@1qb")?.spearman === "0.4415",
  );
  check("duplicateKeys names the repeated key", duplicateKeys(stale).length === 1);

  // headlineAverages: derived, complete-years-only, rounded.
  const three = [
    row({ model_version: "a@1qb", prediction_year: "2022", spearman: "0.4415", loss_function: "dynasty_v0_3yr_cumulative" }),
    row({ model_version: "a@1qb", prediction_year: "2023", spearman: "0.4744", loss_function: "dynasty_v0_2yr_cumulative" }),
    row({ model_version: "a@1qb", prediction_year: "2024", spearman: "0.3464", loss_function: "dynasty_v0_1yr_cumulative" }),
    row({ model_version: "b@1qb", prediction_year: "2022", spearman: "0.9" }),
    row({ model_version: "c@sf", prediction_year: "2022", spearman: "0.9" }),
    row({ model_version: "c@sf", prediction_year: "2023", spearman: "0.9", loss_function: "dynasty_v0_2yr_cumulative" }),
    row({ model_version: "c@sf", prediction_year: "2024", spearman: "0.9", loss_function: "dynasty_v0_1yr_cumulative", format: "sf" }),
  ];
  const avgs = headlineAverages(three, { format: "1qb", years: [2022, 2023, 2024] });
  check(
    "headlineAverages averages the three years and rounds to 3 places",
    avgs.length === 1 && avgs[0].model_version === "a@1qb" && avgs[0].spearman_avg === 0.421,
    avgs.map((a) => `${a.model_version}=${a.spearman_avg}`).join(","),
  );
  check(
    "a model missing a year is excluded rather than averaged on fewer cells",
    !avgs.some((a) => a.model_version === "b@1qb"),
  );

  const live = headlineAverages(rows, { format: "1qb", years: [2022, 2023, 2024] });
  const dgv1 = live.find((a) => a.model_version === "dynasty_general_v0_signals@1qb");
  check(
    "live CSV headline for DG v1 matches MODEL_CARD 9.7 (0.421)",
    dgv1?.spearman_avg === 0.421,
    String(dgv1?.spearman_avg),
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

run();
