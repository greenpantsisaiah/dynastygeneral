/**
 * Phase B #1 (MODEL_LIVE_PLAN, sig-scheme32) ingestion: merge the LLM-
 * extracted coaching+scheme JSON (`scripts/extract-team-coaching-scheme.ts`)
 * with the nflverse-derived numeric JSON (`scripts/derive-team-metrics.ts`)
 * and upsert all 32 team_signals rows to production Supabase.
 *
 * Columns written (per row):
 *   - team (primary key)
 *   - scheme_tag                       [LLM, manual]
 *   - hc_id                            [LLM, manual]
 *   - hc_first_time_flag               [LLM, manual]
 *   - hc_tenure_yrs                    [LLM, manual]
 *   - hc_background_tag                [LLM, manual]
 *   - oc_id                            [LLM, manual]
 *   - oc_tenure_yrs                    [LLM, manual]
 *   - oc_first_year_with_team_flag    [LLM, manual]
 *   - staff_novelty_composite          [LLM, manual]
 *   - pass_rate_neutral                [derived, nflverse pbp]
 *   - scheme_pace                      [derived, nflverse pbp]
 *   - personnel_12_rate                [derived, nflverse pbp_participation]
 *   - source_attribution (jsonb)       [per-field provenance]
 *   - last_updated, updated_by
 *
 * NOT written by this script (out of scope; tracked separately):
 *   - ol_continuity_score              [already 100% populated by an
 *                                       earlier snap-counts pass]
 *   - ol_grade_run / ol_grade_pass     [PFF-paid; founder decision]
 *   - rookie_ol_starters_count / breakdown  [OL track]
 *
 * Usage:
 *   # Dry-run (default; prints all 32 rows in human-readable form):
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-team-signals.ts
 *
 *   # Write to production Supabase (founder authorization required):
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-team-signals.ts --write \
 *     --extracted data/team-coaching-scheme-2026.json \
 *     --derived data/team-derived-metrics-2025.json
 *
 * Upsert keys on `team`. Re-runnable.
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

const CHUNK = 32; // small set, single chunk

function parseArgs(argv: readonly string[]): {
  write: boolean;
  extracted: string;
  derived: string;
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
  return {
    write,
    extracted: args.get("extracted") ?? "data/team-coaching-scheme-2026.json",
    derived: args.get("derived") ?? "data/team-derived-metrics-2025.json",
  };
}

type CodedField = {
  value: string | number | boolean | null;
  confidence: string;
  rationale: string;
};

type ExtractedTeam = {
  extracted_at: string;
  scheme_tag: CodedField;
  hc_id: CodedField;
  hc_first_time_flag: CodedField;
  hc_tenure_yrs: CodedField;
  hc_background_tag: CodedField;
  oc_id: CodedField;
  oc_tenure_yrs: CodedField;
  oc_first_year_with_team_flag: CodedField;
  staff_novelty_composite: CodedField;
  source_urls: string[];
  source_paragraphs?: string[];
  extraction_notes?: string;
};

type ExtractedDoc = {
  prediction_year: number;
  generated_at: string;
  model: string;
  teams: Partial<Record<NflTeam, ExtractedTeam>>;
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
    throw new Error(`extracted JSON not found: ${path}. Run extract-team-coaching-scheme.ts first.`);
  return JSON.parse(readFileSync(path, "utf8")) as ExtractedDoc;
}

function loadDerived(path: string): DerivedDoc {
  if (!existsSync(path))
    throw new Error(`derived JSON not found: ${path}. Run derive-team-metrics.ts first.`);
  return JSON.parse(readFileSync(path, "utf8")) as DerivedDoc;
}

function coerceScheme(v: unknown): SchemeTag | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  return (SCHEME_TAGS as readonly string[]).includes(v) ? (v as SchemeTag) : null;
}

function coerceHcBg(v: unknown): HcBackgroundTag | null {
  if (v == null) return null;
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

type TeamSignalRow = {
  team: string;
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
  source_attribution: Record<string, unknown>;
  last_updated: string;
  updated_by: string;
};

const UPDATED_BY = "ingest-team-signals@2026-05-27";
const LLM_LICENSE = "internal-research";
const NFLVERSE_LICENSE = "CC-BY-4.0";

function buildRow(args: {
  team: NflTeam;
  extracted: ExtractedTeam | null;
  derived: DerivedTeam | null;
  extractedAt: string;
  derivedSeason: number;
}): TeamSignalRow {
  const { team, extracted, derived, extractedAt, derivedSeason } = args;
  const now = new Date().toISOString();
  const attribution: Record<string, unknown> = {};

  // --- LLM-extracted fields ---
  const scheme_tag = extracted ? coerceScheme(extracted.scheme_tag.value) : null;
  const hc_id = extracted ? coerceStr(extracted.hc_id.value) : null;
  const hc_tenure_yrs = extracted ? coerceInt(extracted.hc_tenure_yrs.value) : null;
  // hc_first_time_flag is read by qb.ts ONLY to widen a tier-1 QB's variance
  // band as an installation-uncertainty signal ("elite QB with first-time
  // HC"). A coach who is technically a first-time NFL HC but is now years into
  // the job (McVay y10, Shanahan y10, O'Connell y5, Sirianni y6) is the
  // opposite of instability, so the raw "first NFL HC job ever" value (which
  // the LLM coded inconsistently across long-tenured coaches) is gated to the
  // installation window (tenure <= 1). This resolves Issue 1 in
  // data/team-signals-validation-findings.md the rubric-faithful way: it fires
  // only for genuine rookie HCs, not by flipping established coaches to True.
  // The raw LLM determination + rationale are preserved in source_attribution.
  const HC_INSTALL_WINDOW_YRS = 1;
  const rawHcFirstTime = extracted
    ? coerceBool(extracted.hc_first_time_flag.value)
    : null;
  const hc_first_time_flag =
    rawHcFirstTime == null
      ? null
      : rawHcFirstTime === true && (hc_tenure_yrs ?? 99) <= HC_INSTALL_WINDOW_YRS;
  const hc_background_tag = extracted
    ? coerceHcBg(extracted.hc_background_tag.value)
    : null;
  const oc_id = extracted ? coerceStr(extracted.oc_id.value) : null;
  const oc_tenure_yrs = extracted ? coerceInt(extracted.oc_tenure_yrs.value) : null;
  const oc_first_year_with_team_flag = extracted
    ? coerceBool(extracted.oc_first_year_with_team_flag.value)
    : null;
  const staff_novelty_composite = extracted
    ? (coerceInt(extracted.staff_novelty_composite.value) ?? 0)
    : 0;

  if (extracted) {
    const llmCoded = {
      source: "anthropic.claude-sonnet-4-6+web_search",
      license: LLM_LICENSE,
      coded_at: extractedAt,
      reviewed_by: "founder",
      source_urls: extracted.source_urls ?? [],
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
        confidence: (extracted as unknown as Record<string, CodedField>)[field]
          ?.confidence,
        rationale: (extracted as unknown as Record<string, CodedField>)[field]
          ?.rationale,
      };
    }
    // Record the installation-window gate applied to hc_first_time_flag so the
    // shipped boolean's provenance is honest about diverging from the raw LLM
    // "first NFL HC job ever" value (see Issue 1 in the validation findings).
    (attribution.hc_first_time_flag as Record<string, unknown>).gate = `shipped value = (LLM first_time_ever) AND (hc_tenure_yrs <= ${HC_INSTALL_WINDOW_YRS}); rubric uses this as a tier-1 QB installation-uncertainty signal, so established first-time HCs do not fire it`;
    (attribution.hc_first_time_flag as Record<string, unknown>).raw_first_time_ever =
      rawHcFirstTime;
  }

  // --- Derived fields ---
  const pass_rate_neutral = derived?.pass_rate_neutral ?? null;
  const scheme_pace = derived?.scheme_pace ?? null;
  const personnel_12_rate = derived?.personnel_12_rate ?? null;

  if (derived) {
    const baseDerived = {
      source: "nflverse",
      license: NFLVERSE_LICENSE,
      season: derivedSeason,
      generated_at: now,
    };
    attribution.pass_rate_neutral = {
      ...baseDerived,
      input: "play_by_play",
      filter:
        "season_type=REG, down 1-2, |score_diff|<=10, qtr<=4, exclude H2<=5min, exclude qb_kneel/qb_spike",
      sample_size: derived.sample.neutral_attempts,
    };
    attribution.scheme_pace = {
      ...baseDerived,
      input: "play_by_play",
      method: "offensive plays (pass+rush attempts) per regulation game",
      sample_plays: derived.sample.regulation_offensive_plays,
      sample_games: derived.sample.regulation_games,
    };
    attribution.personnel_12_rate = {
      ...baseDerived,
      input: "pbp_participation",
      method:
        "share of offensive plays with offense_personnel=1RB/2TE/2WR",
      sample_plays: derived.sample.participation_offensive_plays,
    };
  }

  return {
    team,
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
    source_attribution: attribution,
    last_updated: now,
    updated_by: UPDATED_BY,
  };
}

function printRow(r: TeamSignalRow): void {
  const fields = [
    `scheme=${r.scheme_tag ?? "(null)"}`,
    `hc=${r.hc_id ?? "(null)"}`,
    `hc_tenure=${r.hc_tenure_yrs ?? "(null)"}y`,
    `hc_first=${r.hc_first_time_flag}`,
    `hc_bg=${r.hc_background_tag ?? "(null)"}`,
    `oc=${r.oc_id ?? "(null)"}`,
    `oc_tenure=${r.oc_tenure_yrs ?? "(null)"}y`,
    `oc_first_year=${r.oc_first_year_with_team_flag}`,
    `novelty=${r.staff_novelty_composite}`,
    `pass=${r.pass_rate_neutral?.toFixed(3) ?? "null"}`,
    `pace=${r.scheme_pace?.toFixed(1) ?? "null"}`,
    `p12=${r.personnel_12_rate?.toFixed(3) ?? "null"}`,
  ];
  console.log(`  ${r.team.padEnd(4)} ${fields.join(" ")}`);
}

async function main(): Promise<void> {
  const { write, extracted, derived } = parseArgs(process.argv.slice(2));
  console.log(
    `[ingest-team] mode=${write ? "WRITE (production Supabase)" : "DRY-RUN"} extracted=${extracted} derived=${derived}`,
  );

  const ext = loadExtracted(extracted);
  const der = loadDerived(derived);
  console.log(
    `[ingest-team] loaded extracted: ${Object.keys(ext.teams).length} / 32 teams (prediction_year=${ext.prediction_year})`,
  );
  console.log(
    `[ingest-team] loaded derived:   ${der.metrics.length} / 32 teams (season=${der.season})`,
  );

  const derivedByTeam = new Map<string, DerivedTeam>(
    der.metrics.map((m) => [m.team, m]),
  );

  const rows: TeamSignalRow[] = [];
  let missingExtracted: string[] = [];
  let missingDerived: string[] = [];
  for (const team of NFL_TEAMS) {
    const extTeam = ext.teams[team] ?? null;
    const derTeam = derivedByTeam.get(team) ?? null;
    if (!extTeam) missingExtracted.push(team);
    if (!derTeam) missingDerived.push(team);
    rows.push(
      buildRow({
        team,
        extracted: extTeam,
        derived: derTeam,
        extractedAt: extTeam?.extracted_at ?? "",
        derivedSeason: der.season,
      }),
    );
  }

  if (missingExtracted.length) {
    console.warn(
      `[ingest-team] WARNING: extracted JSON missing ${missingExtracted.length} teams: ${missingExtracted.join(", ")}`,
    );
  }
  if (missingDerived.length) {
    console.warn(
      `[ingest-team] WARNING: derived JSON missing ${missingDerived.length} teams: ${missingDerived.join(", ")}`,
    );
  }

  console.log(`\n[ingest-team] rows (${rows.length}):`);
  for (const r of rows) printRow(r);

  // Quick coverage summary
  const have = (k: keyof TeamSignalRow) =>
    rows.filter((r) => r[k] != null && r[k] !== "").length;
  console.log(
    `\n[ingest-team] coverage: scheme=${have("scheme_tag")}/32 hc=${have("hc_id")}/32 oc=${have("oc_id")}/32 pass=${have("pass_rate_neutral")}/32 pace=${have("scheme_pace")}/32 p12=${have("personnel_12_rate")}/32`,
  );

  if (!write) {
    console.log("\n[ingest-team] DRY-RUN complete. No writes performed.");
    console.log("Re-run with --write to upsert to production team_signals.");
    return;
  }

  if (missingExtracted.length || missingDerived.length) {
    throw new Error(
      `Refusing to write with incomplete inputs: missingExtracted=${missingExtracted.length} missingDerived=${missingDerived.length}. Fix inputs first.`,
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Missing Supabase env vars; aborting --write");

  const sb = createClient(url, key);
  console.log(`\n[ingest-team] writing ${rows.length} rows to team_signals...`);
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await sb
      .from("team_signals")
      .upsert(chunk, { onConflict: "team" });
    if (error) {
      console.error(`[ingest-team] upsert error:`, error.message);
      process.exit(1);
    }
  }
  console.log(`[ingest-team] DONE. ${rows.length} rows upserted.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[ingest-team] fatal:", err);
    process.exit(1);
  });
