/**
 * Position-parameterized backtest cohort builder. Shared by the WR / TE /
 * QB backtests so all three score the SAME shape (one data path, no
 * drift). Read-only: queries the historical_* tables + the nflverse lib.
 *
 * Pattern matches the RB cohort builder in rb-cohort.ts (RB has its own
 * file because the RB rubric reads several RB-specific fields the
 * generic builder doesn't need to hydrate). For a decision year Y:
 * prior-season usage signals from nflverse (Y-1), the KTC market prior
 * nearest preseason Y, age at Y derived from the xwalk birthdate,
 * years_exp / is_rookie derived from the xwalk draft_year, and the
 * realized season-Y PPR points-per-game outcome. One EvaluationContext
 * per record ready for the position rubric.
 *
 * Temporal blinding (VALIDATION_PLAN.md section 4): signals reflect
 * state KNOWN as of preseason Y (prior season's snap counts, market
 * snapshot dated <= Sep 15 of Y, draft year known). The outcome is
 * Y itself.
 *
 * Compounding-news signal is RB-only in historical_signal_codes (per
 * truth audit 2026-05-26), so WR / TE / QB records leave it at 0.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvaluationContext } from "@/lib/engine/evaluation";
import type { PlayerSignalsRow, TeamSignalsRow } from "@/lib/signals/schema";
import { buildSeasonSignals, type Crosswalk } from "@/lib/signals/nflverse";

const GP_FLOOR = 6;

export type CohortPosition = "QB" | "WR" | "TE";

export type BacktestRecord = {
  player_id: string;
  name: string;
  ctx: EvaluationContext;
  market: number; // KTC value (the prior the rubric blends from)
  outcomePPG: number; // realized season-Y PPR points per game
};

export async function buildPositionCohort(
  sb: SupabaseClient,
  xwalk: Crosswalk,
  year: number,
  position: CohortPosition,
  opts?: { withRoute?: boolean },
): Promise<{
  records: BacktestRecord[];
  snapshotDate: string | null;
  format: string | null;
}> {
  // Route participation is on by default; the WR/TE backtest passes
  // withRoute=false to reproduce the A4 (no-route) baseline so the lift
  // from the route signal is measured against the SAME cohort. Nulling
  // it here (not refetching the cohort) keeps the A/B perfectly paired.
  const withRoute = opts?.withRoute ?? true;
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

  const records: BacktestRecord[] = [];
  for (const [id, sig] of players) {
    if ((sig.position ?? "").toUpperCase() !== position) continue;
    const k = ktc.get(id);
    const o = ppg.get(id);
    if (k == null || o == null) continue;
    const by = xwalk.birthYearBySleeper.get(id);
    const age = by != null ? year - by : null;
    const dy = xwalk.draftYearBySleeper.get(id);
    const yearsExp = dy != null ? year - dy : null;
    const isRookie = yearsExp === 0;

    const player = {
      player_id: id,
      position,
      team: sig.team,
      age,
      rb_role_tier: null,
      rb_traded_offseason_flag: null,
      rb_role_at_new_team_projected: null,
      rb_passdown_share_prior_year: null,
      compounding_news_count: 0,
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
      ol_grade_run: null,
      ol_grade_pass: null,
      rookie_ol_starters_count: 0,
      rookie_ol_position_breakdown: {},
      hc_id: null,
      hc_first_time_flag: null,
      hc_tenure_yrs: null,
      hc_background_tag: null,
      oc_id: null,
      oc_tenure_yrs: null,
      oc_first_year_with_team_flag: null,
      scheme_tag: null,
      staff_novelty_composite: 0,
      scheme_pace: null,
      pass_rate_neutral: null,
      personnel_12_rate: null,
      last_updated: "",
      updated_by: null,
    } as TeamSignalsRow;

    records.push({
      player_id: id,
      name: xwalk.nameBySleeper.get(id) ?? id,
      ctx: {
        player,
        team,
        ktc_value: k,
        age,
        position,
        is_rookie: isRookie,
        years_exp: yearsExp,
        route_participation: withRoute
          ? sig.route_participation_prior_year
          : null,
      },
      market: k,
      outcomePPG: o,
    });
  }
  return { records, snapshotDate, format };
}

// ---- shared rank-correlation helpers (used by every backtest) ----
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

/**
 * Bootstrap 95% CI for the difference (rubric - market) Spearman rank
 * correlation against the same outcome vector. Resamples the n records
 * with replacement, computes both Spearmans and their difference per
 * resample, and returns the 2.5 / 97.5 percentiles of the difference
 * distribution. Pooled across years if caller pools the vectors.
 */
export function bootstrapLiftCI(
  rubric: number[],
  market: number[],
  outcome: number[],
  iters = 1000,
  seed = 42,
): { lo: number; hi: number } {
  const n = rubric.length;
  if (n === 0) return { lo: 0, hi: 0 };
  // mulberry32 PRNG, deterministic from seed.
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const diffs: number[] = [];
  const rBoot = new Array<number>(n);
  const mBoot = new Array<number>(n);
  const oBoot = new Array<number>(n);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rand() * n);
      rBoot[i] = rubric[j];
      mBoot[i] = market[j];
      oBoot[i] = outcome[j];
    }
    diffs.push(spearman(rBoot, oBoot) - spearman(mBoot, oBoot));
  }
  diffs.sort((a, b) => a - b);
  const lo = diffs[Math.floor(iters * 0.025)];
  const hi = diffs[Math.floor(iters * 0.975)];
  return { lo, hi };
}
