/**
 * Empirically validate the pick-value convexity premise that the
 * 2026-05-20 binary-guardrail retirement rests on.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/validate-pick-value-convexity.ts
 *
 * The fix's logic chain: pick value decays steeply by round (Massey-
 * Thaler 2013; Stuart, Football Perspective AV chart) -> late-round
 * picks carry near-zero arbitrage equity -> a binary guardrail that
 * treats every pick as equal "equity to protect" is wrong -> demote
 * the guardrail and gate the cautious read on early_round_pick_equity
 * (round <= EARLY_ROUND_THRESHOLD = 6).
 *
 * The load-bearing empirical claim is the convex decay. This script
 * reproduces it on REAL dynasty market data (KTC historical snapshots
 * in historical_market_values), independent of the cited papers. In a
 * startup draft the player taken at overall pick N converts a pick at
 * slot N into roughly the value of the player ranked N, so value-by-
 * overall_rank IS the empirical pick-value-by-slot curve.
 *
 * READ-ONLY. SELECT queries only; no writes.
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

const TEAMS = 12; // standard league size for the round mapping
const EARLY_ROUND_THRESHOLD = 6; // the constant under test
const POOL_RANKS = TEAMS * 20; // rounds 1-20 = top 240 by rank

type Row = { value: number; overall_rank: number | null };

function roundOf(rank: number): number {
  return Math.ceil(rank / TEAMS);
}

async function latestSnapshot(
  supa: ReturnType<typeof createClient>,
  format: "1qb" | "sf",
): Promise<{ date: string; rows: Row[] }> {
  const { data: dates } = await supa
    .from("historical_market_values")
    .select("snapshot_date")
    .eq("format", format)
    .order("snapshot_date", { ascending: false })
    .limit(1);
  const date = (dates?.[0]?.snapshot_date as string) ?? null;
  if (!date) return { date: "(none)", rows: [] };
  const { data } = await supa
    .from("historical_market_values")
    .select("value, overall_rank")
    .eq("format", format)
    .eq("snapshot_date", date)
    .not("overall_rank", "is", null)
    .lte("overall_rank", POOL_RANKS)
    .order("overall_rank", { ascending: true });
  return { date, rows: (data ?? []) as Row[] };
}

function analyze(label: string, rows: Row[]) {
  if (rows.length === 0) {
    console.log(`\n${label}: no data.`);
    return;
  }
  // Mean value per round.
  const byRound = new Map<number, number[]>();
  for (const r of rows) {
    if (r.overall_rank == null) continue;
    const rd = roundOf(r.overall_rank);
    const arr = byRound.get(rd) ?? [];
    arr.push(r.value);
    byRound.set(rd, arr);
  }
  const rounds = [...byRound.keys()].sort((a, b) => a - b);
  const meanByRound = new Map<number, number>();
  for (const rd of rounds) {
    const arr = byRound.get(rd)!;
    meanByRound.set(rd, arr.reduce((s, v) => s + v, 0) / arr.length);
  }

  // Replacement level: the mean value of the deepest round in the pool
  // (round 20 area). Surplus = value above replacement.
  const replacement = meanByRound.get(rounds[rounds.length - 1]) ?? 0;

  console.log(`\n${label}`);
  console.log("  round  mean_value  drop_vs_prev  surplus_over_replacement");
  let prev: number | null = null;
  for (const rd of rounds) {
    const mv = meanByRound.get(rd)!;
    const drop = prev == null ? null : prev - mv;
    const surplus = mv - replacement;
    console.log(
      `  ${String(rd).padStart(5)}  ${mv.toFixed(0).padStart(10)}  ${
        drop == null ? "       -" : drop.toFixed(0).padStart(8)
      }  ${surplus.toFixed(0).padStart(8)}`,
    );
    prev = mv;
  }

  // Convexity test: the round-over-round drop should shrink as rounds
  // progress (steep early, flat late). Compare mean drop in rounds 1-6
  // vs rounds 7+.
  const drops = (lo: number, hi: number) => {
    const ds: number[] = [];
    for (let rd = lo + 1; rd <= hi; rd++) {
      const a = meanByRound.get(rd - 1);
      const b = meanByRound.get(rd);
      if (a != null && b != null) ds.push(a - b);
    }
    return ds.length ? ds.reduce((s, v) => s + v, 0) / ds.length : 0;
  };
  const earlyDrop = drops(1, EARLY_ROUND_THRESHOLD);
  const lateDrop = drops(EARLY_ROUND_THRESHOLD, rounds[rounds.length - 1]);

  // Share of total above-replacement surplus captured in rounds 1-6.
  let earlySurplus = 0;
  let totalSurplus = 0;
  for (const rd of rounds) {
    const surplus = Math.max(0, (meanByRound.get(rd)! - replacement)) * TEAMS;
    totalSurplus += surplus;
    if (rd <= EARLY_ROUND_THRESHOLD) earlySurplus += surplus;
  }
  const earlyShare = totalSurplus > 0 ? (earlySurplus / totalSurplus) * 100 : 0;

  console.log(`\n  Convexity test (steep early, flat late):`);
  console.log(`    mean round-over-round drop, rounds 1-${EARLY_ROUND_THRESHOLD}:  ${earlyDrop.toFixed(0)}`);
  console.log(`    mean round-over-round drop, rounds ${EARLY_ROUND_THRESHOLD}+:    ${lateDrop.toFixed(0)}`);
  console.log(
    `    early drop is ${lateDrop > 0 ? (earlyDrop / lateDrop).toFixed(1) : "inf"}x the late drop  ${
      earlyDrop > lateDrop ? "(CONVEX, premise holds)" : "(NOT convex, premise fails)"
    }`,
  );
  console.log(
    `    share of above-replacement surplus in rounds 1-${EARLY_ROUND_THRESHOLD}: ${earlyShare.toFixed(0)}%`,
  );
  console.log(
    `    -> EARLY_ROUND_THRESHOLD=${EARLY_ROUND_THRESHOLD} ${
      earlyShare >= 60 ? "is grounded: most pick equity sits in rounds 1-6" : "may be mis-set: surplus is more spread out"
    }`,
  );
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
    console.log("This script needs read access to historical_market_values.");
    process.exit(1);
  }
  const supa = createClient(url, key);
  console.log("=== Pick-value convexity validation (real KTC market data) ===");
  console.log(`League size assumption: ${TEAMS} teams. Pool: top ${POOL_RANKS} by rank.`);

  for (const format of ["sf", "1qb"] as const) {
    const { date, rows } = await latestSnapshot(supa, format);
    analyze(`Format ${format.toUpperCase()} (snapshot ${date}, ${rows.length} players)`, rows);
  }

  console.log("\nInterpretation: a convex curve (early drop >> late drop, and");
  console.log("most surplus value concentrated in the early rounds) is the");
  console.log("empirical basis for treating late-round picks as near-zero");
  console.log("arbitrage equity. It is why the binary 'all picks are equity to");
  console.log("protect' guardrail was wrong, and it grounds the early-round gate.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
