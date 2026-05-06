/**
 * Phase 2 backtest scorer v0. Per VALIDATION_PLAN section 5 (Test A
 * spec) and section 7 (public scoreboard), this is the script that
 * produces our first publishable metric: how well does a preseason
 * ranking source predict end-of-season fantasy outcomes.
 *
 * Inputs (CLI):
 *   --source        e.g. fantasypros_ecr / ktc / fantasypros_adp
 *   --season        2022 / 2023 / 2024
 *   --format        1qb / sf
 *   --top           top-N to score (default 100)
 *   --scoring       ppr / half_ppr / std (default ppr)
 *   --write         persist to backtest_runs (default false)
 *
 * Output:
 *   Console-printed scorecard plus optional row in backtest_runs.
 *
 * Metrics computed:
 *   - Spearman rank correlation (preseason rank vs realized PPR rank)
 *   - Top-N hit rate (overlap of predicted top-N and actual top-N)
 *   - Mean Absolute Error on rank
 *   - Per-position breakdown (position-level Spearman)
 *
 * Joins:
 *   historical_consensus_rankings ⨝ historical_outcomes on player_id
 *
 * For source=ktc the script reads from historical_market_values
 * instead, using overall_rank as the predicted rank.
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.json scripts/backtest-score.ts \
 *     --source fantasypros_ecr --season 2024 --format 1qb
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { resolvePlayers } from "../src/lib/players/cache";

type Args = {
  source: string;
  season: number;
  format: string;
  topN: number;
  scoring: "ppr" | "half_ppr" | "std";
  write: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  const m = new Map<string, string>();
  let write = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write") write = true;
    else if (a.startsWith("--") && i + 1 < argv.length) {
      m.set(a.slice(2), argv[i + 1]);
      i++;
    }
  }
  if (!m.get("source") || !m.get("season")) {
    throw new Error("--source and --season are required");
  }
  return {
    source: m.get("source")!,
    season: Number(m.get("season")!),
    format: m.get("format") ?? "1qb",
    topN: Number(m.get("top") ?? 100),
    scoring: (m.get("scoring") ?? "ppr") as Args["scoring"],
    write,
  };
}

type Prediction = {
  player_id: string;
  predicted_rank: number;
  position: string | null;
};

async function readKtcRanks(
  supa: ReturnType<typeof createClient>,
  season: number,
  format: string,
): Promise<Prediction[]> {
  // KTC stores per-snapshot. For the preseason proxy, take the
  // snapshot closest to Aug 15 of the prediction year.
  const target = `${season}-08-15`;
  const { data: snapDates } = await supa
    .from("historical_market_values")
    .select("snapshot_date")
    .eq("source", "ktc")
    .eq("format", format)
    .gte("snapshot_date", `${season}-07-01`)
    .lte("snapshot_date", `${season}-09-30`);
  if (!snapDates || snapDates.length === 0) {
    console.warn(
      `[score] no KTC snapshots in ${season} preseason window; trying year-wide`,
    );
    const { data: yearWide } = await supa
      .from("historical_market_values")
      .select("snapshot_date")
      .eq("source", "ktc")
      .eq("format", format)
      .gte("snapshot_date", `${season}-01-01`)
      .lte("snapshot_date", `${season}-12-31`);
    if (!yearWide || yearWide.length === 0) return [];
    snapDates.push(...yearWide);
  }
  // Pick the snapshot date closest to the target.
  const dates = Array.from(new Set(snapDates.map((r) => r.snapshot_date as string)));
  const targetTs = Date.parse(target);
  dates.sort(
    (a, b) =>
      Math.abs(Date.parse(a) - targetTs) -
      Math.abs(Date.parse(b) - targetTs),
  );
  const chosen = dates[0];
  console.log(`[score] KTC chosen snapshot for ${season}: ${chosen}`);

  const { data } = await supa
    .from("historical_market_values")
    .select("player_id, overall_rank, position")
    .eq("source", "ktc")
    .eq("format", format)
    .eq("snapshot_date", chosen);
  return (data ?? [])
    .filter((r) => r.overall_rank != null)
    .map((r) => ({
      player_id: r.player_id as string,
      predicted_rank: r.overall_rank as number,
      position: (r.position as string) ?? null,
    }));
}

async function readConsensusRanks(
  supa: ReturnType<typeof createClient>,
  source: string,
  season: number,
  format: string,
): Promise<Prediction[]> {
  // Consensus rankings stored at a single snapshot per (source, season,
  // format). Aug 15 for historical, today for current.
  const target = season >= 2026 ? "2026-05-05" : `${season}-08-15`;
  const { data } = await supa
    .from("historical_consensus_rankings")
    .select("player_id, rank, position")
    .eq("source", source)
    .eq("format", format)
    .eq("snapshot_date", target);
  return (data ?? []).map((r) => ({
    player_id: r.player_id as string,
    predicted_rank: r.rank as number,
    position: (r.position as string) ?? null,
  }));
}

type Outcome = {
  player_id: string;
  points: number;
};

async function readOutcomes(
  supa: ReturnType<typeof createClient>,
  season: number,
  scoring: "ppr" | "half_ppr" | "std",
): Promise<Outcome[]> {
  const col =
    scoring === "ppr"
      ? "ppr_points"
      : scoring === "half_ppr"
        ? "half_ppr_points"
        : "std_points";
  const { data } = await supa
    .from("historical_outcomes")
    .select(`player_id, ${col}`)
    .eq("season", season)
    .is("week", null);
  return (data ?? [])
    .map((r) => ({
      player_id: r.player_id as string,
      points: Number((r as Record<string, unknown>)[col] ?? 0),
    }))
    .filter((r) => Number.isFinite(r.points));
}

function spearman(
  ranks: Array<{ predicted: number; actual: number }>,
): number {
  // Standard Spearman: Pearson on ranks. Inputs are already ranks.
  const n = ranks.length;
  if (n < 2) return NaN;
  const meanP = ranks.reduce((s, r) => s + r.predicted, 0) / n;
  const meanA = ranks.reduce((s, r) => s + r.actual, 0) / n;
  let num = 0;
  let denomP = 0;
  let denomA = 0;
  for (const r of ranks) {
    const dp = r.predicted - meanP;
    const da = r.actual - meanA;
    num += dp * da;
    denomP += dp * dp;
    denomA += da * da;
  }
  return num / Math.sqrt(denomP * denomA);
}

function meanAbsRankErr(
  ranks: Array<{ predicted: number; actual: number }>,
): number {
  if (ranks.length === 0) return NaN;
  const sum = ranks.reduce((s, r) => s + Math.abs(r.predicted - r.actual), 0);
  return sum / ranks.length;
}

function topNHitRate(
  pairs: Array<{ predicted: number; actual: number }>,
  n: number,
): number {
  const predTop = new Set(
    pairs.filter((p) => p.predicted <= n).map((p) => p.predicted),
  );
  const actTop = new Set(
    pairs.filter((p) => p.actual <= n).map((p) => p.actual),
  );
  const overlap = pairs.filter(
    (p) => p.predicted <= n && p.actual <= n,
  ).length;
  const denom = Math.max(predTop.size, actTop.size, 1);
  return overlap / denom;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[score] source=${args.source} season=${args.season} format=${args.format} top=${args.topN} scoring=${args.scoring}`,
  );

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const preds: Prediction[] =
    args.source === "ktc"
      ? await readKtcRanks(supa, args.season, args.format)
      : await readConsensusRanks(supa, args.source, args.season, args.format);
  console.log(`[score] predictions loaded: ${preds.length}`);
  if (preds.length === 0) {
    console.error("[score] no predictions found; check args");
    process.exit(1);
  }

  const outcomes = await readOutcomes(supa, args.season, args.scoring);
  console.log(`[score] outcomes loaded: ${outcomes.length}`);
  const outcomeMap = new Map(outcomes.map((o) => [o.player_id, o.points]));

  // Build joined records: predicted rank vs actual rank (computed from
  // outcomes by sorting points descending).
  const outcomesSorted = [...outcomes].sort((a, b) => b.points - a.points);
  const actualRankMap = new Map<string, number>();
  outcomesSorted.forEach((o, i) => actualRankMap.set(o.player_id, i + 1));

  // Restrict to predicted top-N.
  const topPreds = preds
    .filter((p) => p.predicted_rank <= args.topN)
    .sort((a, b) => a.predicted_rank - b.predicted_rank);

  type Pair = {
    player_id: string;
    predicted: number;
    actual: number;
    points: number;
    position: string | null;
  };
  const pairs: Pair[] = [];
  let missingFromOutcomes = 0;
  for (const p of topPreds) {
    const actual = actualRankMap.get(p.player_id);
    if (actual == null) {
      missingFromOutcomes++;
      continue;
    }
    pairs.push({
      player_id: p.player_id,
      predicted: p.predicted_rank,
      actual,
      points: outcomeMap.get(p.player_id) ?? 0,
      position: p.position,
    });
  }
  console.log(
    `[score] joined pairs: ${pairs.length} (top-${args.topN}, ${missingFromOutcomes} predicted players had no outcome)`,
  );

  if (pairs.length < 2) {
    console.error("[score] not enough joined pairs to score");
    process.exit(1);
  }

  // Overall metrics
  const sp = spearman(pairs);
  const mar = meanAbsRankErr(pairs);
  const hit50 = topNHitRate(pairs, 50);
  const hit100 = topNHitRate(pairs, 100);

  console.log("");
  console.log("=== OVERALL ===");
  console.log(`Spearman rank correlation: ${sp.toFixed(4)}`);
  console.log(`Mean abs rank error:        ${mar.toFixed(2)}`);
  console.log(`Top-50 hit rate:            ${(hit50 * 100).toFixed(1)}%`);
  console.log(`Top-100 hit rate:           ${(hit100 * 100).toFixed(1)}%`);

  // Per-position breakdown
  const byPos = new Map<string, Pair[]>();
  for (const p of pairs) {
    const pos = p.position ?? "UNK";
    if (!byPos.has(pos)) byPos.set(pos, []);
    byPos.get(pos)!.push(p);
  }
  console.log("");
  console.log("=== PER POSITION ===");
  for (const [pos, ps] of [...byPos.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    if (ps.length < 5) continue;
    const sp2 = spearman(ps);
    const mar2 = meanAbsRankErr(ps);
    console.log(
      `  ${pos.padEnd(4)} n=${String(ps.length).padStart(3)}  spearman=${sp2.toFixed(3)}  MAR=${mar2.toFixed(1)}`,
    );
  }

  // Top-10 misses (largest rank errors)
  console.log("");
  console.log("=== TOP-10 LARGEST MISSES (predicted vs actual) ===");
  const sorted = [...pairs].sort(
    (a, b) => Math.abs(b.predicted - b.actual) - Math.abs(a.predicted - a.actual),
  );
  const top10 = sorted.slice(0, 10);
  const ids = top10.map((p) => p.player_id);
  const playerMap = await resolvePlayers(ids);
  for (const p of top10) {
    const sl = playerMap.get(p.player_id);
    const name =
      `${sl?.first_name ?? ""} ${sl?.last_name ?? ""}`.trim() ||
      sl?.full_name ||
      "(unresolved)";
    const dir = p.actual < p.predicted ? "OVERPERFORM" : "UNDERPERFORM";
    console.log(
      `  ${name.padEnd(28)} (${p.position ?? "?"}) predicted=${String(p.predicted).padStart(3)} actual=${String(p.actual).padStart(3)} [${dir}]`,
    );
  }

  if (args.write) {
    const runLabel = `phase2_v0_${args.source}_${args.format}_${args.season}`;
    const { error } = await supa.from("backtest_runs").insert({
      run_label: runLabel,
      prediction_year: args.season,
      model_version: `${args.source}@${args.format}`,
      loss_function: `spearman_rank_${args.scoring}`,
      rmse: null,
      mae: mar,
      band_coverage_pct: null,
      baseline_comparisons: {
        spearman: sp,
        top_50_hit_rate: hit50,
        top_100_hit_rate: hit100,
        n_pairs: pairs.length,
      },
      notes: `top=${args.topN} scoring=${args.scoring}`,
    });
    if (error) {
      console.error("[score] write error:", error.message);
    } else {
      console.log(`[score] wrote backtest_runs row label=${runLabel}`);
    }
  }
}

main().catch((err) => {
  console.error("[score] fatal:", err);
  process.exit(1);
});
