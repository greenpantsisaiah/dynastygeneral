/**
 * Ingest the FREE ESPN team Pass-Block / Run-Block Win Rate (PBWR / RBWR)
 * proxy into `historical_signal_codes` so the QB `--with-ol` backtest can
 * read a real OL delta from the DB (not just the `--ol-file` FREE check).
 * Phase B6 of MODEL_LIVE_PLAN, the FREE companion to ingest-pff-ol-grades.ts.
 *
 * WHY a SEPARATE ingest (not a flag on the PFF script): the PFF script stamps
 * PFF provenance (`source_urls: pff.com`, `coded_by: ingest:pff-ol-grades:v1`,
 * "Licensed feed"). Writing the ESPN proxy under that provenance would
 * corrupt the `historical_signal_codes` audit trail. The two sources are
 * construct-different (ESPN is a WIN-RATE share, PFF is a 0..100 charted
 * grade); the audit trail must say which one a row came from. So this script
 * shares the SAME write path + the SAME normalized 0..1 contract
 * (`historical-ol-grades.ts`), but stamps honest ESPN provenance and a
 * distinct `coded_by` tag.
 *
 * CONSTRUCT CAVEAT (carried in the row provenance): ESPN PBWR/RBWR is a
 * win-rate percentage, NOT PFF's 0..100 charted grade. The scraper
 * (`scrape-espn-block-winrate.ts`) already normalizes pct/100 to the rubric's
 * 0..1 scale, so this ingest reads ALREADY-NORMALIZED values and validates
 * them in [0, 1]. Read the resulting backtest as a rank-correlation test of
 * the proxy, not a like-for-like PFF stand-in. The QB backtest with these
 * rows (#68) landed a marginal OL lift of +0.002 (noise) on n=70; this ingest
 * exists so that read comes from the DB path the live rubric would use, not
 * only the `--ol-file` shortcut.
 *
 * Temporal blinding (VALIDATION_PLAN section 4): a season-S win rate is
 * knowable for decision year S+1 (preseason of the next year), so a row for
 * season S writes `prediction_year = S+1` with
 * `coded_with_knowledge_through = ${S+1}-09-15` (matching the KTC snapshot
 * cutoff the backtest reads). The `loadHistoricalOlGrades` vintage filter
 * then admits the row only under that cutoff.
 *
 * Idempotent: rows are deleted-then-inserted per (team, prediction_year,
 * signal_name) for THIS source's `coded_by` tag, so a re-run replaces rather
 * than duplicates, and never touches PFF-sourced rows.
 *
 *   # Dry-run (default; prints the plan, writes nothing):
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-espn-ol-grades.ts
 *
 *   # Write to production historical_signal_codes (founder-authorized):
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-espn-ol-grades.ts --write
 *
 *   # Custom input (defaults to the scraper's output):
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-espn-ol-grades.ts \
 *     --file data/free-ol-grades.json --write
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import {
  OL_GRADE_PASS_SIGNAL,
  OL_GRADE_RUN_SIGNAL,
  TEAM_ALIAS,
  normalizeTeam,
} from "../src/lib/signals/historical-ol-grades";
import { NFL_TEAMS } from "../src/lib/signals/schema";

const CODED_BY = "ingest:espn-ol-winrate:v1";
const VALID_TEAMS = new Set<string>([
  ...NFL_TEAMS,
  ...Object.keys(TEAM_ALIAS),
  ...Object.values(TEAM_ALIAS),
]);

type RawRow = {
  team: string;
  season: number;
  ol_grade_run: number | null;
  ol_grade_pass: number | null;
};

function parseArgs(argv: string[]): { write: boolean; file: string } {
  let write = false;
  let file = "data/free-ol-grades.json";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write") write = true;
    else if (a === "--file" && i + 1 < argv.length) {
      file = argv[i + 1];
      i++;
    }
  }
  return { write, file };
}

function normTeam(raw: string): string | null {
  const aliased = normalizeTeam(raw);
  return VALID_TEAMS.has(aliased) ? aliased : null;
}

function parseNum(s: number | string | null | undefined): number | null {
  if (s == null || s === "") return null;
  const n = typeof s === "number" ? s : Number(String(s).trim());
  return Number.isFinite(n) ? n : null;
}

/** The scraper writes a JSON array of {team, season, ol_grade_run/pass}. */
function parseFile(path: string): RawRow[] {
  const text = readFileSync(path, "utf8").trim();
  if (!text.startsWith("[")) {
    throw new Error(
      `Expected a JSON array at ${path} (the scrape-espn-block-winrate.ts output). Got a non-array file.`,
    );
  }
  const arr = JSON.parse(text) as Record<string, unknown>[];
  return arr.map((o) => ({
    team: String(o.team ?? ""),
    season: Number(o.season),
    ol_grade_run: parseNum(o.ol_grade_run as number | null),
    ol_grade_pass: parseNum(o.ol_grade_pass as number | null),
  }));
}

type CleanRow = {
  team: string;
  season: number;
  predictionYear: number;
  run: number | null;
  pass: number | null;
};

