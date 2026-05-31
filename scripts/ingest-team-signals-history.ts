/**
 * Phase B historical signal corpus (MODEL_LIVE_PLAN, sig-history) ingest:
 * merge the per-season LLM-extracted coaching+scheme rows
 * (extract-team-coaching-scheme-history.ts) with the per-season nflverse-
 * derived game-script metrics (derive-team-metrics.ts run per season) and
 * upsert into team_signals_history, keyed (team, season).
 *
 * Temporal-blinding decision (VALIDATION_PLAN.md section 4). A backtest
 * decision year Y uses signals KNOWN at preseason Y:
 *   - Coaching / scheme codings are coded AS OF the start of season Y
 *     (the extraction script anchors to that). Known at preseason Y.
 *   - Derived game-script rates (pass_rate_neutral, personnel_12_rate,
 *     scheme_pace) are REALIZED during a season, so season-Y rates are
 *     NOT known at preseason Y. We therefore attach the PRIOR season's
 *     (Y-1) realized rates as the preseason-known proxy, and record which
 *     season they came from in `derived_pbp_season`. This mirrors how the
 *     player usage signals in the cohort are prior-year (snap_share_prior_year
 *     = Y-1). A row for season Y with no Y-1 derived file leaves the
 *     derived rates null (honest absence, not a guess).
 *
 * Columns written per (team, season):
 *   - team, season (composite key)
 *   - scheme_tag, hc_id, hc_first_time_flag, hc_tenure_yrs,
 *     hc_background_tag, oc_id, oc_tenure_yrs, oc_first_year_with_team_flag,
 *     staff_novelty_composite        [LLM, founder-validated]
 *   - pass_rate_neutral, scheme_pace, personnel_12_rate   [derived, Y-1]
 *   - derived_pbp_season             [which season the derived rates are from]
 *   - source_attribution (jsonb)     [per-field provenance]
 *   - last_updated, updated_by
 *
 * The hc_first_time_flag installation-window gate from the 2026 ingest is
 * applied identically here (the QB rubric reads it ONLY as a tier-1
 * installation-uncertainty signal, so an established first-time HC, e.g.
 * McVay in 2021, must not fire it; the raw LLM determination is preserved
 * in source_attribution).
 *
 *   # Dry-run (default; prints every row, writes nothing):
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-team-signals-history.ts \
 *     --extracted data/team-coaching-scheme-history.json \
 *     --derived data/team-derived-metrics-2020.json,data/team-derived-metrics-2021.json,data/team-derived-metrics-2022.json,data/team-derived-metrics-2023.json
 *
 *   # Write to production (FOUNDER AUTHORIZATION REQUIRED):
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-team-signals-history.ts \
 *     --extracted data/team-coaching-scheme-history.json \
 *     --derived <comma-separated derived JSONs> --write
 *
 * Upsert keys on (team, season). Re-runnable. Unmatched (team, season)
 * pairs (extracted without a derived file, or vice versa) are logged, not
 * silently dropped.
 */
import { config as loadEnv } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import {
  HC_BACKGROUND_TAGS,
  NFL_TEAMS,
  SCHEME_TAGS,
  type HcBackgroundTag,
  type NflTeam,
  type SchemeTag,
} from "../src/lib/signals/schema";

const CHUNK = 200;
const UPDATED_BY = "ingest-team-signals-history@2026-05-30";
const LLM_LICENSE = "internal-research";
const NFLVERSE_LICENSE = "CC-BY-4.0";
const HC_INSTALL_WINDOW_YRS = 1;

function parseArgs(argv: readonly string[]): {
  write: boolean;
  extracted: string;
  derived: string[];
} {
  const args = new Map<string, string>();
  let write = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write") write = true;
    else if (a.startsWith("--") && i + 1 < argv.length) {
      args.set(a.slice(2), argv[i + 1]);
      i++;
    }
  }
  const derivedArg = args.get("derived") ?? "";
  return {
    write,
    extracted: args.get("extracted") ?? "data/team-coaching-scheme-history.json",
    derived: derivedArg ? derivedArg.split(",").map((s) => s.trim()).filter(Boolean) : [],
  };
}

