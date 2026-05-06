/**
 * Phase 2 backtest scorer v1: dynasty loss function.
 *
 * Per VALIDATION_PLAN section 8.2:
 *   L_dynasty = 0.6 × KTC_6mo_value_MAE + 0.4 × cumulative_3yr_PPR_RMSE
 *
 * v0 of this script implements the dynasty-correct version of the
 * single-season scorer in backtest-score.ts. Single-season PPR rank
 * is the wrong loss function for dynasty rankings (it punishes age-
 * conservative dynasty rankers for valuing 24-year-olds over
 * proven-but-aging RBs). This script scores against:
 *
 *   1. Cumulative 3-year PPR rank (or 2yr/1yr if data unavailable)
 *   2. KTC 6-month value drift (Aug -> Feb)
 *
 * Data availability per season:
 *   2022 predictions: 3-year cumulative (2022+2023+2024) + KTC 6mo drift
 *   2023 predictions: 2-year cumulative (2023+2024) + KTC 6mo drift
 *   2024 predictions: 1-year only (2024) + no KTC drift (no 2025 snaps)
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.json scripts/backtest-score-dynasty.ts \
 *     --source fantasypros_ecr --season 2022 --format 1qb [--write]
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
    write,
  };
}

type Prediction = {
  player_id: string;
  predicted_rank: number;
  position: string | null;
};

async function readPredictions(
  supa: ReturnType<typeof createClient>,
  source: string,
  season: number,
  format: string,
): Promise<Prediction[]> {
  if (source === "ktc") {
    const target = `${season}-08-15`;
    // Pull all rows in the preseason window, dedup dates client-side.
    // Supabase JS default 1000 limit would truncate so we ask for more.
    const { data: snapDates } = await supa
      .from("historical_market_values")
      .select("snapshot_date")
      .eq("source", "ktc")
      .eq("format", format)
      .gte("snapshot_date", `${season}-06-01`)
      .lte("snapshot_date", `${season}-10-31`)
      .limit(50000);
    if (!snapDates || snapDates.length === 0) {
      console.warn(`[score-d] no KTC snapshots in ${season} preseason window`);
      return [];
    }
    const dates = Array.from(new Set(snapDates.map((r) => r.snapshot_date as string)));
    const targetTs = Date.parse(target);
    dates.sort(
      (a, b) => Math.abs(Date.parse(a) - targetTs) - Math.abs(Date.parse(b) - targetTs),
    );
    const chosen = dates[0];
    console.log(
      `[score-d] KTC chosen snapshot for ${season}: ${chosen} (of ${dates.length} preseason snapshots)`,
    );
    const { data } = await supa
      .from("historical_market_values")
      .select("player_id, overall_rank, position")
      .eq("source", "ktc")
      .eq("format", format)
      .eq("snapshot_date", chosen)
      .limit(50000);
    return (data ?? [])
      .filter((r) => r.overall_rank != null)
      .map((r) => ({
        player_id: r.player_id as string,
        predicted_rank: r.overall_rank as number,
        position: (r.position as string) ?? null,
      }));
  }
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

async function readCumulativePpr(
  supa: ReturnType<typeof createClient>,
  startSeason: number,
  yearsAvailable: number,
): Promise<Map<string, { points: number; years: number }>> {
  const out = new Map<string, { points: number; years: number }>();
  for (let s = startSeason; s < startSeason + yearsAvailable; s++) {
    const { data } = await supa
      .from("historical_outcomes")
      .select("player_id, ppr_points")
      .eq("season", s)
      .is("week", null);
    for (const r of data ?? []) {
      const id = r.player_id as string;
      const pts = Number(r.ppr_points ?? 0);
      if (!Number.isFinite(pts)) continue;
      const cur = out.get(id) ?? { points: 0, years: 0 };
      cur.points += pts;
      cur.years += 1;
      out.set(id, cur);
    }
  }
  return out;
}

async function readKtcValueDrift(
  supa: ReturnType<typeof createClient>,
  season: number,
  format: string,
): Promise<Map<string, number> | null> {
  // 6-month drift: Aug-15 of season vs Feb-15 of season+1.
  const startTarget = `${season}-08-15`;
  const endTarget = `${season + 1}-02-15`;
  const startSnap = await pickClosestKtcSnapshot(supa, format, startTarget);
  const endSnap = await pickClosestKtcSnapshot(supa, format, endTarget);
  if (!startSnap || !endSnap) return null;
  console.log(`[score-d] KTC drift snapshots: ${startSnap} -> ${endSnap}`);
  const startVals = await readKtcValuesAt(supa, startSnap, format);
  const endVals = await readKtcValuesAt(supa, endSnap, format);
  const out = new Map<string, number>();
  for (const [id, vStart] of startVals.entries()) {
    const vEnd = endVals.get(id);
    if (vEnd == null) continue;
    out.set(id, vEnd - vStart);
  }
  return out;
}

async function pickClosestKtcSnapshot(
  supa: ReturnType<typeof createClient>,
  format: string,
  target: string,
): Promise<string | null> {
  const targetTs = Date.parse(target);
  const yearStart = `${Number(target.slice(0, 4)) - 1}-01-01`;
  const yearEnd = `${Number(target.slice(0, 4)) + 1}-12-31`;
  const { data } = await supa
    .from("historical_market_values")
    .select("snapshot_date")
    .eq("source", "ktc")
    .eq("format", format)
    .gte("snapshot_date", yearStart)
    .lte("snapshot_date", yearEnd)
    .limit(50000);
  if (!data || data.length === 0) return null;
  const dates = Array.from(new Set(data.map((r) => r.snapshot_date as string)));
  dates.sort(
    (a, b) => Math.abs(Date.parse(a) - targetTs) - Math.abs(Date.parse(b) - targetTs),
  );
  // Reject if closest snapshot is more than 90 days off target.
  if (Math.abs(Date.parse(dates[0]) - targetTs) > 90 * 24 * 3600 * 1000) {
    return null;
  }
  return dates[0];
}

async function readKtcValuesAt(
  supa: ReturnType<typeof createClient>,
  snapshotDate: string,
  format: string,
): Promise<Map<string, number>> {
  const { data } = await supa
    .from("historical_market_values")
    .select("player_id, value")
    .eq("source", "ktc")
    .eq("format", format)
    .eq("snapshot_date", snapshotDate)
    .limit(50000);
  const out = new Map<string, number>();
  for (const r of data ?? []) {
    out.set(r.player_id as string, Number(r.value));
  }
  return out;
}

function spearman(
  pairs: Array<{ predicted: number; actual: number }>,
): number {
  const n = pairs.length;
  if (n < 2) return NaN;
  const meanP = pairs.reduce((s, r) => s + r.predicted, 0) / n;
  const meanA = pairs.reduce((s, r) => s + r.actual, 0) / n;
  let num = 0;
  let denomP = 0;
  let denomA = 0;
  for (const r of pairs) {
    const dp = r.predicted - meanP;
    const da = r.actual - meanA;
    num += dp * da;
    denomP += dp * dp;
    denomA += da * da;
  }
  return num / Math.sqrt(denomP * denomA);
}

function meanAbsRankErr(
  pairs: Array<{ predicted: number; actual: number }>,
): number {
  if (pairs.length === 0) return NaN;
  return (
    pairs.reduce((s, r) => s + Math.abs(r.predicted - r.actual), 0) /
    pairs.length
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[score-d] source=${args.source} season=${args.season} format=${args.format} top=${args.topN}`,
  );

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Decide cumulative window: 3yr if data covers it, otherwise shrink.
  // We have outcomes for 2022/2023/2024.
  const LAST_OUTCOME_YEAR = 2024;
  const yearsPossible = Math.max(0, LAST_OUTCOME_YEAR - args.season + 1);
  const yearsAvailable = Math.min(3, yearsPossible);
  if (yearsAvailable === 0) {
    console.error(
      `[score-d] no outcomes for season ${args.season}; need season <= ${LAST_OUTCOME_YEAR}`,
    );
    process.exit(1);
  }
  console.log(`[score-d] cumulative window: ${yearsAvailable}yr`);

  const preds = await readPredictions(supa, args.source, args.season, args.format);
  console.log(`[score-d] predictions loaded: ${preds.length}`);
  if (preds.length === 0) {
    console.error("[score-d] no predictions found; check args");
    process.exit(1);
  }

  const cumulative = await readCumulativePpr(supa, args.season, yearsAvailable);
  console.log(`[score-d] cumulative outcomes: ${cumulative.size} players`);

  // Rank by cumulative PPR descending. Players who only played 1 of N
  // years still get included (their cumulative is just lower).
  const sortedActual = [...cumulative.entries()].sort(
    (a, b) => b[1].points - a[1].points,
  );
  const actualRankMap = new Map<string, number>();
  sortedActual.forEach(([id], i) => actualRankMap.set(id, i + 1));

  const valueDrift = await readKtcValueDrift(supa, args.season, args.format);
  if (valueDrift) {
    console.log(`[score-d] KTC drift: ${valueDrift.size} players matched`);
  } else {
    console.log("[score-d] KTC drift: not available for this season");
  }

  // Restrict to predicted top-N and join.
  const topPreds = preds
    .filter((p) => p.predicted_rank <= args.topN)
    .sort((a, b) => a.predicted_rank - b.predicted_rank);

  type Pair = {
    player_id: string;
    predicted: number;
    actual_cumulative_rank: number;
    cumulative_points: number;
    years_played: number;
    value_drift: number | null;
    position: string | null;
  };
  const pairs: Pair[] = [];
  let missing = 0;
  for (const p of topPreds) {
    const cum = cumulative.get(p.player_id);
    const aRank = actualRankMap.get(p.player_id);
    if (cum == null || aRank == null) {
      missing++;
      continue;
    }
    pairs.push({
      player_id: p.player_id,
      predicted: p.predicted_rank,
      actual_cumulative_rank: aRank,
      cumulative_points: cum.points,
      years_played: cum.years,
      value_drift: valueDrift?.get(p.player_id) ?? null,
      position: p.position,
    });
  }
  console.log(
    `[score-d] joined: ${pairs.length} of top-${args.topN} predicted (${missing} had no outcome data)`,
  );
  if (pairs.length < 2) {
    console.error("[score-d] not enough joined pairs");
    process.exit(1);
  }

  // Metric 1: Spearman on (predicted, actual_cumulative_rank)
  const sp = spearman(
    pairs.map((p) => ({ predicted: p.predicted, actual: p.actual_cumulative_rank })),
  );
  const mar = meanAbsRankErr(
    pairs.map((p) => ({ predicted: p.predicted, actual: p.actual_cumulative_rank })),
  );

  // Metric 2: KTC value drift summary across top-N predicted
  const driftValues = pairs
    .map((p) => p.value_drift)
    .filter((v): v is number => v != null);
  const meanDrift =
    driftValues.length > 0
      ? driftValues.reduce((s, v) => s + v, 0) / driftValues.length
      : NaN;
  const meanAbsDrift =
    driftValues.length > 0
      ? driftValues.reduce((s, v) => s + Math.abs(v), 0) / driftValues.length
      : NaN;
  // Value-retention rate: % of players who lost less than 20% of KTC value.
  // (Negative drift greater than 0.2 * starting value would be a >20% drop.
  // Without starting values plumbed through, approximate via drift > -2000
  // as "retained reasonable value" since KTC scale tops out near 9999.)
  const retainedCount = driftValues.filter((d) => d > -2000).length;
  const retainedPct =
    driftValues.length > 0 ? (retainedCount / driftValues.length) * 100 : NaN;

  console.log("");
  console.log(`=== DYNASTY LOSS v0 (${yearsAvailable}-year cumulative) ===`);
  console.log(`Spearman (predicted vs ${yearsAvailable}yr cumulative rank): ${sp.toFixed(4)}`);
  console.log(`MAR (rank): ${mar.toFixed(2)}`);
  if (driftValues.length > 0) {
    console.log("");
    console.log("=== KTC 6-MONTH VALUE DRIFT (Aug -> Feb) ===");
    console.log(`Mean drift:        ${meanDrift.toFixed(0)} (positive = value gained)`);
    console.log(`Mean abs drift:    ${meanAbsDrift.toFixed(0)}`);
    console.log(
      `Value retention:   ${retainedPct.toFixed(1)}% (${retainedCount}/${driftValues.length} held within ~2k value swing)`,
    );
  }

  // Largest underperformers vs cumulative
  console.log("");
  console.log("=== TOP-10 LARGEST CUMULATIVE-RANK MISSES ===");
  const sorted = [...pairs].sort(
    (a, b) =>
      Math.abs(b.predicted - b.actual_cumulative_rank) -
      Math.abs(a.predicted - a.actual_cumulative_rank),
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
    const dir =
      p.actual_cumulative_rank < p.predicted ? "OVERPERFORM" : "UNDERPERFORM";
    console.log(
      `  ${name.padEnd(28)} (${p.position ?? "?"}) pred=${String(p.predicted).padStart(3)} cum_rank=${String(p.actual_cumulative_rank).padStart(3)} cum_pts=${p.cumulative_points.toFixed(0).padStart(4)} years=${p.years_played} [${dir}]`,
    );
  }

  if (args.write) {
    const runLabel = `phase2_v1_dyn_${args.source}_${args.format}_${args.season}`;
    const { error } = await supa.from("backtest_runs").insert({
      run_label: runLabel,
      prediction_year: args.season,
      model_version: `${args.source}@${args.format}`,
      loss_function: `dynasty_v0_${yearsAvailable}yr_cumulative`,
      rmse: null,
      mae: mar,
      band_coverage_pct: null,
      baseline_comparisons: {
        spearman_cumulative: sp,
        years_in_window: yearsAvailable,
        mean_ktc_drift: Number.isFinite(meanDrift) ? meanDrift : null,
        value_retention_pct: Number.isFinite(retainedPct) ? retainedPct : null,
        n_pairs: pairs.length,
        n_drift_pairs: driftValues.length,
      },
      notes: `top=${args.topN} cumulative=${yearsAvailable}yr`,
    });
    if (error) {
      console.error("[score-d] write error:", error.message);
    } else {
      console.log(`[score-d] wrote backtest_runs row label=${runLabel}`);
    }
  }
}

main().catch((err) => {
  console.error("[score-d] fatal:", err);
  process.exit(1);
});
