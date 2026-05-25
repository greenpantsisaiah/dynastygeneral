/**
 * Backtest: does PROVEN prior-season production beat the market in the
 * deep dynasty tier, vs the unproven rookies/dart-throws the market
 * prefers at the same rank?
 *
 * Motivation (founder doubt 2026-05-24, Adonai Mitchell case): the board
 * ranks incoming rookies above a 2nd-year player who started + scored.
 * The board's value is a pure FantasyCalc/KTC market passthrough (our
 * own rubric is unwired). This script asks whether a market-independent
 * "proven production" signal would have added real forward value, which
 * is the evidence required before deviating from the market value scale
 * (INVARIANTS: no value-scale multiplier without research/backtest
 * grounding; the TE down-multiplier was data-disproven).
 *
 * Design (survivorship-robust, rank-controlled, vintage-correct):
 *   - Cohort = KTC SF snapshot players in a deep rank band.
 *   - "Proven" = real PPR in the PRIOR season (from historical_outcomes,
 *     vintage-correct, no current-blob survivorship). "Unproven" = none.
 *   - Control for the market's own opinion by comparing proven vs
 *     unproven WITHIN narrow rank sub-bands.
 *   - Keep fell-outs (no forward row => forward PPR 0; no forward
 *     snapshot => worst-rank penalty), so washouts are not dropped.
 *   - Vintage-correct age from raw_attributes.age.
 *
 * Data constraints (honest):
 *   - historical_outcomes covers 2022-2024 only. Prior-season production
 *     is computable for the 2023 and 2024 snapshot vintages (prior 2022 /
 *     2023). The 2022 vintage has no 2021 outcomes, so it is reported
 *     separately as a 3-year-realized view bucketed by vintage age.
 *   - KTC snapshots end 2024-12, so the 2024 vintage has no forward
 *     value-trajectory (no 2025 snapshot); forward PPR is 1 year.
 *   - 2023 has no clean summer snapshot; 2023-10-01 (early in-season) is
 *     used and flagged. Prior/forward PPR are unaffected by the date.
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.json scripts/backtest-proven-production-edge.ts
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";
import { __dumpAllPlayers } from "../src/lib/players/cache";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const FORMAT = "sf";
const BAND_LO = 100;
const BAND_HI = 280;
const SUB_BANDS: Array<[number, number]> = [
  [100, 160],
  [160, 220],
  [220, 280],
];
const PROVEN_PPR_MIN = 50; // a real contributor's prior season (~3 PPR/game x 16)

type MV = { player_id: string; overall_rank: number | null; position: string | null; raw_attributes: any };

async function pageAll(table: string, cols: string, filters: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await filters(sb.from(table).select(cols)).range(from, from + PAGE - 1);
    if (error) { console.log(`ERR ${table}: ${error.message}`); break; }
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

async function loadOutcomes(): Promise<Map<string, number>> {
  const oc = await pageAll("historical_outcomes", "player_id,season,ppr_points,week", (q) => q.is("week", null));
  const m = new Map<string, number>();
  for (const r of oc as any[]) m.set(`${r.player_id}:${r.season}`, Number(r.ppr_points) || 0);
  return m;
}

async function snapshot(date: string): Promise<MV[]> {
  return (await pageAll("historical_market_values", "player_id,overall_rank,position,raw_attributes",
    (q) => q.eq("source", "ktc").eq("format", FORMAT).eq("snapshot_date", date))) as MV[];
}

type Vintage = { year: number; date: string; prior: number; forward: number[]; flag?: string };

async function provenAnalysis(vintages: Vintage[], ppr: Map<string, number>, posFilter?: string) {
  // pool players across vintages
  type Row = { id: string; rank: number; pos: string; priorPpr: number; fwdPpr: number; proven: boolean; vintage: number };
  const rows: Row[] = [];
  for (const v of vintages) {
    const snap = await snapshot(v.date);
    for (const m of snap) {
      if (m.overall_rank == null || m.overall_rank < BAND_LO || m.overall_rank > BAND_HI) continue;
      const pos = (m.position ?? "").toUpperCase();
      if (posFilter && pos !== posFilter) continue;
      const prior = ppr.get(`${m.player_id}:${v.prior}`) ?? 0;
      const fwd = mean(v.forward.map((s) => ppr.get(`${m.player_id}:${s}`) ?? 0));
      rows.push({ id: m.player_id, rank: m.overall_rank, pos, priorPpr: prior, fwdPpr: fwd, proven: prior >= PROVEN_PPR_MIN, vintage: v.year });
    }
  }
  console.log(`\n  pooled vintages: ${vintages.map((v) => `${v.year}(prior ${v.prior}->fwd ${v.forward.join("+")})${v.flag ? " " + v.flag : ""}`).join(", ")}`);
  console.log(`  sub-band        proven(n)  med fwdPPR | unproven(n)  med fwdPPR | proven edge (median)`);
  for (const [lo, hi] of SUB_BANDS) {
    const g = rows.filter((r) => r.rank >= lo && r.rank < hi);
    const pr = g.filter((r) => r.proven), un = g.filter((r) => !r.proven);
    if (pr.length === 0 && un.length === 0) continue;
    const pm = median(pr.map((r) => r.fwdPpr)), um = median(un.map((r) => r.fwdPpr));
    const edge = pr.length && un.length ? (pm - um).toFixed(0) : "n/a";
    console.log(`  ${`${lo}-${hi}`.padEnd(14)}  ${String(pr.length).padStart(3)}      ${pm.toFixed(0).padStart(7)} | ${String(un.length).padStart(3)}       ${um.toFixed(0).padStart(7)} | ${String(edge).padStart(6)}`);
  }
  // whole-band summary
  const pr = rows.filter((r) => r.proven), un = rows.filter((r) => !r.proven);
  console.log(`  WHOLE BAND ${BAND_LO}-${BAND_HI}: proven n=${pr.length} medFwd=${median(pr.map((r) => r.fwdPpr)).toFixed(0)} meanFwd=${mean(pr.map((r) => r.fwdPpr)).toFixed(0)} | unproven n=${un.length} medFwd=${median(un.map((r) => r.fwdPpr)).toFixed(0)} meanFwd=${mean(un.map((r) => r.fwdPpr)).toFixed(0)}`);
}

async function realized3yr2022(ppr: Map<string, number>) {
  // 2022 vintage: no prior-season data, so bucket by vintage age and
  // report 3yr realized PPR + 24mo value trajectory.
  const snap22 = await snapshot("2022-08-14");
  const snap24 = await snapshot("2024-08-13");
  const rank24 = new Map<string, number>();
  for (const r of snap24) if (r.overall_rank != null) rank24.set(r.player_id, r.overall_rank);
  const WORST = Math.max(...[...rank24.values()], 450) + 1;
  type Row = { id: string; rank: number; pos: string; age: number | null; ageBucket: string; ppr3: number; rankDelta: number; fellOut: boolean };
  const rows: Row[] = [];
  for (const m of snap22) {
    if (m.overall_rank == null || m.overall_rank < BAND_LO || m.overall_rank > BAND_HI) continue;
    const age = typeof m.raw_attributes?.age === "number" ? m.raw_attributes.age : null;
    const ab = age == null ? "unknown" : age <= 23 ? "young<=23" : age <= 26 ? "24-26" : "27+";
    const p3 = (ppr.get(`${m.player_id}:2022`) ?? 0) + (ppr.get(`${m.player_id}:2023`) ?? 0) + (ppr.get(`${m.player_id}:2024`) ?? 0);
    const r24 = rank24.get(m.player_id) ?? null;
    rows.push({ id: m.player_id, rank: m.overall_rank, pos: (m.position ?? "").toUpperCase(), age, ageBucket: ab, ppr3: p3, rankDelta: (r24 ?? WORST) - m.overall_rank, fellOut: r24 == null });
  }
  console.log("\n  age bucket    n   med 3yrPPR  mean 3yrPPR  medRankDelta(- = climbed)  %fellOut");
  for (const ab of ["young<=23", "24-26", "27+"]) {
    const g = rows.filter((r) => r.ageBucket === ab);
    if (!g.length) continue;
    console.log(`  ${ab.padEnd(12)}  ${String(g.length).padStart(2)}   ${median(g.map((r) => r.ppr3)).toFixed(0).padStart(8)}   ${mean(g.map((r) => r.ppr3)).toFixed(0).padStart(9)}   ${median(g.map((r) => r.rankDelta)).toFixed(0).padStart(12)}              ${(g.filter((r) => r.fellOut).length / g.length * 100).toFixed(0).padStart(4)}%`);
  }
}

async function main() {
  const ppr = await loadOutcomes();

  // prior-production vintages (clean for prior + forward PPR)
  const vintages: Vintage[] = [
    { year: 2024, date: "2024-08-13", prior: 2023, forward: [2024] },
    { year: 2023, date: "2023-10-01", prior: 2022, forward: [2023, 2024], flag: "[early-season snapshot]" },
  ];

  console.log("=".repeat(78));
  console.log("ANALYSIS 1 - PROVEN (prior-season PPR >= " + PROVEN_PPR_MIN + ") vs UNPROVEN, rank-controlled");
  console.log("Forward outcome = avg forward-season PPR. KTC SF, deep tier " + BAND_LO + "-" + BAND_HI + ".");
  console.log("=".repeat(78));
  console.log("\n[ALL POSITIONS]");
  await provenAnalysis(vintages, ppr);
  for (const pos of ["WR", "RB", "QB", "TE"]) {
    console.log(`\n[${pos}]`);
    await provenAnalysis(vintages, ppr, pos);
  }

  console.log("\n" + "=".repeat(78));
  console.log("ANALYSIS 2 - 2022 vintage, 3-year realized PPR + 24mo value trajectory by vintage age");
  console.log("(no 2021 outcomes => age-bucketed, not prior-production)");
  console.log("=".repeat(78));
  await realized3yr2022(ppr);

  console.log("\nNOTE: directional. Small per-bucket n; KTC ranks re-rank as new players enter; PPR is production not dynasty value. Methodology review (dynasty-canon-keeper / dynasty-assumption-auditor) pending before any value-scale change.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