type CodedField = {
  value: string | number | boolean | null;
  confidence: string;
  rationale: string;
};

type ExtractedRow = {
  extracted_at: string;
  season: number;
  scheme_tag: CodedField;
  hc_id: CodedField;
  hc_first_time_flag: CodedField;
  hc_tenure_yrs: CodedField;
  hc_background_tag: CodedField;
  oc_id: CodedField;
  oc_tenure_yrs: CodedField;
  oc_first_year_with_team_flag: CodedField;
  staff_novelty_composite: CodedField;
  source_urls?: string[];
};

type ExtractedDoc = {
  schema: string;
  seasons: number[];
  generated_at: string;
  model: string;
  rows: Record<string, ExtractedRow>;
};

type DerivedTeam = {
  team: NflTeam;
  pass_rate_neutral: number | null;
  scheme_pace: number | null;
  personnel_12_rate: number | null;
  sample: {
    neutral_attempts: number;
    regulation_offensive_plays: number;
    regulation_games: number;
    participation_offensive_plays: number;
    participation_personnel_12: number;
  };
};

type DerivedDoc = {
  season: number;
  generated_at: string;
  source: { pbp: string; participation: string; license: string };
  neutral_filter: string;
  metrics: DerivedTeam[];
};

function loadExtracted(path: string): ExtractedDoc {
  if (!existsSync(path))
    throw new Error(
      `extracted JSON not found: ${path}. Run extract-team-coaching-scheme-history.ts first.`,
    );
  return JSON.parse(readFileSync(path, "utf8")) as ExtractedDoc;
}

function loadDerived(paths: string[]): Map<number, Map<string, DerivedTeam>> {
  // keyed by the DERIVED season, then by team. The merge step looks up
  // (season - 1) per the temporal-blinding decision.
  const bySeason = new Map<number, Map<string, DerivedTeam>>();
  for (const path of paths) {
    if (!existsSync(path)) {
      console.warn(`[ingest-history] derived JSON not found, skipping: ${path}`);
      continue;
    }
    const doc = JSON.parse(readFileSync(path, "utf8")) as DerivedDoc;
    const byTeam = new Map<string, DerivedTeam>(
      doc.metrics.map((m) => [m.team, m]),
    );
    bySeason.set(doc.season, byTeam);
    console.log(
      `[ingest-history] loaded derived season ${doc.season}: ${doc.metrics.length} teams`,
    );
  }
  return bySeason;
}

function coerceScheme(v: unknown): SchemeTag | null {
  if (typeof v !== "string") return null;
  return (SCHEME_TAGS as readonly string[]).includes(v) ? (v as SchemeTag) : null;
}
function coerceHcBg(v: unknown): HcBackgroundTag | null {
  if (typeof v !== "string") return null;
  return (HC_BACKGROUND_TAGS as readonly string[]).includes(v)
    ? (v as HcBackgroundTag)
    : null;
}
function coerceBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}
function coerceInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}
function coerceStr(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  return null;
}

type HistoryRow = {
  team: string;
  season: number;
  scheme_tag: SchemeTag | null;
  hc_id: string | null;
  hc_first_time_flag: boolean | null;
  hc_tenure_yrs: number | null;
  hc_background_tag: HcBackgroundTag | null;
  oc_id: string | null;
  oc_tenure_yrs: number | null;
  oc_first_year_with_team_flag: boolean | null;
  staff_novelty_composite: number;
  pass_rate_neutral: number | null;
  scheme_pace: number | null;
  personnel_12_rate: number | null;
  derived_pbp_season: number | null;
  source_attribution: Record<string, unknown>;
  last_updated: string;
  updated_by: string;
};

