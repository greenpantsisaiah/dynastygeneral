/**
 * League-wide outlook. For each roster in the league, compute the
 * win-now + future-value scores plus the 5-year contender forecast.
 * Powers the BCD visualizations on the hub:
 *   B (scatter): win-now × future, all teams plotted
 *   C (trajectory): 5-year contender outlook line per team
 *   D (table): sortable league standings with raw numbers
 *
 * Server-only. Reads the snapshot once and iterates rosters; calls
 * the existing per-roster scorers (scoreWinNowFor, scoreFutureValueFor,
 * computeContenderForecast). No new scoring math here, just a fan-out.
 *
 * Per founder analysis 2026-04-26: replaces the prior "your-team-only"
 * windows display with league-at-a-glance comparison. The user wanted
 * to see whether their roster's outlook was actually middling or
 * just rendered as middling because the calibration was compressed.
 */

import type { LeagueSnapshot } from "../league-state/snapshot";
import {
  scoreWinNowFor,
  scoreFutureValueFor,
} from "../windows/compute";
import { computeContenderForecast } from "../contender-outlook/forecast";
import {
  tierForScore,
  type ContenderTier,
  type ContenderYear,
} from "../contender-outlook/types";

export type LeagueOutlookTeam = {
  roster_id: number;
  owner_name: string | null;
  is_me: boolean;
  // Snapshot stats for the table view.
  position_counts: Record<string, number>;
  avg_age: number | null;
  player_ids_count: number;
  // Window scores 0-100 for the current state.
  win_now: number;
  future: number;
  // 5-year contender forecast per season.
  forecast: ContenderYear[];
  // Peak forecast year + tier (drives the table sparkline interpretation).
  peak_year: string;
  peak_score: number;
  peak_tier: ContenderTier;
  // Trajectory shape: rising / peaking / declining / flat. Cheap label
  // for the table column.
  trajectory: "rising" | "peaking" | "declining" | "flat";
};

export type LeagueOutlook = {
  teams: LeagueOutlookTeam[];
  // League-wide stats so charts can mark medians, ranges, etc.
  median_win_now: number;
  median_future: number;
  range_win_now: { min: number; max: number };
  range_future: { min: number; max: number };
};

function classifyTrajectory(years: ContenderYear[]): LeagueOutlookTeam["trajectory"] {
  if (years.length < 2) return "flat";
  const first = years[0].score;
  const last = years[years.length - 1].score;
  const peakIdx = years.reduce(
    (best, y, i) => (y.score > years[best].score ? i : best),
    0,
  );
  const peak = years[peakIdx].score;
  // Rising: end higher than start by a meaningful margin.
  if (last - first >= 8) return "rising";
  // Declining: start higher than end by a meaningful margin.
  if (first - last >= 8) return "declining";
  // Peaking: peak occurs in the middle, not the ends, and is materially
  // higher than the endpoints.
  if (
    peakIdx > 0 &&
    peakIdx < years.length - 1 &&
    peak - Math.max(first, last) >= 5
  ) {
    return "peaking";
  }
  return "flat";
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export async function computeLeagueOutlook(
  snap: LeagueSnapshot,
): Promise<LeagueOutlook> {
  const teams: LeagueOutlookTeam[] = [];

  // Iterate sequentially because computeContenderForecast hits the
  // player cache; concurrent runs across all rosters can pile cache
  // misses. Linear is fine: 12 rosters × small per-roster work.
  for (const r of snap.rosters) {
    const winNow = scoreWinNowFor(snap, r);
    const future = scoreFutureValueFor(snap, r);
    let forecast: ContenderYear[] = [];
    try {
      forecast = await computeContenderForecast(snap, r);
    } catch (err) {
      console.error("[league-outlook:forecast]", r.roster_id, err);
    }
    const peak =
      forecast.length === 0
        ? { season: snap.season, score: winNow.score, tier: tierForScore(winNow.score) }
        : forecast.reduce(
            (best, y) => (y.score > best.score ? y : best),
            forecast[0],
          );
    teams.push({
      roster_id: r.roster_id,
      owner_name: r.owner_name,
      is_me: r.is_me,
      position_counts: r.position_counts,
      avg_age: r.avg_age,
      player_ids_count: r.player_ids.length,
      win_now: winNow.score,
      future: future.score,
      forecast,
      peak_year: peak.season,
      peak_score: peak.score,
      peak_tier: peak.tier,
      trajectory: classifyTrajectory(forecast),
    });
  }

  const winNows = teams.map((t) => t.win_now);
  const futures = teams.map((t) => t.future);
  return {
    teams,
    median_win_now: median(winNows),
    median_future: median(futures),
    range_win_now: {
      min: Math.min(...winNows),
      max: Math.max(...winNows),
    },
    range_future: {
      min: Math.min(...futures),
      max: Math.max(...futures),
    },
  };
}
