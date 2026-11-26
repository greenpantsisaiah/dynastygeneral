/**
 * Adapters from Sleeper matchups to the season simulator and to a
 * player's started-points contribution. Pure; callers fetch matchups via
 * getMatchups (src/lib/sleeper/client.ts) and pass them in.
 *
 * Sleeper's matchup rows carry `starters`, `players`, `starters_points`
 * and `players_points` (passthrough fields on sleeperMatchupSchema). Weeks
 * that have not been played come back with the schedule (matchup_id) and
 * zero points, which is how the remaining schedule is read.
 */

import type { SleeperMatchup } from "@/lib/sleeper/schemas";
import type { SimInput, SimTeam } from "./season-sim";

export interface SleeperSimArgs {
  rosterIds: number[];
  /** Matchup rows by week, for every regular-season week fetched. */
  matchupsByWeek: Record<number, SleeperMatchup[]>;
  /** Weeks strictly before this are final and scored; this week onward is remaining. */
  firstUnplayedWeek: number;
  /** league.settings.playoff_week_start; the regular season ends the week before. */
  playoffWeekStart: number;
  /** league.settings.playoff_teams (Sleeper default 6). */
  playoffTeams: number;
  /**
   * league.settings.league_average_match === 1: every roster also plays the
   * league median each week (a win for a score above it, a loss below).
   * Sleeper folds those games into roster.settings.wins / losses, so a
   * 11-week season reads 11-11, not 5-6. Off by default.
   */
  medianGame?: boolean;
}

/**
 * The median game for one finished week: win above the league median, loss
 * below, tie on it. With an even field this is the top half winning, which
 * is how Sleeper scores league_average_match. Exported for the tests.
 */
export function medianResults(points: Map<number, number>): Map<number, "W" | "L" | "T"> {
  const vals = [...points.values()].sort((a, b) => a - b);
  const out = new Map<number, "W" | "L" | "T">();
  if (vals.length < 2) return out;
  const mid = Math.floor(vals.length / 2);
  const median = vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
  for (const [id, p] of points) out.set(id, p > median ? "W" : p < median ? "L" : "T");
  return out;
}

function pairs(rows: SleeperMatchup[]): Array<[number, number]> {
  const byMatch = new Map<number, number[]>();
  for (const r of rows) {
    if (r.matchup_id == null) continue;
    const list = byMatch.get(r.matchup_id) ?? [];
    list.push(r.roster_id);
    byMatch.set(r.matchup_id, list);
  }
  const out: Array<[number, number]> = [];
  for (const list of byMatch.values()) if (list.length === 2) out.push([list[0], list[1]]);
  return out;
}

export function buildSimInputFromSleeper(args: SleeperSimArgs): SimInput {
  const teams = new Map<number, SimTeam>(
    args.rosterIds.map((id) => [id, { roster_id: id, wins: 0, losses: 0, ties: 0, points_for: 0 }]),
  );
  const scored: Record<number, number[]> = {};
  for (const id of args.rosterIds) scored[id] = [];
  const remaining: SimInput["remaining"] = [];

  for (let week = 1; week < args.playoffWeekStart; week++) {
    const rows = args.matchupsByWeek[week];
    if (!rows || rows.length === 0) continue;
    if (week >= args.firstUnplayedWeek) {
      remaining.push(pairs(rows));
      continue;
    }
    const pts = new Map(rows.map((r) => [r.roster_id, r.points ?? 0]));
    for (const r of rows) {
      if (!teams.has(r.roster_id)) continue;
      const p = r.points ?? 0;
      scored[r.roster_id].push(p);
      teams.get(r.roster_id)!.points_for += p;
    }
    if (args.medianGame) {
      const weekPts = new Map<number, number>();
      for (const r of rows) if (teams.has(r.roster_id)) weekPts.set(r.roster_id, r.points ?? 0);
      for (const [id, res] of medianResults(weekPts)) {
        const t = teams.get(id)!;
        if (res === "W") t.wins++;
        else if (res === "L") t.losses++;
        else t.ties++;
      }
    }
    for (const [a, b] of pairs(rows)) {
      const ta = teams.get(a);
      const tb = teams.get(b);
      if (!ta || !tb) continue;
      const pa = pts.get(a) ?? 0;
      const pb = pts.get(b) ?? 0;
      if (pa > pb) {
        ta.wins++;
        tb.losses++;
      } else if (pb > pa) {
        tb.wins++;
        ta.losses++;
      } else {
        ta.ties++;
        tb.ties++;
      }
    }
  }
  return {
    teams: [...teams.values()],
    scored,
    remaining,
    playoffTeams: args.playoffTeams,
    medianGame: args.medianGame === true,
  };
}

function pointsMap(row: SleeperMatchup): Record<string, number> {
  const raw = (row as Record<string, unknown>).players_points;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export interface StartedPoints {
  player_id: string;
  weeks_started: number;
  ppg_started: number | null;
}

/** Average points a player scored in the weeks this roster started him. */
export function startedPoints(
  matchupsByWeek: Record<number, SleeperMatchup[]>,
  rosterId: number,
  playerId: string,
  firstUnplayedWeek: number,
): StartedPoints {
  let total = 0;
  let n = 0;
  for (const [wk, rows] of Object.entries(matchupsByWeek)) {
    if (Number(wk) >= firstUnplayedWeek) continue;
    const row = rows.find((r) => r.roster_id === rosterId);
    if (!row || !(row.starters ?? []).includes(playerId)) continue;
    total += pointsMap(row)[playerId] ?? 0;
    n++;
  }
  return { player_id: playerId, weeks_started: n, ppg_started: n > 0 ? total / n : null };
}

/**
 * Best weekly average among the roster's other players at a position, a
 * stand-in for who starts if the player is sold. Counts every scored week
 * the replacement was on the roster, started or benched.
 */
export function replacementPpg(
  matchupsByWeek: Record<number, SleeperMatchup[]>,
  rosterId: number,
  candidateIds: string[],
  firstUnplayedWeek: number,
): { player_id: string | null; ppg: number } {
  let best: { player_id: string | null; ppg: number } = { player_id: null, ppg: 0 };
  for (const id of candidateIds) {
    let total = 0;
    let n = 0;
    for (const [wk, rows] of Object.entries(matchupsByWeek)) {
      if (Number(wk) >= firstUnplayedWeek) continue;
      const row = rows.find((r) => r.roster_id === rosterId);
      if (!row || !(row.players ?? []).includes(id)) continue;
      total += pointsMap(row)[id] ?? 0;
      n++;
    }
    const ppg = n > 0 ? total / n : 0;
    if (ppg > best.ppg) best = { player_id: id, ppg };
  }
  return best;
}