function buildRow(args: {
  team: NflTeam;
  season: number;
  ext: ExtractedRow;
  derived: DerivedTeam | null;
  derivedSeason: number | null;
}): HistoryRow {
  const { team, season, ext, derived, derivedSeason } = args;
  const now = new Date().toISOString();
  const attribution: Record<string, unknown> = {};

  const scheme_tag = coerceScheme(ext.scheme_tag.value);
  const hc_id = coerceStr(ext.hc_id.value);
  const hc_tenure_yrs = coerceInt(ext.hc_tenure_yrs.value);
  const hc_background_tag = coerceHcBg(ext.hc_background_tag.value);
  const oc_id = coerceStr(ext.oc_id.value);
  const oc_tenure_yrs = coerceInt(ext.oc_tenure_yrs.value);
  const oc_first_year_with_team_flag = coerceBool(
    ext.oc_first_year_with_team_flag.value,
  );
  const staff_novelty_composite = coerceInt(ext.staff_novelty_composite.value) ?? 0;

  // Same installation-window gate as the 2026 ingest: a coach who is a
  // first-time NFL HC but years into the job is the opposite of
  // instability, so the rubric-faithful flag fires only inside the
  // installation window (tenure <= 1).
  const rawHcFirstTime = coerceBool(ext.hc_first_time_flag.value);
  const hc_first_time_flag =
    rawHcFirstTime == null
      ? null
      : rawHcFirstTime === true && (hc_tenure_yrs ?? 99) <= HC_INSTALL_WINDOW_YRS;

  const llmCoded = {
    source: "anthropic.claude-sonnet-4-6+web_search",
    license: LLM_LICENSE,
    coded_at: ext.extracted_at,
    reviewed_by: "founder",
    coded_for_season: season,
    source_urls: ext.source_urls ?? [],
  };
  for (const field of [
    "scheme_tag",
    "hc_id",
    "hc_first_time_flag",
    "hc_tenure_yrs",
    "hc_background_tag",
    "oc_id",
    "oc_tenure_yrs",
    "oc_first_year_with_team_flag",
    "staff_novelty_composite",
  ]) {
    attribution[field] = {
      ...llmCoded,
      confidence: (ext as unknown as Record<string, CodedField>)[field]?.confidence,
      rationale: (ext as unknown as Record<string, CodedField>)[field]?.rationale,
    };
  }
  (attribution.hc_first_time_flag as Record<string, unknown>).gate = `shipped value = (LLM first_time_ever) AND (hc_tenure_yrs <= ${HC_INSTALL_WINDOW_YRS}); rubric uses this as a tier-1 QB installation-uncertainty signal`;
  (attribution.hc_first_time_flag as Record<string, unknown>).raw_first_time_ever =
    rawHcFirstTime;

  const pass_rate_neutral = derived?.pass_rate_neutral ?? null;
  const scheme_pace = derived?.scheme_pace ?? null;
  const personnel_12_rate = derived?.personnel_12_rate ?? null;
  if (derived && derivedSeason != null) {
    const baseDerived = {
      source: "nflverse",
      license: NFLVERSE_LICENSE,
      season: derivedSeason,
      note: `prior-season (Y-1) realized rate used as the preseason-${season} known proxy`,
      generated_at: now,
    };
    attribution.pass_rate_neutral = {
      ...baseDerived,
      input: "play_by_play",
      sample_size: derived.sample.neutral_attempts,
    };
    attribution.scheme_pace = {
      ...baseDerived,
      input: "play_by_play",
      sample_plays: derived.sample.regulation_offensive_plays,
    };
    attribution.personnel_12_rate = {
      ...baseDerived,
      input: "pbp_participation",
      sample_plays: derived.sample.participation_offensive_plays,
    };
  }

  return {
    team,
    season,
    scheme_tag,
    hc_id,
    hc_first_time_flag,
    hc_tenure_yrs,
    hc_background_tag,
    oc_id,
    oc_tenure_yrs,
    oc_first_year_with_team_flag,
    staff_novelty_composite,
    pass_rate_neutral,
    scheme_pace,
    personnel_12_rate,
    derived_pbp_season: derived ? derivedSeason : null,
    source_attribution: attribution,
    last_updated: now,
    updated_by: UPDATED_BY,
  };
}

