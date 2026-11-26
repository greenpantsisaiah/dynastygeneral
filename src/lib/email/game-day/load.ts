/**
 * Fetches everything the Sunday lineup panel reads for one Sleeper user:
 * leagues, rosters, users, this season's matchups, player meta and the
 * week's kickoffs. A league that fails to load is listed as not read,
 * never silently dropped.
 */

import { getLeagueUsers, getLeaguesForUser, getRosters, getUserByUsername } from "@/lib/sleeper";
import { resolvePlayers } from "@/lib/players/cache";
import { fetchSeasonMatchups, playoffSettings } from "@/lib/strategy/verdict/load";
import { buildLeagueLineup, type LeagueLineup, type LineupPanel } from "./lineup";
import { fetchNflSchedule, type WeekSchedule } from "./schedule";

export async function loadLineupPanel(args: {
  username: string;
  season: string;
  week: number;
  now: Date;
  /** Pre-loaded kickoffs (offline renders); fetched from nflverse when absent. */
  schedule?: WeekSchedule | null;
  logTag: string;
}): Promise<{ panel: LineupPanel; userNames: string[] } | { error: string }> {
  const su = await getUserByUsername(args.username);
  if (!su) return { error: "Sleeper user not found" };
  const schedule = args.schedule ?? (await fetchNflSchedule(args.season, args.week));
  if (!schedule) return { error: "NFL schedule unavailable" };
  const leagues: LeagueLineup[] = [];
  const skipped: LineupPanel["skipped"] = [];
  const userNames = new Set<string>();
  for (const lg of await getLeaguesForUser(su.user_id, args.season)) {
    const name = lg.name.trim();
    userNames.add(name);
    try {
      const [rosters, users, matchupsByWeek] = await Promise.all([getRosters(lg.league_id), getLeagueUsers(lg.league_id), fetchSeasonMatchups(lg)]);
      for (const u of users) if (u.display_name) userNames.add(u.display_name);
      const ids = new Set<string>();
      for (const r of rosters) for (const id of (r.players as string[] | undefined) ?? []) ids.add(id);
      const players = await resolvePlayers([...ids]);
      for (const p of players.values()) {
        const n = (p as Record<string, unknown>).full_name;
        if (typeof n === "string" && n) userNames.add(n);
      }
      const ps = playoffSettings(lg);
      const res = buildLeagueLineup({
        input: { league: lg, rosters, users, matchupsByWeek },
        sleeperUserId: su.user_id,
        week: args.week,
        schedule,
        players,
        now: args.now,
        ...ps,
      });
      if ("skip" in res) skipped.push({ leagueName: name, reason: res.skip });
      else leagues.push(res);
    } catch (err) {
      console.error(`[${args.logTag}:league]`, lg.league_id, err instanceof Error ? `${err.message}\n${err.stack}` : err);
      skipped.push({ leagueName: name, reason: "could not load" });
    }
  }
  return { panel: { week: args.week, leagues, skipped }, userNames: [...userNames] };
}
