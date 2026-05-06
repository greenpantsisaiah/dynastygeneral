/**
 * FantasyPros CSV ingest into historical_consensus_rankings. Per
 * VALIDATION_PLAN section 4 (vintaging) and section 7 (public
 * benchmarks), FP ECR is one of our 5 named scoreboard baselines.
 *
 * Source files in web/data/fantasypros/. Filename convention:
 *   fp_ecr_dynasty_{ppr|sf}_{YYYY}.csv
 *   fp_top20draft2024_dynasty_{ppr|sf}_2026.csv
 *   fp_adp_dynasty_{YYYY}.csv
 *
 * Snapshot dates: historical years (2022/2023/2024/2025) use Aug 15
 * of that year as preseason proxy. The 2026 current files use the
 * actual capture date 2026-05-05. The 2024 ECR file is dated by FP as
 * Jan 9 2025 in its UI but rookie variance analysis (Jayden Daniels
 * worst=109, std_dev=24.8) confirms content is preseason 2024.
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-fp-csvs.ts [--dry-run]
 *
 * Caveat: insert, not upsert. Re-running creates duplicates. Delete
 * by source before re-running if needed:
 *   delete from historical_consensus_rankings where source like 'fantasypros_%';
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import { readdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { __dumpAllPlayers } from "../src/lib/players/cache";

const FP_DIR = resolve(process.cwd(), "web/data/fantasypros");
const FP_DIR_FALLBACK = resolve(process.cwd(), "data/fantasypros");
const CURRENT_SNAPSHOT_DATE = "2026-05-05";

type FileKind = "ecr" | "top20draft" | "adp";

type FilePlan = {
  filename: string;
  fullPath: string;
  kind: FileKind;
  source: string;
  format: "1qb" | "sf";
  snapshotDate: string;
};

function parseArgs(argv: readonly string[]): { dryRun: boolean } {
  return { dryRun: argv.includes("--dry-run") };
}

function classifyFile(filename: string): FilePlan | null {
  const lower = filename.toLowerCase();
  if (!lower.endsWith(".csv")) return null;

  let kind: FileKind;
  let source: string;
  if (lower.startsWith("fp_ecr_")) {
    kind = "ecr";
    source = "fantasypros_ecr";
  } else if (lower.startsWith("fp_top20draft")) {
    kind = "top20draft";
    source = "fantasypros_top20draft2024";
  } else if (lower.startsWith("fp_adp_")) {
    kind = "adp";
    source = "fantasypros_adp";
  } else {
    return null;
  }

  const format: "1qb" | "sf" = lower.includes("_sf_") ? "sf" : "1qb";

  const yearMatch = filename.match(/(\d{4})\.csv$/);
  if (!yearMatch) return null;
  const year = yearMatch[1];

  const snapshotDate =
    year === "2026" ? CURRENT_SNAPSHOT_DATE : `${year}-08-15`;

  return {
    filename,
    fullPath: "",
    kind,
    source,
    format,
    snapshotDate,
  };
}

function parseCsvLine(line: string): string[] {
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
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

type ParsedRow = {
  rank: number;
  player_name: string;
  team: string | null;
  pos_combined: string;
  position: string | null;
  position_rank: number | null;
  raw: Record<string, unknown>;
};

function splitPosCombined(
  combined: string,
): { position: string | null; position_rank: number | null } {
  const m = combined.match(/^([A-Z]+)(\d+)?$/);
  if (!m) return { position: combined || null, position_rank: null };
  const position = m[1];
  const position_rank = m[2] ? Number(m[2]) : null;
  return { position, position_rank };
}

function parseEcrCsv(content: string): ParsedRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const out: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length < 5) continue;
    const rk = Number(cells[0]);
    if (!Number.isFinite(rk)) continue;
    const playerName = cells[2];
    const team = cells[3] || null;
    const posCombined = cells[4];
    const { position, position_rank } = splitPosCombined(posCombined);
    out.push({
      rank: rk,
      player_name: playerName,
      team,
      pos_combined: posCombined,
      position,
      position_rank,
      raw: {
        tier: Number(cells[1]),
        age: cells[5] ? Number(cells[5]) : null,
        best: cells[6] ? Number(cells[6]) : null,
        worst: cells[7] ? Number(cells[7]) : null,
        avg: cells[8] ? Number(cells[8]) : null,
        std_dev: cells[9] ? Number(cells[9]) : null,
        ecr_vs_adp: cells[10] || null,
      },
    });
  }
  return out;
}

function parseAdpCsv(content: string): ParsedRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const out: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length < 5) continue;
    const rk = Number(cells[0]);
    if (!Number.isFinite(rk)) continue;
    const playerName = cells[1];
    const team = cells[2] || null;
    const posCombined = cells[4];
    const { position, position_rank } = splitPosCombined(posCombined);
    out.push({
      rank: rk,
      player_name: playerName,
      team,
      pos_combined: posCombined,
      position,
      position_rank,
      raw: {
        bye: cells[3] ? Number(cells[3]) : null,
        avg: cells[5] ? Number(cells[5]) : null,
      },
    });
  }
  return out;
}

function stripNameSuffix(name: string): string {
  // FP ships "Patrick Mahomes II", Sleeper has "Patrick Mahomes". Strip
  // common generational suffixes so the keys match. Only at end of
  // string with leading whitespace, so we don't mangle names like
  // "Vita Vea" (V is not a trailing suffix here).
  return name.replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, "");
}

function nameKey(name: string, position: string | null): string {
  const stripped = stripNameSuffix(name);
  const cleanName = stripped
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
  const cleanPos = (position ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  return `${cleanName}|${cleanPos}`;
}

async function buildSleeperLookup(): Promise<Map<string, string>> {
  const sleeper = await __dumpAllPlayers();
  const lookup = new Map<string, string>();
  for (const p of sleeper) {
    const fullName =
      `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
      p.full_name ||
      "";
    if (!fullName) continue;
    const key = nameKey(fullName, p.position ?? null);
    if (!lookup.has(key)) lookup.set(key, p.player_id);
  }
  return lookup;
}

type InsertRow = {
  player_id: string;
  source: string;
  snapshot_date: string;
  format: string;
  rank: number;
  position: string | null;
  position_rank: number | null;
  raw_attributes: Record<string, unknown>;
};

async function ingestFile(
  plan: FilePlan,
  sleeperLookup: ReadonlyMap<string, string>,
  supabase: ReturnType<typeof createClient> | null,
  dryRun: boolean,
): Promise<{ rows: number; matched: number; unmatched: number }> {
  const content = readFileSync(plan.fullPath, "utf8");
  const parsed =
    plan.kind === "adp" ? parseAdpCsv(content) : parseEcrCsv(content);

  let matched = 0;
  let unmatched = 0;
  const rows: InsertRow[] = [];
  for (const r of parsed) {
    const key = nameKey(r.player_name, r.position);
    const sleeperId = sleeperLookup.get(key);
    if (!sleeperId) {
      unmatched++;
      continue;
    }
    matched++;
    rows.push({
      player_id: sleeperId,
      source: plan.source,
      snapshot_date: plan.snapshotDate,
      format: plan.format,
      rank: r.rank,
      position: r.position,
      position_rank: r.position_rank,
      raw_attributes: {
        ...r.raw,
        team: r.team,
        pos_combined: r.pos_combined,
        original_filename: plan.filename,
      },
    });
  }

  if (!dryRun && supabase && rows.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from("historical_consensus_rankings")
        .insert(chunk);
      if (error) {
        console.error(
          `[fp] ${plan.filename} chunk ${i / CHUNK} error:`,
          error.message,
        );
      }
    }
  }

  return { rows: rows.length, matched, unmatched };
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs(process.argv.slice(2));
  console.log(`[fp] ingest start ${dryRun ? "(dry-run)" : ""}`);

  let dir = FP_DIR;
  try {
    readdirSync(dir);
  } catch {
    dir = FP_DIR_FALLBACK;
  }
  const filenames = readdirSync(dir);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dryRun && (!supabaseUrl || !serviceKey)) {
    throw new Error("Missing Supabase env vars; aborting non-dry-run");
  }
  const supabase =
    !dryRun && supabaseUrl && serviceKey
      ? createClient(supabaseUrl, serviceKey)
      : null;

  console.log("[fp] building Sleeper name->id lookup...");
  const sleeperLookup = await buildSleeperLookup();
  console.log(`[fp] sleeper lookup ready (${sleeperLookup.size} entries)`);

  const plans: FilePlan[] = [];
  for (const fn of filenames) {
    const plan = classifyFile(fn);
    if (!plan) {
      console.log(`[fp] skip: ${fn}`);
      continue;
    }
    plan.fullPath = resolve(dir, fn);
    plans.push(plan);
  }
  console.log(`[fp] ${plans.length} CSV files queued`);

  let totalRows = 0;
  let totalMatched = 0;
  let totalUnmatched = 0;
  for (const plan of plans) {
    const { rows, matched, unmatched } = await ingestFile(
      plan,
      sleeperLookup,
      supabase,
      dryRun,
    );
    totalRows += rows;
    totalMatched += matched;
    totalUnmatched += unmatched;
    console.log(
      `[fp] ${plan.filename} src=${plan.source} fmt=${plan.format} date=${plan.snapshotDate}: matched ${matched}, unmatched ${unmatched}, rows ${rows}`,
    );
  }

  console.log(
    `[fp] DONE. files=${plans.length} rows=${totalRows} matched=${totalMatched} unmatched=${totalUnmatched}`,
  );
}

main().catch((err) => {
  console.error("[fp] fatal:", err);
  process.exit(1);
});
