/**
 * Scoreboard rows: the one parser + dedupe + headline math for the
 * published backtest CSV (`data/scoreboard/scoreboard_v1.csv`).
 *
 * Why this module exists (G03, 2026-09-15): the CSV is rebuilt from the
 * append-only `backtest_runs` table. Re-running the harness appends a
 * new row per cell, so the CSV carried four rows for the 2022 v1 cell
 * (0.376 to 0.442). The build script ordered rows by name, not run
 * time, so "last row wins" on the page picked an arbitrary partial
 * run (0.376) while MODEL_CARD 9.7 quoted the full-coverage run
 * (0.442). One page, one doc, two numbers for the same cell.
 *
 * Contract: the build script writes rows in run-time order and keeps
 * one row per cell key; this module dedupes the same way (newest wins)
 * so a stale CSV still renders consistently, and the headline averages
 * are DERIVED from the rows instead of hardcoded, so the table and the
 * headline cannot disagree. Locked by `evals/scoreboard.test.ts`.
 */

export type ScoreRow = {
  loss_function: string;
  model_version: string;
  format: string;
  prediction_year: string;
  spearman: string;
  mar: string;
  n_pairs: string;
  top_50_hit: string;
  top_100_hit: string;
  ktc_drift_mean: string;
  ktc_retention_pct: string;
  years_in_window: string;
  notes: string;
};

/** The cell identity. Two rows with the same key are re-runs of one cell. */
export function scoreRowKey(r: {
  loss_function: string;
  model_version: string;
  format: string;
  prediction_year: string | number;
}): string {
  return `${r.loss_function}|${r.model_version}|${r.format}|${r.prediction_year}`;
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Parse the CSV text into rows. Header-driven, so column order is free. */
export function parseScoreboardCsv(content: string): ScoreRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const header = lines[0].split(",");
  const out: ScoreRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = cells[j] ?? "";
    }
    out.push(row as unknown as ScoreRow);
  }
  return out;
}

/**
 * One row per cell key, the LAST occurrence wins. The build script
 * writes rows in `created_at` order, so last = newest run.
 */
export function dedupeNewest(rows: ScoreRow[]): ScoreRow[] {
  const byKey = new Map<string, ScoreRow>();
  for (const r of rows) byKey.set(scoreRowKey(r), r);
  return [...byKey.values()];
}

/** Keys that appear more than once. Empty when the CSV is clean. */
export function duplicateKeys(rows: ScoreRow[]): string[] {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const k = scoreRowKey(r);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}

export type HeadlineAverage = {
  model_version: string;
  years: number[];
  /** Mean Spearman across the years present, rounded to 3 places. */
  spearman_avg: number;
  /** Per-year Spearman, in year order. */
  by_year: Array<{ year: number; spearman: number }>;
};

/**
 * Average Spearman per model across the dynasty cumulative rows for
 * the given format and years. A model is included only when it has a
 * row for EVERY requested year, so a model scored on two years never
 * averages against one scored on three.
 */
export function headlineAverages(
  rows: ScoreRow[],
  opts: { format: string; years: number[]; lossPrefix?: string },
): HeadlineAverage[] {
  const prefix = opts.lossPrefix ?? "dynasty_v0_";
  const cells = dedupeNewest(rows).filter(
    (r) =>
      r.loss_function.startsWith(prefix) &&
      r.format === opts.format &&
      opts.years.includes(Number(r.prediction_year)) &&
      r.spearman !== "",
  );
  const byModel = new Map<string, Map<number, number>>();
  for (const r of cells) {
    const m = byModel.get(r.model_version) ?? new Map<number, number>();
    m.set(Number(r.prediction_year), Number(r.spearman));
    byModel.set(r.model_version, m);
  }
  const out: HeadlineAverage[] = [];
  for (const [model_version, m] of byModel) {
    if (!opts.years.every((y) => m.has(y))) continue;
    const by_year = opts.years
      .slice()
      .sort((a, b) => a - b)
      .map((year) => ({ year, spearman: m.get(year)! }));
    const spearman_avg =
      Math.round(
        (by_year.reduce((acc, x) => acc + x.spearman, 0) / by_year.length) *
          1000,
      ) / 1000;
    out.push({ model_version, years: opts.years, spearman_avg, by_year });
  }
  return out.sort((a, b) => b.spearman_avg - a.spearman_avg);
}
