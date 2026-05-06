/**
 * Run the Dynasty General evaluation engine for historical vintages.
 * Per VALIDATION_PLAN section 4 (vintaging) and section 5 (Test A
 * spec), this script produces our row on the public scoreboard:
 *
 *   For each (season, format):
 *     1. Read historical KTC values for that snapshot
 *     2. Compute each player's age at the time (vintage-correct)
 *     3. Run evaluate() with ktc_value + position + age (no signals
 *        in v0; player and team contexts are null)
 *     4. Sort by point_estimate descending = engine ranking
 *     5. Insert into historical_consensus_rankings as
 *        source='dynasty_general_v0'
 *
 * After running, score with:
 *   npx tsx scripts/backtest-score-dynasty.ts \
 *     --source dynasty_general_v0 --season 2022 --format 1qb
 *
 * v0 limitations (called out in MODEL_CARD validation section):
 * - No signal codes loaded yet (Track A pending), so player and team
 *   contexts are null. Rubrics fall back to KTC-prior + age curves.
 *   Treat v0 as "engine without signals."
 * - Historical age computed as current_age - (current_year - season).
 *   Off by up to ~1 year; close enough for rubric age-curve binning.
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.json scripts/run-engine-historical.ts \
 *     --season 2022 --format 1qb [--top 300] [--dry-run]
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { evaluate } from "../src/lib/engine/evaluation";
import type { EvaluationContext } from "../src/lib/engine/evaluation/types";
import type { PlayerSignalsRow } from "../src/lib/signals/schema";
import { __dumpAllPlayers } from "../src/lib/players/cache";

const CURRENT_YEAR = 2026;
const ENGINE_VERSION_NOSIGNALS = "dynasty_general_v0_nosignals";
const ENGINE_VERSION_WITHSIGNALS = "dynasty_general_v0_signals";

type Args = {
  season: number;
  format: "1qb" | "sf";
  topN: number;
  dryRun: boolean;
  withSignals: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  const m = new Map<string, string>();
  let dryRun = false;
  let withSignals = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--with-signals") withSignals = true;
    else if (a.startsWith("--") && i + 1 < argv.length) {
      m.set(a.slice(2), argv[i + 1]);
      i++;
    }
  }
  if (!m.get("season")) {
    throw new Error("--season is required");
  }
  return {
    season: Number(m.get("season")!),
    format: (m.get("format") ?? "1qb") as "1qb" | "sf",
    topN: Number(m.get("top") ?? 300),
    dryRun,
    withSignals,
  };
}

type KtcRow = {
  player_id: string;
  value: number;
  overall_rank: number;
  position: string | null;
  raw_attributes: Record<string, unknown> | null;
};

async function pickKtcSnapshot(
  supa: ReturnType<typeof createClient>,
  season: number,
  format: string,
): Promise<string | null> {
  const target = `${season}-08-15`;
  const targetTs = Date.parse(target);
  const { data } = await supa
    .from("historical_market_values")
    .select("snapshot_date")
    .eq("source", "ktc")
    .eq("format", format)
    .gte("snapshot_date", `${season}-06-01`)
    .lte("snapshot_date", `${season}-10-31`)
    .limit(50000);
  if (!data || data.length === 0) return null;
  const dates = Array.from(new Set(data.map((r) => r.snapshot_date as string)));
  dates.sort(
    (a, b) => Math.abs(Date.parse(a) - targetTs) - Math.abs(Date.parse(b) - targetTs),
  );
  return dates[0];
}

async function readKtcAt(
  supa: ReturnType<typeof createClient>,
  format: string,
  snapshotDate: string,
  topN: number,
): Promise<KtcRow[]> {
  const { data } = await supa
    .from("historical_market_values")
    .select("player_id, value, overall_rank, position, raw_attributes")
    .eq("source", "ktc")
    .eq("format", format)
    .eq("snapshot_date", snapshotDate)
    .order("overall_rank", { ascending: true })
    .limit(topN);
  return (data ?? []).map((r) => ({
    player_id: r.player_id as string,
    value: Number(r.value),
    overall_rank: r.overall_rank as number,
    position: (r.position as string) ?? null,
    raw_attributes:
      (r.raw_attributes as Record<string, unknown> | null) ?? null,
  }));
}

async function buildSleeperAgeMap(): Promise<Map<string, number>> {
  // Returns Sleeper player_id -> CURRENT age. Vintage age is computed
  // by subtracting years_to_vintage at call site.
  const all = await __dumpAllPlayers();
  const out = new Map<string, number>();
  for (const p of all) {
    if (p.age != null && Number.isFinite(p.age)) {
      out.set(p.player_id, p.age);
    }
  }
  return out;
}

type HistoricalSignalRow = {
  player_id: string;
  signal_name: string;
  signal_value: { value: unknown } | null;
};

async function buildSignalsMap(
  supa: ReturnType<typeof createClient>,
  predictionYear: number,
): Promise<Map<string, Partial<PlayerSignalsRow>>> {
  // Returns player_id -> partial PlayerSignalsRow assembled from the
  // historical_signal_codes pivot.
  const { data } = await supa
    .from("historical_signal_codes")
    .select("player_id, signal_name, signal_value")
    .eq("prediction_year", predictionYear)
    .limit(50000);
  const out = new Map<string, Partial<PlayerSignalsRow>>();
  for (const row of (data ?? []) as HistoricalSignalRow[]) {
    if (!row.player_id) continue;
    const cur = out.get(row.player_id) ?? {};
    const value = row.signal_value?.value;
    switch (row.signal_name) {
      case "rb_role_tier":
        cur.rb_role_tier = value as PlayerSignalsRow["rb_role_tier"];
        break;
      case "rb_traded_offseason_flag":
        cur.rb_traded_offseason_flag = value as boolean | null;
        break;
      case "rb_role_at_new_team_projected":
        cur.rb_role_at_new_team_projected =
          value as PlayerSignalsRow["rb_role_at_new_team_projected"];
        break;
      case "compounding_news_count":
        cur.compounding_news_count = Number(value) || 0;
        break;
      case "rb_passdown_share_prior_year":
        cur.rb_passdown_share_prior_year =
          value == null ? null : Number(value);
        break;
      case "contract_year_flag":
        cur.contract_year_flag = value as boolean | null;
        break;
      case "recent_extension_flag":
        cur.recent_extension_flag = value as boolean | null;
        break;
      case "contract_years_remaining":
        cur.contract_years_remaining =
          value == null ? null : Number(value);
        break;
    }
    out.set(row.player_id, cur);
  }
  return out;
}

type EngineRanking = {
  player_id: string;
  point_estimate: number;
  position: string | null;
  ktc_value: number;
  vintage_age: number | null;
};

function runEngineForSnapshot(
  rows: KtcRow[],
  ageMap: Map<string, number>,
  season: number,
  signalsMap: Map<string, Partial<PlayerSignalsRow>> | null,
): EngineRanking[] {
  const yearsBack = CURRENT_YEAR - season;
  const out: EngineRanking[] = [];
  let signalsHits = 0;
  for (const row of rows) {
    const currentAge = ageMap.get(row.player_id) ?? null;
    const vintageAge = currentAge != null ? currentAge - yearsBack : null;
    // Skip clearly-invalid ages (negative or absurd).
    if (vintageAge != null && (vintageAge < 19 || vintageAge > 45)) {
      continue;
    }
    const ktcAge =
      row.raw_attributes && typeof row.raw_attributes.age === "number"
        ? Number(row.raw_attributes.age)
        : null;
    // Prefer KTC-recorded age (it was current at the time of the
    // snapshot, so it's vintage-correct without subtraction).
    const finalAge = ktcAge != null ? ktcAge : vintageAge;
    // Build player signals row from historical_signal_codes if available.
    const sigPartial = signalsMap?.get(row.player_id);
    const playerRow: PlayerSignalsRow | null = sigPartial
      ? ({
          player_id: row.player_id,
          position: row.position,
          team: null,
          age: finalAge,
          rb_role_tier: sigPartial.rb_role_tier ?? null,
          rb_traded_offseason_flag:
            sigPartial.rb_traded_offseason_flag ?? null,
          rb_role_at_new_team_projected:
            sigPartial.rb_role_at_new_team_projected ?? null,
          rb_passdown_share_prior_year:
            sigPartial.rb_passdown_share_prior_year ?? null,
          compounding_news_count: sigPartial.compounding_news_count ?? 0,
          contract_years_remaining:
            sigPartial.contract_years_remaining ?? null,
          recent_extension_flag: sigPartial.recent_extension_flag ?? null,
          contract_year_flag: sigPartial.contract_year_flag ?? null,
          weight_lb: null,
          height_in: null,
          last_updated: new Date().toISOString(),
          updated_by: "agent:historical-signal-extractor",
        } as PlayerSignalsRow)
      : null;
    if (sigPartial) signalsHits++;
    const ctx: EvaluationContext = {
      player: playerRow,
      team: null,
      ktc_value: row.value,
      adp: null,
      search_rank: null,
      position: row.position,
      age: finalAge,
      is_rookie: false,
      years_exp: null,
    };
    const result = evaluate(ctx);
    out.push({
      player_id: row.player_id,
      point_estimate: result.point_estimate,
      position: row.position,
      ktc_value: row.value,
      vintage_age: finalAge,
    });
  }
  // Sort engine output descending by point_estimate to derive rank.
  out.sort((a, b) => b.point_estimate - a.point_estimate);
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[engine] season=${args.season} format=${args.format} top=${args.topN} ${args.dryRun ? "(dry-run)" : ""}`,
  );

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const snapshotDate = await pickKtcSnapshot(supa, args.season, args.format);
  if (!snapshotDate) {
    throw new Error(`no KTC snapshot found for ${args.season} ${args.format}`);
  }
  console.log(`[engine] using KTC snapshot ${snapshotDate}`);

  const ktcRows = await readKtcAt(supa, args.format, snapshotDate, args.topN);
  console.log(`[engine] ${ktcRows.length} KTC rows loaded`);

  console.log("[engine] building Sleeper age map...");
  const ageMap = await buildSleeperAgeMap();
  console.log(`[engine] age map: ${ageMap.size} players`);

  let signalsMap: Map<string, Partial<PlayerSignalsRow>> | null = null;
  if (args.withSignals) {
    console.log("[engine] loading historical signal codes...");
    signalsMap = await buildSignalsMap(supa, args.season);
    console.log(`[engine] signals map: ${signalsMap.size} players coded`);
  }

  const ranked = runEngineForSnapshot(
    ktcRows,
    ageMap,
    args.season,
    signalsMap,
  );
  console.log(`[engine] engine ranked ${ranked.length} players`);

  // Print top-15 for spot check
  console.log("");
  console.log("=== Engine top-15 ===");
  for (let i = 0; i < Math.min(15, ranked.length); i++) {
    const r = ranked[i];
    console.log(
      `  ${String(i + 1).padStart(3)}: ${r.player_id.padEnd(7)}  pos=${(r.position ?? "?").padEnd(3)}  age=${r.vintage_age ?? "?"}  ktc=${r.ktc_value}  score=${r.point_estimate.toFixed(2)}`,
    );
  }

  if (args.dryRun) {
    console.log("[engine] dry-run, no insert");
    return;
  }

  const engineVersion = args.withSignals
    ? ENGINE_VERSION_WITHSIGNALS
    : ENGINE_VERSION_NOSIGNALS;
  // Wipe existing engine rows for this (source, season, format) before
  // re-inserting so we don't pile up duplicates across iterations.
  const target =
    args.season >= CURRENT_YEAR ? `${CURRENT_YEAR}-05-05` : `${args.season}-08-15`;
  const { count: deleted } = await supa
    .from("historical_consensus_rankings")
    .delete({ count: "exact" })
    .eq("source", engineVersion)
    .eq("format", args.format)
    .eq("snapshot_date", target);
  console.log(`[engine] deleted ${deleted ?? 0} existing rows for source=${engineVersion} ${target}`);

  // Insert engine rankings.
  const insertRows = ranked.map((r, i) => ({
    player_id: r.player_id,
    source: engineVersion,
    snapshot_date: target,
    format: args.format,
    rank: i + 1,
    position: r.position,
    position_rank: null,
    raw_attributes: {
      point_estimate: r.point_estimate,
      ktc_value: r.ktc_value,
      vintage_age: r.vintage_age,
      ktc_snapshot_date: snapshotDate,
      engine_version: engineVersion,
    },
  }));
  const CHUNK = 500;
  for (let i = 0; i < insertRows.length; i += CHUNK) {
    const chunk = insertRows.slice(i, i + CHUNK);
    const { error } = await supa
      .from("historical_consensus_rankings")
      .insert(chunk);
    if (error) {
      console.error(`[engine] insert chunk ${i / CHUNK} error:`, error.message);
    }
  }
  console.log(`[engine] inserted ${insertRows.length} rows`);
}

main().catch((err) => {
  console.error("[engine] fatal:", err);
  process.exit(1);
});
