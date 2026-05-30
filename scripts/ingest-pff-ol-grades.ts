/**
 * Phase B6 (MODEL_LIVE_PLAN, sig-ol-grade) ingestion: land PFF offensive-
 * line run/pass-blocking grades, season-dimensioned, for the validate-first
 * QB backtest and (under an explicit flag) the current live snapshot.
 *
 * PFF is a LICENSED PAID feed. This script ingests a file the founder
 * EXPORTED from their PFF subscription (CSV or JSON). It does NOT pull
 * from PFF directly: a scripted pull is gated on (1) confirming the
 * founder's PFF plan tier permits programmatic access in PFF's ToS, and
 * (2) live credentials supplied via env (never committed). Until both are
 * confirmed, export-then-ingest is the ToS-safe path. Raw licensed bulk
 * data is NEVER committed to the repo; it lands in the DB and the source
 * file stays out of git (see .gitignore note in the PR).
 *
 * Two landing spots, two purposes:
 *
 *   1. historical_signal_codes (migration 0010): the VINTAGE backtest
 *      store, keyed (team, prediction_year, signal_name). A season-S OL
 *      grade is knowable for decision year S+1 (preseason of the next
 *      year), so a row for season S writes prediction_year = S+1 with
 *      coded_with_knowledge_through = `${S+1}-09-15` (matching the KTC
 *      snapshot vintage the cohort uses). This is what the QB backtest's
 *      --with-ol pass reads. ALWAYS written (under --write).
 *
 *   2. team_signals (migration 0009): the single current-snapshot row per
 *      team the LIVE rubric reads (no season dimension). Written ONLY with
 *      --snapshot AND --write, and only for the most recent season in the
 *      file. The QB rubric's ol_grade_pass branch reads this at runtime.
 *
 * Normalization: PFF publishes 0..100 grades. Both stores hold the
 * NORMALIZED 0..1 value (the scale the rubrics read; see
 * src/lib/signals/historical-ol-grades.ts normalizePffGrade). Pass
 * --already-normalized if the file already carries 0..1 values.
 *
 * Usage:
 *   # Dry-run (default): validate + normalize + print every row, write nothing.
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-pff-ol-grades.ts \
 *     --file data/pff-ol-grades.csv
 *
 *   # Write the vintage backtest rows (FOUNDER-AUTHORIZED):
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-pff-ol-grades.ts \
 *     --file data/pff-ol-grades.csv --write
 *
 *   # Also refresh the current live snapshot on team_signals:
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-pff-ol-grades.ts \
 *     --file data/pff-ol-grades.csv --write --snapshot
 *
 * Input shape (CSV header row, or JSON array of objects):
 *   team,season,ol_grade_run,ol_grade_pass
 *   PHI,2023,82.4,78.1
 *   ...
 * `team` is an NFL abbreviation (validated against NFL_TEAMS, with a few
 * legacy-alias remaps); `season` is the year the grade was EARNED.
 *
 * Idempotent: historical_signal_codes rows are deleted-then-inserted per
 * (team, prediction_year, signal_name) so a re-run replaces rather than
 * duplicates. team_signals is upserted on `team`.
 */
import { config as loadEnv } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { NFL_TEAMS } from "../src/lib/signals/schema";
import {
  normalizeTeam,
  normalizePffGrade,
  OL_GRADE_PASS_SIGNAL,
  OL_GRADE_RUN_SIGNAL,
} from "../src/lib/signals/historical-ol-grades";

const CHUNK = 200;
const VALID_TEAMS = new Set<string>(NFL_TEAMS);

type RawRow = {
  team: string;
  season: number;
  ol_grade_run: number | null;
  ol_grade_pass: number | null;
};

type Args = {
  write: boolean;
  snapshot: boolean;
  alreadyNormalized: boolean;
  file: string;
};

function parseArgs(argv: readonly string[]): Args {
  const args = new Map<string, string>();
  let write = false;
  let snapshot = false;
  let alreadyNormalized = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write") write = true;
    else if (a === "--snapshot") snapshot = true;
    else if (a === "--already-normalized") alreadyNormalized = true;
    else if (a.startsWith("--") && i + 1 < argv.length) {
      args.set(a.slice(2), argv[i + 1]);
      i++;
    }
  }
  return {
    write,
    snapshot,
    alreadyNormalized,
    file: args.get("file") ?? "data/pff-ol-grades.csv",
  };
}

function normTeam(raw: string): string | null {
  const aliased = normalizeTeam(raw);
  return VALID_TEAMS.has(aliased) ? aliased : null;
}

function parseNum(s: string | number | null | undefined): number | null {
  if (s == null || s === "") return null;
  const n = typeof s === "number" ? s : Number(String(s).trim());
  return Number.isFinite(n) ? n : null;
}

/** Parse the export file (JSON array or CSV with a header row). */
function parseFile(path: string): RawRow[] {
  const text = readFileSync(path, "utf8").trim();
  const rows: RawRow[] = [];
  if (text.startsWith("[")) {
    const arr = JSON.parse(text) as Record<string, unknown>[];
    for (const o of arr) {
      rows.push({
        team: String(o.team ?? ""),
        season: Number(o.season),
        ol_grade_run: parseNum(o.ol_grade_run as number | null),
        ol_grade_pass: parseNum(o.ol_grade_pass as number | null),
      });
    }
    return rows;
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iTeam = idx("team");
  const iSeason = idx("season");
  const iRun = idx("ol_grade_run");
  const iPass = idx("ol_grade_pass");
  if (iTeam < 0 || iSeason < 0 || (iRun < 0 && iPass < 0)) {
    throw new Error(
      "CSV header must include: team, season, and at least one of ol_grade_run / ol_grade_pass",
    );
  }
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    rows.push({
      team: c[iTeam] ?? "",
      season: Number(c[iSeason]),
      ol_grade_run: iRun >= 0 ? parseNum(c[iRun]) : null,
      ol_grade_pass: iPass >= 0 ? parseNum(c[iPass]) : null,
    });
  }
  return rows;
}