/** ESPN values arrive ALREADY normalized (pct/100). Validate in [0, 1]. */
function clean(rows: RawRow[]): {
  clean: CleanRow[];
  rejects: { row: RawRow; reason: string }[];
} {
  const out: CleanRow[] = [];
  const rejects: { row: RawRow; reason: string }[] = [];
  const inUnit = (v: number | null): number | null =>
    v == null ? null : v >= 0 && v <= 1 ? v : null;
  for (const r of rows) {
    const team = normTeam(r.team);
    if (!team) {
      rejects.push({ row: r, reason: `unknown team "${r.team}"` });
      continue;
    }
    if (!Number.isInteger(r.season) || r.season < 2000 || r.season > 2100) {
      rejects.push({ row: r, reason: `bad season "${r.season}"` });
      continue;
    }
    const run = inUnit(r.ol_grade_run);
    const pass = inUnit(r.ol_grade_pass);
    if (run == null && pass == null) {
      rejects.push({ row: r, reason: "both grades null / out of [0,1]" });
      continue;
    }
    out.push({ team, season: r.season, predictionYear: r.season + 1, run, pass });
  }
  return { clean: out, rejects };
}

type CodeRow = {
  team: string;
  prediction_year: number;
  signal_name: string;
  signal_value: { value: number };
  confidence: string;
  coded_with_knowledge_through: string;
  source_urls: string[];
  source_paragraphs: string[];
  rationale: string;
  coded_by: string;
};

function toCodeRows(rows: CleanRow[]): CodeRow[] {
  const codes: CodeRow[] = [];
  for (const r of rows) {
    const cutoff = `${r.predictionYear}-09-15`;
    const base = {
      team: r.team,
      prediction_year: r.predictionYear,
      confidence: "medium" as const,
      coded_with_knowledge_through: cutoff,
      source_urls: ["https://www.espn.com/nfl/story/_/id/"],
      source_paragraphs: [
        `ESPN team block win rate (PBWR/RBWR) for ${r.team}, season ${r.season}, normalized pct/100 to the rubric 0..1 scale; knowable as of preseason ${r.predictionYear}.`,
      ],
      rationale: `ESPN block-win-rate OL proxy (season ${r.season}) for decision year ${r.predictionYear}. FREE win-rate share, construct-distinct from a PFF charted grade; use as a rank proxy.`,
      coded_by: CODED_BY,
    };
    if (r.run != null)
      codes.push({ ...base, signal_name: OL_GRADE_RUN_SIGNAL, signal_value: { value: r.run } });
    if (r.pass != null)
      codes.push({ ...base, signal_name: OL_GRADE_PASS_SIGNAL, signal_value: { value: r.pass } });
  }
  return codes;
}

async function main() {
  const { write, file } = parseArgs(process.argv.slice(2));
  const path = resolve(process.cwd(), file);

  console.log("=== ESPN OL-grade ingest (Phase B6, FREE proxy) ===");
  console.log(
    "ESPN PBWR/RBWR is a FREE win-rate share, construct-distinct from a PFF charted grade. Rows are stamped with ESPN provenance + coded_by=" +
      CODED_BY +
      " so the audit trail never confuses them with PFF rows.\n",
  );

  if (!existsSync(path)) {
    console.log(
      `No input file at ${path}.\n` +
        `Run scripts/scrape-espn-block-winrate.ts first to produce it (team, season, ol_grade_run, ol_grade_pass, normalized 0..1).\n`,
    );
    return;
  }

  const raw = parseFile(path);
  const { clean: cleaned, rejects } = clean(raw);
  const codeRows = toCodeRows(cleaned);
  const seasons = [...new Set(cleaned.map((r) => r.season))].sort();
  const predictionYears = [...new Set(cleaned.map((r) => r.predictionYear))].sort();

  console.log(`Parsed ${raw.length} rows from ${file}.`);
  console.log(
    `Clean: ${cleaned.length} team-season rows -> ${codeRows.length} signal codes ` +
      `across seasons [${seasons.join(", ")}] (prediction years [${predictionYears.join(", ")}]).`,
  );
  if (rejects.length) {
    console.log(`Rejected ${rejects.length} row(s):`);
    for (const x of rejects.slice(0, 20))
      console.log(`  - ${JSON.stringify(x.row)} :: ${x.reason}`);
  }
  const sample = codeRows.slice(0, 4);
  console.log("Sample code rows (normalized 0..1):");
  for (const c of sample)
    console.log(
      `  ${c.team} ${c.prediction_year} ${c.signal_name}=${c.signal_value.value}`,
    );

  if (!write) {
    console.log("\n[espn-ol] DRY-RUN complete. No writes performed.");
    console.log(
      "Re-run with --write to upsert to production historical_signal_codes (founder authorization required).",
    );
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars; aborting --write");
  const sb = createClient(url, key);

  // Idempotent: delete this source's prior rows for the touched
  // (prediction_year, signal_name) set, then insert. Scoped to coded_by so
  // PFF-sourced rows are never touched.
  console.log(`\n[espn-ol] deleting prior ${CODED_BY} rows for prediction years [${predictionYears.join(", ")}]...`);
  const del = await sb
    .from("historical_signal_codes")
    .delete()
    .eq("coded_by", CODED_BY)
    .in("prediction_year", predictionYears)
    .in("signal_name", [OL_GRADE_RUN_SIGNAL, OL_GRADE_PASS_SIGNAL]);
  if (del.error) throw new Error(`delete failed: ${del.error.message}`);

  console.log(`[espn-ol] inserting ${codeRows.length} rows...`);
  const CHUNK = 100;
  let written = 0;
  for (let i = 0; i < codeRows.length; i += CHUNK) {
    const chunk = codeRows.slice(i, i + CHUNK);
    const ins = await sb.from("historical_signal_codes").insert(chunk);
    if (ins.error) throw new Error(`insert chunk ${i / CHUNK} failed: ${ins.error.message}`);
    written += chunk.length;
  }
  console.log(`[espn-ol] DONE. ${written} rows written to historical_signal_codes.`);
}

main().catch((e) => {
  console.error("[espn-ol] FATAL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
