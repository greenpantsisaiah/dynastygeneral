/**
 * Builds the weekly brief's per-league content for one Sleeper username.
 * The ONE path the send cron, the admin preview route and the offline
 * snapshot render use, so a preview shows exactly what the cron would
 * send. Every league the user is in is built; there is no league cap
 * (BUILD_SPEC PR 1: "Every league the user is in, no cap").
 */

import { getLeagueUsers, getLeaguesForUser, getRosters, getUserByUsername } from "@/lib/sleeper";
import type { SleeperLeague } from "@/lib/sleeper/schemas";
import { resolveDraftState } from "@/lib/sleeper/draft-state";
import { resolvePlayers } from "@/lib/players/cache";
import { buildLeagueContext } from "@/lib/engine/league-context";
import { fetchSeasonMatchups, loadContendOrSellVerdict, playoffSettings } from "@/lib/strategy/verdict/load";
import { lastCompletedWeek } from "@/lib/strategy/verdict/weeks";
import { buildLeagueWeek } from "@/lib/email/trade-desk/league-week";
import type { DeskLeague, LeagueKind } from "@/lib/email/trade-desk/model";

export function leagueKind(lg: SleeperLeague): LeagueKind {
  const s = (lg.settings ?? {}) as Record<string, unknown>;
  if (s.best_ball === 1) return "best_ball";
  return s.type === 2 ? "dynasty" : s.type === 1 ? "keeper" : "redraft";
}

export interface BriefBuild {
  leagues: DeskLeague[];
  /** Latest week with final scores, the same across leagues (lastCompletedWeek). */
  resultsWeek: number;
}

export async function buildBriefLeagues(args: {
  username: string;
  season: string;
  nflWeek: number;
  seasonType: string;
  /** Tag for error logs (cron vs preview). */
  logTag: string;
  now?: Date;
}): Promise<BriefBuild> {
  const leagues: DeskLeague[] = [];
  let resultsWeek = args.nflWeek - 1;
  const su = await getUserByUsername(args.username);
  if (!su) return { leagues, resultsWeek };
  const all = await getLeaguesForUser(su.user_id, args.season);
  for (const lg of all) {
    const base = { leagueId: lg.league_id, leagueName: lg.name.trim(), kind: leagueKind(lg) };
    try {
      const [rosters, users, draftState, matchupsByWeek] = await Promise.all([
        getRosters(lg.league_id),
        getLeagueUsers(lg.league_id),
        resolveDraftState(lg.league_id, su.user_id),
        fetchSeasonMatchups(lg),
      ]);
      resultsWeek = lastCompletedWeek({ nflWeek: args.nflWeek, matchupsByWeek, now: args.now });
      const ctx = await buildLeagueContext({ league: lg, rosters, users, draftState, mySleeperUserId: su.user_id });
      const res = await loadContendOrSellVerdict({
        league: lg,
        snapshot: ctx.snapshot,
        nflWeek: args.nflWeek,
        seasonType: args.seasonType,
        playerValuesById: ctx.pricedPool.playerValuesById,
        matchupsByWeek,
        resultsWeek,
      });
      const { playoffWeekStart, playoffTeams } = playoffSettings(lg);
      const resultRows = matchupsByWeek[resultsWeek] ?? [];
      const players = await resolvePlayers(ctx.snapshot.rosters.flatMap((r) => r.player_ids));
      const week =
        args.seasonType === "regular" && resultsWeek >= 1 && resultsWeek < playoffWeekStart
          ? buildLeagueWeek({
              rosters: ctx.snapshot.rosters.map((r) => ({
                roster_id: r.roster_id,
                manager: r.owner_name ?? `Roster ${r.roster_id}`,
                is_me: r.is_me,
                player_ids: r.player_ids,
                starters: resultRows.find((m) => m.roster_id === r.roster_id)?.starters ?? [],
              })),
              matchupsByWeek,
              resultsWeek,
              playoffWeekStart,
              playoffTeams,
              bestBall: base.kind === "best_ball",
              players,
              valueById: ctx.pricedPool.playerValuesById,
            })
          : null;
      leagues.push({
        ...base,
        verdict: res.ok ? res.verdict : null,
        week,
        note: res.ok ? undefined : `No read this week: ${res.reason}.`,
      });
    } catch (err) {
      console.error(`[${args.logTag}:league]`, lg.league_id, err instanceof Error ? `${err.message}\n${err.stack}` : err);
      // A league that failed to build is still explained, never silently dropped.
      leagues.push({ ...base, verdict: null, week: null, note: "Could not load this league this week." });
    }
  }
  return { leagues, resultsWeek };
}

/** Greeting name: never anything that looks like an email address. */
export function briefOwnerName(displayName: string | null | undefined, username: string | null | undefined): string {
  return [displayName, username].find((n): n is string => !!n && !n.includes("@")) ?? "";
}
