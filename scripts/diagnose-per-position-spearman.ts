/**
 * Diagnostic #2: Per-position Spearman breakdown.
 *
 * The v1 backtest scoreboard shows DG v1 winning the AVERAGE across
 * 2022-2024 but losing per-year on 2022 (3yr) and 2023 (2yr) to FP
 * ECR/ADP. Hypothesis: the long-horizon gap is concentrated in
 * non-RB positions (WR / QB / TE), because DG v1 only has hand-coded
 * signals for RBs. Other positions run on rubric + age curve only.
 *
 * Method: for each prediction year, pull DG v1 + FP ECR + FP ADP
 * top-100 predictions, join to actual cumulative outcome rank,
 * compute Spearman SEPARATELY per position. If RB is where DG wins
 * and WR/QB/TE is where DG loses to FP, the diagnosis confirms
 * extending hand-coded signal coverage to non-RB positions is the
 * highest-leverage v2 work.
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.json scripts/diagnose-per-position-spearman.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { resolvePlayers } from "../src/lib/players/cache";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

type Position = "QB" | "RB" | "WR" | "TE";
const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

type Prediction = { player_id: string; rank: number };

async function fetchPredictions(
  source: string,
  year: number,
): Promise<Prediction[]> {
  const { data, error } = await supabase
    .from("historical_consensus_rankings")
    .select("player_id, rank, format")
    .eq("source", source)
    .gte("snapshot_date", `${year}-07-01`)
    .lte("snapshot_date", `${year}-09-30`)
    .eq("format", "1qb")
    .order("rank", { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) {
    const { data: fb } = await supabase
      .from("historical_consensus_rankings")
      .select("player_id, rank")
      .eq("source", source)
      .gte("snapshot_date", `${year}-07-01`)
      .lte("snapshot_date", `${year}-09-30`)
      .order("rank", { ascending: true });
    return (fb ?? []).map((r) => ({ player_id: r.player_id, rank: r.rank }));
  }
  return data.map((r) => ({ player_id: r.player_id, rank: r.rank }));
}

async function fetchCumulativeOutcomes(
  startYear: number,
  endYear: number,
): Promise<Map<string, number>> {
  // Sum ppr_points across [startYear, endYear] inclusive.
  const totals = new Map<string, number>();
  for (let y = startYear; y <= endYear; y++) {
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("historical_outcomes")
        .select("player_id, week, ppr_points")
        .eq("season", y)
        .range(from, from + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      const seasonTotals = new Map<string, number>();
      for (const row of data) {
        const ppr = Number(row.ppr_points ?? 0);
        if (row.week === null) {
          seasonTotals.set(row.player_id, ppr);
        } else if (!seasonTotals.has(row.player_id)) {
          // accumulate per-week if no season-total row exists
          const prev = totals.get(row.player_id) ?? 0;
          totals.set(row.player_id, prev + ppr);
        }
      }
      // commit season-totals (overrides per-week if both exist for same player)
      for (const [pid, pts] of seasonTotals.entries()) {
        const prev = totals.get(pid) ?? 0;
        totals.set(pid, prev + pts);
      }
      if (data.length < 1000) break;
      from += 1000;
    }
  }
  return totals;
}

function spearman(
  pairs: Array<{ predicted: number; actual: number }>,
): { rho: number; n: number } {
  const n = pairs.length;
  if (n < 3) return { rho: NaN, n };
  // Convert to ranks within this sample (predicted is already a rank;
  // actual is a "lower = better" rank).
  const sumD2 = pairs.reduce((s, p) => s + (p.predicted - p.actual) ** 2, 0);
  // Spearman = 1 - 6 * sum(d^2) / (n * (n^2 - 1))
  const rho = 1 - (6 * sumD2) / (n * (n * n - 1));
  return { rho, n };
}

async function fetchDGv1Predictions(year: number): Promise<Prediction[]> {
  // DG v1 with signals stored under source 'dynasty_general_v0_signals'
  // (legacy name; the run is signals-loaded). Take the most recent run.
  const { data, error } = await supabase
    .from("historical_consensus_rankings")
    .select("player_id, rank, snapshot_date")
    .eq("source", "dynasty_general_v0_signals")
    .gte("snapshot_date", `${year}-08-01`)
    .lte("snapshot_date", `${year}-08-31`)
    .order("rank", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ player_id: r.player_id, rank: r.rank }));
}

async function analyzeYear(predictionYear: number, endYear: number) {
  console.log(
    `\n========== Year ${predictionYear} (cumulative window through ${endYear}) ==========`,
  );

  console.log("Fetching predictions...");
  const [dg, ecr, adp, outcomes] = await Promise.all([
    fetchDGv1Predictions(predictionYear),
    fetchPredictions("fantasypros_ecr", predictionYear),
    fetchPredictions("fantasypros_adp", predictionYear),
    fetchCumulativeOutcomes(predictionYear, endYear),
  ]);
  console.log(
    `  DG v1: ${dg.length}, FP ECR: ${ecr.length}, FP ADP: ${adp.length}, outcomes: ${outcomes.size}`,
  );

  // Build actual cumulative rank (lower = better, by total PPR DESC).
  const actualSorted = [...outcomes.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const actualRank = new Map<string, number>();
  actualSorted.forEach(([pid], i) => actualRank.set(pid, i + 1));

  // Resolve positions for all prediction player_ids.
  const ids = new Set<string>();
  for (const p of dg.slice(0, 100)) ids.add(p.player_id);
  for (const p of ecr.slice(0, 100)) ids.add(p.player_id);
  for (const p of adp.slice(0, 100)) ids.add(p.player_id);
  const players = await resolvePlayers([...ids]);

  function posOf(pid: string): Position | null {
    const p = players.get(pid);
    if (!p?.position) return null;
    const u = p.position.toUpperCase();
    return POSITIONS.includes(u as Position) ? (u as Position) : null;
  }

  function buildPairsByPosition(
    predictions: Prediction[],
  ): Record<Position, Array<{ predicted: number; actual: number }>> {
    const buckets: Record<Position, Array<{ predicted: number; actual: number }>> = {
      QB: [],
      RB: [],
      WR: [],
      TE: [],
    };
    let predictedRankWithin: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const p of predictions.slice(0, 100)) {
      const pos = posOf(p.player_id);
      if (!pos) continue;
      const actual = actualRank.get(p.player_id);
      if (!actual) continue;
      // Use within-position predicted rank vs within-position actual rank.
      // Top-100 overall ranking will under-represent QBs/TEs because they
      // cluster lower; per-position rank is the apples-to-apples metric.
      predictedRankWithin[pos] += 1;
      buckets[pos].push({ predicted: predictedRankWithin[pos], actual });
    }
    // Convert actual to within-position rank by re-ranking the actual values
    // restricted to the players in each bucket.
    for (const pos of POSITIONS) {
      const actuals = buckets[pos]
        .map((p, i) => ({ idx: i, actual: p.actual }))
        .sort((a, b) => a.actual - b.actual);
      actuals.forEach((a, i) => {
        buckets[pos][a.idx].actual = i + 1;
      });
    }
    return buckets;
  }

  const dgBuckets = buildPairsByPosition(dg);
  const ecrBuckets = buildPairsByPosition(ecr);
  const adpBuckets = buildPairsByPosition(adp);

  console.log(
    `\n${"Position".padEnd(8)} | ${"DG v1".padStart(10)} | ${"FP ECR".padStart(10)} | ${"FP ADP".padStart(10)} | ${"DG vs ECR".padStart(11)} | n_DG`,
  );
  console.log("-".repeat(76));

  for (const pos of POSITIONS) {
    const dgRho = spearman(dgBuckets[pos]);
    const ecrRho = spearman(ecrBuckets[pos]);
    const adpRho = spearman(adpBuckets[pos]);
    const delta = dgRho.rho - ecrRho.rho;
    const deltaStr = isNaN(delta)
      ? "n/a"
      : delta > 0
        ? `+${delta.toFixed(3)}`
        : delta.toFixed(3);
    const fmt = (rho: { rho: number; n: number }) =>
      isNaN(rho.rho) ? `n/a (${rho.n})` : `${rho.rho.toFixed(3)} (${rho.n})`;
    console.log(
      `${pos.padEnd(8)} | ${fmt(dgRho).padStart(10)} | ${fmt(ecrRho).padStart(10)} | ${fmt(adpRho).padStart(10)} | ${deltaStr.padStart(11)} | ${dgRho.n}`,
    );
  }
}

async function main() {
  console.log("=== Diagnostic #2: Per-position Spearman breakdown ===");
  console.log(
    "Hypothesis: DG v1 wins on RB (signals loaded), loses on WR/QB/TE (rubric only).",
  );

  await analyzeYear(2022, 2024); // 3-year cumulative
  await analyzeYear(2023, 2024); // 2-year cumulative
  await analyzeYear(2024, 2024); // 1-year cumulative

  console.log("\n=== Interpretation ===");
  console.log(
    "If RB column shows DG winning and WR/QB/TE show DG losing, hypothesis is confirmed:",
  );
  console.log(
    "  → extending hand-coded signal coverage to non-RB positions is the v2 priority.",
  );
  console.log(
    "If DG loses across all positions, the rubric/age-curve foundation needs work,",
  );
  console.log("  not just signal coverage.");
  console.log(
    "Sample sizes per-position will be small (often 5-30); read deltas with confidence",
  );
  console.log(
    "  intervals of ±0.10-0.15. Look for directional pattern, not point estimates.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