type CleanRow = {
  team: string;
  season: number;
  predictionYear: number;
  run: number | null;
  pass: number | null;
};

function clean(rows: RawRow[], alreadyNormalized: boolean): {
  clean: CleanRow[];
  rejects: { row: RawRow; reason: string }[];
} {
  const out: CleanRow[] = [];
  const rejects: { row: RawRow; reason: string }[] = [];
  const norm = (v: number | null): number | null =>
    v == null ? null : alreadyNormalized ? (v >= 0 && v <= 1 ? v : null) : normalizePffGrade(v);
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
    const run = norm(r.ol_grade_run);
    const pass = norm(r.ol_grade_pass);
    if (run == null && pass == null) {
      rejects.push({ row: r, reason: "both grades null / out of range" });
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
      confidence: "high" as const,
      coded_with_knowledge_through: cutoff,
      source_urls: ["https://www.pff.com/"],
      source_paragraphs: [
        `PFF offensive-line grade for ${r.team} earned in season ${r.season}, normalized 0..1; knowable as of preseason ${r.predictionYear}.`,
      ],
      rationale: `PFF OL grade (season ${r.season}) for decision year ${r.predictionYear}. Licensed feed; raw value not stored in repo.`,
      coded_by: "ingest:pff-ol-grades:v1",
    };
    if (r.run != null)
      codes.push({ ...base, signal_name: OL_GRADE_RUN_SIGNAL, signal_value: { value: r.run } });
    if (r.pass != null)
      codes.push({ ...base, signal_name: OL_GRADE_PASS_SIGNAL, signal_value: { value: r.pass } });
  }
  return codes;
}

async function main() {
  const { write, snapshot, alreadyNormalized, file } = parseArgs(
    process.argv.slice(2),
  );
  const path = resolve(process.cwd(), file);

  console.log("=== PFF OL-grade ingest (Phase B6) ===");
  console.log(
    "PFF is a licensed paid feed. This script ingests a founder-exported file; it does NOT pull from PFF. A scripted pull requires confirmed ToS programmatic-access on the plan tier + env credentials.\n",
  );

  if (!existsSync(path)) {
    console.log(
      `No input file at ${path}.\n` +
        `This script is wired and dry-run-validated; it lands data once the founder exports PFF (team, season, ol_grade_run, ol_grade_pass) to that path.\n` +
        `Expected CSV header: team,season,ol_grade_run,ol_grade_pass (grades on PFF's native 0..100 scale, or pass --already-normalized for 0..1).\n`,
    );
    return;
  }

  const raw = parseFile(path);
  const { clean: cleaned, rejects } = clean(raw, alreadyNormalized);
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
  // Sample (normalized values, never the raw licensed grade beyond the file).
  console.log("\nSample (normalized 0..1):");
  for (const r of cleaned.slice(0, 8))
    console.log(
      `  ${r.team} season ${r.season} -> pred ${r.predictionYear}  run=${r.run ?? "n/a"}  pass=${r.pass ?? "n/a"}`,
    );

  if (!write) {
    console.log(
      `\nDRY-RUN. No writes. Re-run with --write (founder-authorized) to land ${codeRows.length} historical_signal_codes rows.` +
        (snapshot
          ? " --snapshot will also upsert the latest season onto team_signals."
          : " Add --snapshot to also refresh the live team_signals snapshot."),
    );
    return;
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // historical_signal_codes: delete-then-insert per (team, prediction_year,
  // signal_name) so a re-run replaces rather than duplicates.
  for (const py of predictionYears) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any)
      .from("historical_signal_codes")
      .delete()
      .eq("prediction_year", py)
      .in("signal_name", [OL_GRADE_RUN_SIGNAL, OL_GRADE_PASS_SIGNAL])
      .not("team", "is", null);
  }
  let inserted = 0;
  for (let i = 0; i < codeRows.length; i += CHUNK) {
    const chunk = codeRows.slice(i, i + CHUNK);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb as any)
      .from("historical_signal_codes")
      .insert(chunk);
    if (error) {
      console.error(`[ingest] historical_signal_codes insert error:`, error.message);
      process.exit(1);
    }
    inserted += chunk.length;
  }
  console.log(`\nWrote ${inserted} historical_signal_codes rows.`);

  if (snapshot) {
    const latest = Math.max(...seasons);
    const latestRows = cleaned.filter((r) => r.season === latest);
    const upserts = latestRows.map((r) => ({
      team: r.team,
      ol_grade_run: r.run,
      ol_grade_pass: r.pass,
      source_attribution: {
        ol_grade_run: { source: "PFF", season: latest, ingested_by: "pff-ol-grades:v1" },
        ol_grade_pass: { source: "PFF", season: latest, ingested_by: "pff-ol-grades:v1" },
      },
      last_updated: new Date().toISOString(),
      updated_by: "ingest:pff-ol-grades:v1",
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb as any)
      .from("team_signals")
      .upsert(upserts, { onConflict: "team" });
    if (error) {
      console.error(`[ingest] team_signals upsert error:`, error.message);
      process.exit(1);
    }
    console.log(
      `Refreshed team_signals ol_grade_run/pass for ${upserts.length} teams (season ${latest}).`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
