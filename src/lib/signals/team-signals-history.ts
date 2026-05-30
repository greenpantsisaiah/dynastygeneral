/**
 * Season-aware team-signals reader (BACKTEST PATH).
 *
 * The live reader `getTeamSignalsMap()` in src/lib/players/player-signals.ts
 * reads the single CURRENT-season snapshot from `team_signals` and is left
 * UNCHANGED (no live regression). This reader is its historical twin: it
 * reads `team_signals_history` for one season so the WR/QB/TE backtests can
 * join the scheme/coaching fields the rubrics consume, temporally blinded to
 * each decision year.
 *
 * Returns a Map<team, TeamSignalsRow> for the requested season, shaped like
 * the live row so the cohort builder can hand it to the rubric unchanged.
 * Columns absent from the history table (ol_grade_*, rookie_ol_*) are
 * surfaced as null, exactly as the cohort builder already does. Takes the
 * Supabase client from the caller (scripts pass a service-role client), so
 * this module has no client-construction side effects and is never imported
 * by an app surface.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamSignalsRow } from "@/lib/signals/schema";

type HistoryRow = {
  team: string;
  season: number;
  hc_id: string | null;
  hc_first_time_flag: boolean | null;
  hc_tenure_yrs: number | null;
  hc_background_tag: string | null;
  oc_id: string | null;
  oc_tenure_yrs: number | null;
  oc_first_year_with_team_flag: boolean | null;
  scheme_tag: string | null;
  staff_novelty_composite: number | null;
  scheme_pace: number | null;
  pass_rate_neutral: number | null;
  personnel_12_rate: number | null;
};

/**
 * Read team_signals_history for one season. `ol_continuity_score` is NOT
 * in the history table; the caller already hydrates it from the per-season
 * nflverse snap-counts pass, so this reader leaves it null and the caller
 * overlays it.
 */
export async function getTeamSignalsHistoryForSeason(
  sb: SupabaseClient,
  season: number,
): Promise<Map<string, TeamSignalsRow>> {
  const out = new Map<string, TeamSignalsRow>();
  const { data, error } = await sb
    .from("team_signals_history")
    .select(
      "team,season,hc_id,hc_first_time_flag,hc_tenure_yrs,hc_background_tag,oc_id,oc_tenure_yrs,oc_first_year_with_team_flag,scheme_tag,staff_novelty_composite,scheme_pace,pass_rate_neutral,personnel_12_rate",
    )
    .eq("season", season);
  if (error) {
    console.warn(
      `[team-signals-history] read failed for season ${season}: ${error.message}`,
    );
    return out;
  }
  for (const r of (data as HistoryRow[]) ?? []) {
    if (!r.team) continue;
    out.set(r.team, {
      team: r.team,
      ol_continuity_score: null,
      ol_grade_run: null,
      ol_grade_pass: null,
      rookie_ol_starters_count: 0,
      rookie_ol_position_breakdown: {},
      hc_id: r.hc_id,
      hc_first_time_flag: r.hc_first_time_flag,
      hc_tenure_yrs: r.hc_tenure_yrs,
      hc_background_tag: (r.hc_background_tag as TeamSignalsRow["hc_background_tag"]) ?? null,
      oc_id: r.oc_id,
      oc_tenure_yrs: r.oc_tenure_yrs,
      oc_first_year_with_team_flag: r.oc_first_year_with_team_flag,
      scheme_tag: (r.scheme_tag as TeamSignalsRow["scheme_tag"]) ?? null,
      staff_novelty_composite: r.staff_novelty_composite ?? 0,
      scheme_pace: r.scheme_pace,
      pass_rate_neutral: r.pass_rate_neutral,
      personnel_12_rate: r.personnel_12_rate,
      last_updated: "",
      updated_by: null,
    });
  }
  return out;
}
