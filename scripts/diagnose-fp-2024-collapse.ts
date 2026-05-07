/**
 * Diagnostic #1: Verify FP's 2024 ECR/ADP collapse is legitimate.
 *
 * The v1 backtest scoreboard shows FP ECR 2024 = 0.200 and FP ADP
 * 2024 = 0.093 against actual 2024 cumulative outcomes (effectively
 * random for ADP). DG v1 = 0.346. This 2024 result drives most of
 * DG's average win over consensus.
 *
 * Question: is FP's 0.093 / 0.200 a real prediction failure, or a
 * methodology artifact (different player IDs, different scoring,
 * missing data, wrong join)?
 *
 * Method: pull FP 2024 ECR top-25 + FP 2024 ADP top-25, join to
 * actual 2024 PPR season totals, print named players with their
 * predicted rank and actual rank. If we can name 5-10 specific
 * top-20 players who finished outside top 50 (CMC, Burrow, etc.),
 * the collapse is genuine. If the data looks weirdly mismatched,
 * we have a methodology bug.
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.json scripts/diagnose-fp-2024-collapse.ts
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

async function fetchRankings(source: string): Promise<
  Array<{ player_id: string; rank: number }>
> {
  const { data, error } = await supabase
    .from("historical_consensus_rankings")
    .select("player_id, rank, snapshot_date, format")
    .eq("source", source)
    .gte("snapshot_date", "2024-07-01")
    .lte("snapshot_date", "2024-09-30")
    .eq("format", "1qb")
    .order("rank", { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) {
    console.log(`  no rows for ${source}; trying without format filter`);
    const { data: fallback } = await supabase
      .from("historical_consensus_rankings")
      .select("player_id, rank, snapshot_date, format")
      .eq("source", source)
      .gte("snapshot_date", "2024-07-01")
      .lte("snapshot_date", "2024-09-30")
      .order("rank", { ascending: true });
    return (fallback ?? []).map((r) => ({
      player_id: r.player_id,
      rank: r.rank,
    }));
  }
  return data.map((r) => ({ player_id: r.player_id, rank: r.rank }));
}

async function fetch2024Outcomes(): Promise<
  Map<string, { ppr_points: number; games: number }>
> {
  const seasonTotals: Map<string, { ppr_points: number; games: number }> =
    new Map();
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("historical_outcomes")
      .select("player_id, week, ppr_points, games_played")
      .eq("season", 2024)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      const ppr = Number(row.ppr_points ?? 0);
      const games = Number(row.games_played ?? 0);
      if (row.week === null) {
        seasonTotals.set(row.player_id, { ppr_points: ppr, games });
      } else {
        const existing = seasonTotals.get(row.player_id);
        if (!existing || existing.games === 0) {
          const prev = seasonTotals.get(row.player_id) ?? {
            ppr_points: 0,
            games: 0,
          };
          seasonTotals.set(row.player_id, {
            ppr_points: prev.ppr_points + ppr,
            games: prev.games + (ppr > 0 ? 1 : 0),
          });
        }
      }
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return seasonTotals;
}

async function main() {
  console.log("=== Diagnostic #1: FP 2024 collapse spot-check ===\n");

  console.log("Fetching FP ECR 2024 rankings...");
  const ecr = await fetchRankings("fantasypros_ecr");
  console.log(`  ${ecr.length} ECR rows`);

  console.log("Fetching FP ADP 2024 rankings...");
  const adp = await fetchRankings("fantasypros_adp");
  console.log(`  ${adp.length} ADP rows`);

  console.log("Fetching 2024 actual outcomes...");
  const outcomes = await fetch2024Outcomes();
  console.log(`  ${outcomes.size} unique player-season totals`);

  const actualSorted = [...outcomes.entries()]
    .filter(([, v]) => v.ppr_points > 0)
    .sort((a, b) => b[1].ppr_points - a[1].ppr_points);
  const actualRank = new Map<string, number>();
  actualSorted.forEach(([pid], i) => actualRank.set(pid, i + 1));

  console.log(`  ${actualRank.size} players with positive PPR points\n`);

  const ids = new Set<string>();
  ecr.slice(0, 25).forEach((r) => ids.add(r.player_id));
  adp.slice(0, 25).forEach((r) => ids.add(r.player_id));
  const players = await resolvePlayers([...ids]);

  function nameOf(pid: string): string {
    const p = players.get(pid);
    if (!p) return `[unknown ${pid}]`;
    const name =
      p.first_name && p.last_name
        ? `${p.first_name} ${p.last_name}`
        : p.full_name ?? pid;
    return `${name} (${p.position ?? "?"})`;
  }

  function printTable(
    label: string,
    rows: Array<{ player_id: string; rank: number }>,
  ): { misses: number; unmatched: number } {
    console.log(`=== ${label} top-25 vs actual 2024 cumulative rank ===`);
    console.log(
      `${"FP".padStart(4)} | ${"ACT".padStart(5)} | ${"DELTA".padStart(7)} | PPR pts | Player`,
    );
    console.log("-".repeat(80));
    let misses = 0;
    let unmatched = 0;
    for (const r of rows.slice(0, 25)) {
      const actual = actualRank.get(r.player_id);
      const ppr = outcomes.get(r.player_id)?.ppr_points ?? 0;
      const actualLabel = actual ? String(actual) : "n/a";
      const delta = actual ? actual - r.rank : null;
      const deltaLabel =
        delta == null ? "no data" : delta > 0 ? `+${delta}` : `${delta}`;
      console.log(
        `${String(r.rank).padStart(4)} | ${actualLabel.padStart(5)} | ${deltaLabel.padStart(7)} | ${ppr.toFixed(1).padStart(7)} | ${nameOf(r.player_id)}`,
      );
      if (actual == null) unmatched++;
      else if (actual > 50) misses++;
    }
    console.log(
      `\n${label}: ${misses} of top-25 finished outside actual top-50. ${unmatched} unmatched.\n`,
    );
    return { misses, unmatched };
  }

  const ecrStats = printTable("FP ECR 2024", ecr);
  const adpStats = printTable("FP ADP 2024", adp);

  console.log("=== Diagnosis ===");
  if (ecrStats.unmatched > 8 || adpStats.unmatched > 8) {
    console.log(
      `WARN: > 8 of FP top-25 have no actual outcome row (ECR ${ecrStats.unmatched}, ADP ${adpStats.unmatched}). Possible data-coverage issue.`,
    );
  }
  const totalMisses = ecrStats.misses + adpStats.misses;
  if (totalMisses >= 6) {
    console.log(
      `LEGIT: ${totalMisses} top-25 picks finished outside actual top-50. The 2024 FP collapse is real (named whiffs). The DG win on 2024 holds up.`,
    );
  } else if (ecrStats.unmatched > 12 || adpStats.unmatched > 12) {
    console.log(
      "ARTIFACT: high unmatched count suggests a join / player_id / dataset mismatch. The 0.093 number may be inflated by missing data, not bad rankings. Investigate before publishing.",
    );
  } else {
    console.log(
      "MIXED: < 6 named whiffs but join is mostly clean. The Spearman number may be sensitive to a few outliers; consider robustness checks.",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