function printRow(r: HistoryRow): void {
  const fields = [
    `scheme=${r.scheme_tag ?? "(null)"}`,
    `hc=${r.hc_id ?? "(null)"}`,
    `hc_tenure=${r.hc_tenure_yrs ?? "(null)"}y`,
    `hc_first=${r.hc_first_time_flag}`,
    `oc=${r.oc_id ?? "(null)"}`,
    `oc_tenure=${r.oc_tenure_yrs ?? "(null)"}y`,
    `oc_first=${r.oc_first_year_with_team_flag}`,
    `novelty=${r.staff_novelty_composite}`,
    `pass=${r.pass_rate_neutral?.toFixed(3) ?? "null"}`,
    `p12=${r.personnel_12_rate?.toFixed(3) ?? "null"}`,
    `pbp_y=${r.derived_pbp_season ?? "null"}`,
  ];
  console.log(`  ${r.team.padEnd(4)} ${String(r.season)}  ${fields.join(" ")}`);
}

async function main(): Promise<void> {
  const { write, extracted, derived } = parseArgs(process.argv.slice(2));
  console.log(
    `[ingest-history] mode=${write ? "WRITE (production Supabase)" : "DRY-RUN"} extracted=${extracted} derived=[${derived.join(", ")}]`,
  );

  const ext = loadExtracted(extracted);
  const derivedBySeason = loadDerived(derived);
  console.log(
    `[ingest-history] extracted doc: ${Object.keys(ext.rows).length} (team,season) rows; seasons=${ext.seasons.join(",")}`,
  );

  const rows: HistoryRow[] = [];
  const missingDerived: string[] = [];
  for (const [key, extRow] of Object.entries(ext.rows)) {
    const [teamRaw, seasonRaw] = key.split(":");
    const team = teamRaw as NflTeam;
    const season = Number(seasonRaw);
    if (!(NFL_TEAMS as readonly string[]).includes(team) || !Number.isInteger(season)) {
      console.warn(`[ingest-history] skipping malformed key: ${key}`);
      continue;
    }
    // Temporal blinding: attach Y-1 derived rates as the preseason-Y proxy.
    const derivedSeason = season - 1;
    const derivedTeam = derivedBySeason.get(derivedSeason)?.get(team) ?? null;
    if (!derivedTeam) missingDerived.push(`${team}:${season} (needs ${derivedSeason})`);
    rows.push(
      buildRow({ team, season, ext: extRow, derived: derivedTeam, derivedSeason }),
    );
  }

  rows.sort((a, b) => (a.season - b.season) || a.team.localeCompare(b.team));

  console.log(`\n[ingest-history] rows (${rows.length}):`);
  for (const r of rows) printRow(r);

  const have = (k: keyof HistoryRow) =>
    rows.filter((r) => r[k] != null && r[k] !== "").length;
  console.log(
    `\n[ingest-history] coverage: scheme=${have("scheme_tag")}/${rows.length} oc_tenure=${have("oc_tenure_yrs")}/${rows.length} oc_first=${have("oc_first_year_with_team_flag")}/${rows.length} hc_first=${have("hc_first_time_flag")}/${rows.length} pass=${have("pass_rate_neutral")}/${rows.length} p12=${have("personnel_12_rate")}/${rows.length}`,
  );
  if (missingDerived.length) {
    console.warn(
      `\n[ingest-history] ${missingDerived.length} (team,season) rows have NO Y-1 derived metrics (derived rates left null):\n  ${missingDerived.join("\n  ")}`,
    );
  }

  if (!write) {
    console.log("\n[ingest-history] DRY-RUN complete. No writes performed.");
    console.log(
      "Re-run with --write to upsert to production team_signals_history (founder authorization required).",
    );
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars; aborting --write");

  const sb = createClient(url, key);
  console.log(
    `\n[ingest-history] writing ${rows.length} rows to team_signals_history...`,
  );
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await sb
      .from("team_signals_history")
      .upsert(chunk, { onConflict: "team,season" });
    if (error) {
      console.error(`[ingest-history] chunk ${i / CHUNK} upsert error:`, error.message);
      process.exit(1);
    }
    written += chunk.length;
  }
  console.log(`[ingest-history] DONE. ${written} rows upserted.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[ingest-history] fatal:", err);
    process.exit(1);
  });
