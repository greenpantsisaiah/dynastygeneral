/**
 * RB backtest cohort builder. Shared by the backtest and the weight
 * calibration so both score the SAME cohort (one data path, no drift).
 * Read-only: queries the historical_* tables + the nflverse lib.
 *
 * For a decision year Y: prior-season role/OL signals (Y-1), the KTC
 * market prior nearest preseason Y, compounding-news (Y), age at Y, and
 * the realized season-Y PPR points-per-game outcome. Each record is an
 * EvaluationContext ready for evaluateRb plus the market value + outcome.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvaluationContext } from "@/lib/engine/evaluation";
import type { PlayerSignalsRow, TeamSignalsRow } from "@/lib/signals/schema";
import { buildSeasonSignals, type Crosswalk } from "@/lib/signals/nflverse";

const GP_FLOOR = 6;

export type RbBacktestRecord = {
  player_id: string;
  name: string;
  ctx: EvaluationContext;
  market: number; // KTC value (the prior the rubric blends from)
  outcomePPG: number; // realized season-Y PPR points per game
};

export async function buildRbCohort(
  sb: SupabaseClient,
  xwalk: Crosswalk,
  year: number,
): Promise<{ records: RbBacktestRecord[]; snapshotDate: string | null; format: string | null }> {
  const { players, teams } = await buildSeasonSignals(String(year - 1), xwalk);

  // Market prior: latest KTC snapshot at/before mid-September Y.
  const latest = await sb
    .from("historical_market_values")
    .select("snapshot_date")
    .lte("snapshot_date", `${year}-09-15`)
    .order("snapshot_date", { ascending: false })
    .limit(1);
  const snapshotDate = latest.data?.[0]?.snapshot_date ?? null;
  const mv = snapshotDate
    ? await sb
        .from("historical_market_values")
        .select("player_id,value,format")
        .eq("snapshot_date", snapshotDate)
    : { data: [] as { player_id: string; value: number; format: string }[] };
  const fmtCount: Record<string, number> = {};
  for (const r of mv.data ?? []) fmtCount[r.format] = (fmtCount[r.format] ?? 0) + 1;
  const format = Object.entries(fmtCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const ktc = new Map<string, number>();
  for (const r of mv.data ?? []) {
    if (r.format !== format) continue;
    if (typeof r.value === "number") ktc.set(r.player_id, r.value);
  }

  // Outcome: season-Y PPR PPG (games >= floor).
  const ho = await sb
    .from("historical_outcomes")
    .select("player_id,ppr_points,games_played")
    .eq("season", year)
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
    .eq("prediction_year", year);
  const news = new Map<string, number>();
  for (const r of sc.data ?? []) {
    const v = (r.signal_value as { value?: number })?.value;
    if (typeof v === "number" && r.player_id) news.set(r.player_id, v);
  }

  const records: RbBacktestRecord[] = [];
  for (const [id, sig] of players) {
    if ((sig.position ?? "").toUpperCase() !== "RB") continue;
    const k = ktc.get(id);
    const o = ppg.get(id);
    if (k == null || o == null) continue;
    const by = xwalk.birthYearBySleeper.get(id);
    const age = by != null ? year - by : null;
    const player = {
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
    const team = {
      team: sig.team ?? "",
      ol_continuity_score: teamSig?.ol_continuity_score ?? null,
      rookie_ol_starters_count: 0,
      staff_novelty_composite: 0,
    } as TeamSignalsRow;
    records.push({
      player_id: id,
      name: xwalk.nameBySleeper.get(id) ?? id,
      ctx: { player, team, ktc_value: k, age, position: "RB" },
      market: k,
      outcomePPG: o,
    });
  }
  return { records, snapshotDate, format };
}

// ---- shared rank-correlation helpers (used by backtest + calibration) ----
export function rank(arr: number[]): number[] {
  const idx = arr.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(arr.length);
  for (let k = 0; k < idx.length; k++) r[idx[k][1]] = k + 1;
  return r;
}
function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n === 0) return 0;
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
export const spearman = (a: number[], b: number[]) => pearson(rank(a), rank(b));
