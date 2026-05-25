/**
 * RB rubric backtest. Read-only. Answers: does feeding the rubric the
 * free signals we can ingest (derived rb_role_tier + OL continuity +
 * compounding-news + age) grade RBs BETTER than the market prior (KTC)
 * alone? This is the safe on-ramp before wiring evaluate() into live
 * scoring (Phase 3c).
 *
 * Method, per decision year Y (2023, 2024):
 *   - signals = buildSeasonSignals(Y-1)  [prior-season role, derived]
 *   - market prior = KTC snapshot nearest preseason Y (historical_market_values)
 *   - compounding_news = historical_signal_codes (RB, prediction_year Y)
 *   - outcome = season-Y PPR points-per-game (historical_outcomes, games>=6)
 *   - rubric grade = evaluate(ctx).point_estimate ; baseline = the KTC prior
 *   - score: Spearman rank correlation of each vs outcome; lift = rubric - market
 * Plus an arbitrage read: when the rubric disagrees UP with the market
 * (grade > prior), do those RBs out-produce their KTC rank?
 *
 *   npx tsx --tsconfig tsconfig.json scripts/backtest-rb-rubric.ts
 *
 * NO writes. Spearman uses ordinal ranks (ties not averaged; fine at n~100s).
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";
import { loadCrosswalk, buildSeasonSignals } from "../src/lib/signals/nflverse";
import { evaluate } from "../src/lib/engine/evaluation";
import type { PlayerSignalsRow, TeamSignalsRow } from "../src/lib/signals/schema";

const DECISION_YEARS = [2023, 2024];
const GP_FLOOR = 6;

function rank(arr: number[]): number[] {
  const idx = arr.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array(arr.length);
  for (let k = 0; k < idx.length; k++) r[idx[k][1]] = k + 1;
  return r;
}
function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma,
      xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}
const spearman = (a: number[], b: number[]) => pearson(rank(a), rank(b));

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const xwalk = await loadCrosswalk();
  // birth year per sleeper id (for age at decision), from crosswalk.
  const birthYear = new Map<string, number>();
  {
    const rows = await (
      await fetch(
        "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv",
      )
    ).text();
    const { parseCsvLine } = await import("../src/lib/signals/nflverse");
    const lines = rows.split(/\r?\n/).filter((l) => l.length);
    const H = parseCsvLine(lines[0]);
    const si = H.indexOf("sleeper_id"),
      bi = H.indexOf("birthdate");
    for (const l of lines.slice(1)) {
      const c = parseCsvLine(l);
      const s = c[si];
      const y = Number((c[bi] ?? "").slice(0, 4));
      if (s && Number.isFinite(y)) birthYear.set(s, y);
    }
  }

  const pooled: { rubric: number[]; market: number[]; outcome: number[] } = {
    rubric: [],
    market: [],
    outcome: [],
  };

  for (const Y of DECISION_YEARS) {
    const { players, teams } = await buildSeasonSignals(String(Y - 1), xwalk);

    // Market prior: the latest KTC snapshot at or before mid-September Y
    // (snapshots are clustered, not monthly, so pick the nearest preseason
    // one rather than a fixed window). Then the modal format at that date.
    const latest = await sb
      .from("historical_market_values")
      .select("snapshot_date")
      .lte("snapshot_date", `${Y}-09-15`)
      .order("snapshot_date", { ascending: false })
      .limit(1);
    const snapDate = latest.data?.[0]?.snapshot_date;
    const mv = snapDate
      ? await sb
          .from("historical_market_values")
          .select("player_id,value,format,snapshot_date,position")
          .eq("snapshot_date", snapDate)
      : { data: [] as { player_id: string; value: number; format: string }[] };
    const fmtCount: Record<string, number> = {};
    for (const r of mv.data ?? []) fmtCount[r.format] = (fmtCount[r.format] ?? 0) + 1;
    const modalFmt = Object.entries(fmtCount).sort((a, b) => b[1] - a[1])[0]?.[0];
    const ktc = new Map<string, number>();
    for (const r of mv.data ?? []) {
      if (r.format !== modalFmt) continue;
      if (typeof r.value === "number") ktc.set(r.player_id, r.value);
    }

    // Outcome: season-Y PPR PPG.
    const ho = await sb
      .from("historical_outcomes")
      .select("player_id,ppr_points,games_played")
      .eq("season", Y)
      .is("week", null);
    const ppg = new Map<string, number>();
    for (const r of ho.data ?? []) {
      const g = r.games_played ?? 0;
      if (g >= GP_FLOOR && typeof r.ppr_points === "number")
        ppg.set(r.player_id, r.ppr_points / g);
    }

    // Compounding news (RB, prediction_year Y).
    const sc = await sb
      .from("historical_signal_codes")
      .select("player_id,signal_value")
      .eq("signal_name", "compounding_news_count")
      .eq("prediction_year", Y);
    const news = new Map<string, number>();
    for (const r of sc.data ?? []) {
      const v = (r.signal_value as { value?: number })?.value;
      if (typeof v === "number" && r.player_id) news.set(r.player_id, v);
    }

    const rubric: number[] = [];
    const market: number[] = [];
    const outcome: number[] = [];
    // Bullish disagreements: rubric grade meaningfully above the KTC
    // prior. The arbitrage thesis says these should out-produce their
    // KTC rank. We track the outcome percentile of that subset.
    const bullish: boolean[] = [];
    const bullOutcomePctiles: number[] = [];

    for (const [id, sig] of players) {
      if ((sig.position ?? "").toUpperCase() !== "RB") continue;
      const k = ktc.get(id);
      const o = ppg.get(id);
      if (k == null || o == null) continue;
      const age = birthYear.has(id) ? Y - birthYear.get(id)! : null;
      const playerRow = {
        player_id: id,
        position: "RB",
        team: sig.team,
        age,
        rb_role_tier: sig.rb_role_tier,
        rb_traded_offseason_flag: null,
        rb_role_at_new_team_projected: null,
        rb_passdown_share_prior_year: null,
        compounding_news_count: news.get(id) ?? 0,
        contract_years_remaining: null,
        recent_extension_flag: null,
        contract_year_flag: null,
        weight_lb: sig.weight_lb,
        height_in: sig.height_in,
        last_updated: "",
        updated_by: null,
      } as PlayerSignalsRow;
      const teamSig = sig.team ? teams.get(sig.team) : null;
      const teamRow = {
        team: sig.team ?? "",
        ol_continuity_score: teamSig?.ol_continuity_score ?? null,
        rookie_ol_starters_count: 0,
        staff_novelty_composite: 0,
      } as TeamSignalsRow;
      const out = evaluate({
        player: playerRow,
        team: teamRow,
        ktc_value: k,
        age,
        position: "RB",
      });
      rubric.push(out.point_estimate);
      market.push(k);
      outcome.push(o);
      bullish.push(out.market_delta > 3);
    }

    // Arbitrage read: of RBs the rubric is bullish on (grade > KTC prior
    // by >3), did they land in the top half of realized production? An
    // outcome percentile > 0.5 means the bullish calls out-produced the
    // median, i.e. the disagreement pointed the right way.
    const outRanks = rank(outcome);
    const n = outcome.length;
    for (let i = 0; i < n; i++) {
      if (bullish[i]) bullOutcomePctiles.push(outRanks[i] / n);
    }
    const bullMean =
      bullOutcomePctiles.length > 0
        ? bullOutcomePctiles.reduce((s, x) => s + x, 0) /
          bullOutcomePctiles.length
        : null;

    const sRub = spearman(rubric, outcome);
    const sMkt = spearman(market, outcome);
    console.log(
      `\n=== ${Y} (KTC snapshot ${String(snapDate).slice(0, 10)}, fmt=${modalFmt}, n=${rubric.length} RBs) ===`,
    );
    console.log(`  market (KTC) Spearman vs ${Y} PPG: ${sMkt.toFixed(3)}`);
    console.log(`  rubric       Spearman vs ${Y} PPG: ${sRub.toFixed(3)}`);
    console.log(`  LIFT (rubric - market):           ${(sRub - sMkt).toFixed(3)}`);
    console.log(
      `  rubric-bullish RBs: ${bullOutcomePctiles.length} | mean outcome pctile: ${
        bullMean != null ? bullMean.toFixed(3) : "n/a"
      } (>0.5 = right-pointing)`,
    );
    pooled.rubric.push(...rubric);
    pooled.market.push(...market);
    pooled.outcome.push(...outcome);
  }

  const pRub = spearman(pooled.rubric, pooled.outcome);
  const pMkt = spearman(pooled.market, pooled.outcome);
  console.log(`\n=== POOLED (n=${pooled.rubric.length}) ===`);
  console.log(`  market (KTC) Spearman: ${pMkt.toFixed(3)}`);
  console.log(`  rubric       Spearman: ${pRub.toFixed(3)}`);
  console.log(`  LIFT:                  ${(pRub - pMkt).toFixed(3)}`);
  console.log(
    `\nReading: positive lift = the rubric's free signals (role tier, OL, news, age) rank RBs' realized production better than KTC alone. ~0 or negative = the signals add nothing beyond the market on free data.\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
