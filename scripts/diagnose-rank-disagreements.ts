/**
 * Diagnostic #3: Top-N rank disagreements between DG v1 and FP ECR.
 *
 * Per diagnostic #2, DG wins overall top-100 by avoiding busts but
 * loses within-position to FP. This diagnostic names the specific
 * players where DG and FP differed by 20+ ranks, and reports actual
 * outcomes to identify whether DG was correctly skeptical (good
 * downgrade) or over-aggressive (bad downgrade).
 *
 * Two views per year:
 *  A) Players DG ranked HIGHER than FP (DG-bullish vs consensus)
 *  B) Players DG ranked LOWER than FP (DG-bearish vs consensus)
 *
 * For each, show actual outcome rank. Patterns to look for:
 *  - DG-bearish + actual bust = DG correctly downgraded (good age curve)
 *  - DG-bearish + actual hit = DG over-aggressive (age curve too steep)
 *  - DG-bullish + actual hit = DG signal added value (age curve found upside)
 *  - DG-bullish + actual miss = DG too generous (rookie / young hype)
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.json scripts/diagnose-rank-disagreements.ts
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

type Prediction = { player_id: string; rank: number };

async function fetchDG(year: number): Promise<Prediction[]> {
  const { data } = await supabase
    .from("historical_consensus_rankings")
    .select("player_id, rank")
    .eq("source", "dynasty_general_v0_signals")
    .gte("snapshot_date", `${year}-08-01`)
    .lte("snapshot_date", `${year}-08-31`)
    .order("rank", { ascending: true });
  return (data ?? []).map((r) => ({ player_id: r.player_id, rank: r.rank }));
}

async function fetchFP(year: number, source: string): Promise<Prediction[]> {
  const { data } = await supabase
    .from("historical_consensus_rankings")
    .select("player_id, rank")
    .eq("source", source)
    .gte("snapshot_date", `${year}-07-01`)
    .lte("snapshot_date", `${year}-09-30`)
    .order("rank", { ascending: true });
  return (data ?? []).map((r) => ({ player_id: r.player_id, rank: r.rank }));
}

async function fetchCumulative(start: number, end: number) {
  const totals = new Map<string, number>();
  for (let y = start; y <= end; y++) {
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("historical_outcomes")
        .select("player_id, week, ppr_points")
        .eq("season", y)
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      const seasonTotals = new Map<string, number>();
      for (const row of data) {
        const ppr = Number(row.ppr_points ?? 0);
        if (row.week === null) {
          seasonTotals.set(row.player_id, ppr);
        }
      }
      // If no season-total row for a player, sum per-week
      const seasonalAccumulator = new Map<string, number>();
      for (const row of data) {
        if (row.week === null) continue;
        const ppr = Number(row.ppr_points ?? 0);
        if (seasonTotals.has(row.player_id)) continue;
        const prev = seasonalAccumulator.get(row.player_id) ?? 0;
        seasonalAccumulator.set(row.player_id, prev + ppr);
      }
      for (const [pid, pts] of seasonalAccumulator.entries()) {
        seasonTotals.set(pid, pts);
      }
      for (const [pid, pts] of seasonTotals.entries()) {
        totals.set(pid, (totals.get(pid) ?? 0) + pts);
      }
      if (data.length < 1000) break;
      from += 1000;
    }
  }
  return totals;
}

async function analyzeYear(predictionYear: number, endYear: number) {
  const horizonLabel = `${endYear - predictionYear + 1}yr`;
  console.log(
    `\n========== ${predictionYear} prediction (${horizonLabel} cumulative) ==========`,
  );

  const [dg, ecr, outcomes] = await Promise.all([
    fetchDG(predictionYear),
    fetchFP(predictionYear, "fantasypros_ecr"),
    fetchCumulative(predictionYear, endYear),
  ]);

  // Build actual rank map
  const actualSorted = [...outcomes.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const actualRank = new Map<string, number>();
  actualSorted.forEach(([pid], i) => actualRank.set(pid, i + 1));

  // Map player_id → DG rank, FP ECR rank
  const dgRank = new Map<string, number>();
  for (const p of dg) dgRank.set(p.player_id, p.rank);
  const ecrRank = new Map<string, number>();
  for (const p of ecr) ecrRank.set(p.player_id, p.rank);

  // Find players in BOTH top-100 with rank delta >= 20
  type Disagreement = {
    player_id: string;
    dg: number;
    fp: number;
    actual: number | null;
    ppr: number;
    delta: number;
  };
  const disagreements: Disagreement[] = [];
  for (const [pid, dRank] of dgRank.entries()) {
    if (dRank > 100) continue;
    const fRank = ecrRank.get(pid);
    if (fRank == null || fRank > 100) continue;
    const delta = dRank - fRank;
    if (Math.abs(delta) < 20) continue;
    const actual = actualRank.get(pid) ?? null;
    const ppr = outcomes.get(pid) ?? 0;
    disagreements.push({ player_id: pid, dg: dRank, fp: fRank, actual, ppr, delta });
  }

  // Resolve names
  const ids = disagreements.map((d) => d.player_id);
  const players = await resolvePlayers(ids);
  function fmt(d: Disagreement) {
    const p = players.get(d.player_id);
    const name = p
      ? `${p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.full_name ?? d.player_id} (${p.position ?? "?"} age${p.age ?? "?"})`
      : `[${d.player_id}]`;
    const actualStr = d.actual ? String(d.actual) : "n/a";
    return { name, actualStr };
  }

  // DG-BEARISH (DG ranked LOWER, ie higher numeric rank means DG bearish vs FP)
  const bearish = [...disagreements]
    .filter((d) => d.delta > 0)
    .sort((a, b) => b.delta - a.delta);
  console.log(
    `\n--- DG BEARISH (DG ranked > 20 spots BELOW FP). Did the bust happen? ---`,
  );
  console.log(
    `${"DG".padStart(4)} | ${"FP".padStart(4)} | ${"ΔPos".padStart(5)} | ${"ACT".padStart(5)} | ${"PPR".padStart(7)} | Player`,
  );
  console.log("-".repeat(80));
  for (const d of bearish.slice(0, 15)) {
    const f = fmt(d);
    const verdict = d.actual && d.actual > 50 ? "DG correct (bust)" : d.actual && d.actual <= 50 ? "FP correct (hit)" : "?";
    console.log(
      `${String(d.dg).padStart(4)} | ${String(d.fp).padStart(4)} | ${`+${d.delta}`.padStart(5)} | ${f.actualStr.padStart(5)} | ${d.ppr.toFixed(1).padStart(7)} | ${f.name}  → ${verdict}`,
    );
  }

  // DG-BULLISH
  const bullish = [...disagreements]
    .filter((d) => d.delta < 0)
    .sort((a, b) => a.delta - b.delta);
  console.log(
    `\n--- DG BULLISH (DG ranked > 20 spots ABOVE FP). Did the upside hit? ---`,
  );
  console.log(
    `${"DG".padStart(4)} | ${"FP".padStart(4)} | ${"ΔPos".padStart(5)} | ${"ACT".padStart(5)} | ${"PPR".padStart(7)} | Player`,
  );
  console.log("-".repeat(80));
  for (const d of bullish.slice(0, 15)) {
    const f = fmt(d);
    const verdict =
      d.actual && d.actual <= 50
        ? "DG correct (hit)"
        : d.actual && d.actual > 100
          ? "DG WRONG (big miss)"
          : "?";
    console.log(
      `${String(d.dg).padStart(4)} | ${String(d.fp).padStart(4)} | ${String(d.delta).padStart(5)} | ${f.actualStr.padStart(5)} | ${d.ppr.toFixed(1).padStart(7)} | ${f.name}  → ${verdict}`,
    );
  }

  // Tally
  const bearishHits = bearish.filter((d) => d.actual && d.actual > 50).length;
  const bearishWrong = bearish.filter((d) => d.actual && d.actual <= 50).length;
  const bullishHits = bullish.filter((d) => d.actual && d.actual <= 50).length;
  const bullishWrong = bullish.filter(
    (d) => d.actual && d.actual > 100,
  ).length;
  console.log(
    `\nBearish tally: ${bearishHits} correct downgrades, ${bearishWrong} wrong (player still hit). Net: ${bearishHits - bearishWrong}.`,
  );
  console.log(
    `Bullish tally: ${bullishHits} correct elevations, ${bullishWrong} wrong (big miss). Net: ${bullishHits - bullishWrong}.`,
  );
}

async function main() {
  console.log("=== Diagnostic #3: DG v1 vs FP ECR rank disagreements ===");
  console.log(
    "Top-100 only. Delta >= 20 ranks. Names players where DG and FP disagreed.",
  );

  await analyzeYear(2022, 2024);
  await analyzeYear(2023, 2024);
  await analyzeYear(2024, 2024);

  console.log("\n=== Reading the result ===");
  console.log(
    "Bearish-correct calls (DG downgraded; player busted) = age curve / signals working",
  );
  console.log(
    "Bearish-wrong calls (DG downgraded; player hit) = age curve too aggressive",
  );
  console.log(
    "Bullish-correct calls (DG elevated; player hit) = signal added value",
  );
  console.log(
    "Bullish-wrong calls (DG elevated; player flopped) = rookie/young over-rated",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
