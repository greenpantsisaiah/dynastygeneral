/**
 * Builds the weekly brief's per-league content for one Sleeper username.
 * The ONE path both the send cron and the admin preview route use, so a
 * preview shows exactly what the cron would send (same leagues, same
 * verdict loader, same cap).
 */

import { getLeagueUsers, getLeaguesForUser, getRosters, getUserByUsername } from "@/lib/sleeper";
import { resolveDraftState } from "@/lib/sleeper/draft-state";
import { buildLeagueContext } from "@/lib/engine/league-context";
import { loadContendOrSellVerdict } from "@/lib/strategy/verdict/load";
import type { BriefLeague, BriefTier } from "@/lib/email/weekly-brief";

/** Leagues per brief. Pro covers more leagues (volume gate, not a feature gate). */
export const LEAGUE_CAP: Record<BriefTier, number> = { free: 3, pro: 10 };

export async function buildBriefLeagues(args: {
  username: string;
  season: string;
  nflWeek: number;
  seasonType: string;
  tier: BriefTier;
  /** Tag for error logs (cron vs preview). */
  logTag: string;
}): Promise<BriefLeague[]> {
  const leagues: BriefLeague[] = [];
  const su = await getUserByUsername(args.username);
  if (!su) return leagues;
  const all = await getLeaguesForUser(su.user_id, args.season);
  for (const lg of all.slice(0, LEAGUE_CAP[args.tier])) {
    try {
      const [rosters, users, draftState] = await Promise.all([
        getRosters(lg.league_id),
        getLeagueUsers(lg.league_id),
        resolveDraftState(lg.league_id, su.user_id),
      ]);
      const ctx = await buildLeagueContext({ league: lg, rosters, users, draftState, mySleeperUserId: su.user_id });
      const res = await loadContendOrSellVerdict({
        league: lg,
        snapshot: ctx.snapshot,
        nflWeek: args.nflWeek,
        seasonType: args.seasonType,
        playerValuesById: ctx.pricedPool.playerValuesById,
      });
      leagues.push({
        leagueId: lg.league_id,
        leagueName: lg.name,
        verdict: res.ok ? res.verdict : null,
        note: res.ok ? undefined : `No verdict this week: ${res.reason}.`,
      });
    } catch (err) {
      console.error(`[${args.logTag}:league]`, lg.league_id, err instanceof Error ? `${err.message}\n${err.stack}` : err);
    }
  }
  return leagues;
}

/** Greeting name: never anything that looks like an email address. */
export function briefOwnerName(displayName: string | null | undefined, username: string | null | undefined): string {
  return [displayName, username].find((n): n is string => !!n && !n.includes("@")) ?? "";
}
