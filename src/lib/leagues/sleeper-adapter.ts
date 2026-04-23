/**
 * Sleeper PlatformAdapter. Wraps the existing `lib/sleeper/*` fetchers.
 * Does not introduce new behavior; this is the strangler-fig seam that
 * future consumers will use instead of importing Sleeper directly.
 *
 * Existing consumers continue to import lib/sleeper directly during the
 * migration period. New surfaces and the consumer migration happen
 * incrementally (see docs/MULTI_PLATFORM.md).
 */

import {
  getLeague,
  getLeaguesForUser,
  getLeagueUsers,
  getRosters,
  getUserByUsername,
  isDynastyLeague,
} from "@/lib/sleeper";
import { resolveDraftState } from "@/lib/sleeper/draft-state";
import { buildLeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type { PlatformAdapter } from "./adapter";
import type { UnifiedLeagueSummary, UnifiedUser } from "./types";

function detectFormat(
  positions: string[] | null | undefined,
): "1qb" | "2qb" | "superflex" {
  const list = positions ?? [];
  if (list.includes("SUPER_FLEX")) return "superflex";
  const qbCount = list.filter((p) => p === "QB").length;
  if (qbCount >= 2) return "2qb";
  return "1qb";
}

export const sleeperAdapter: PlatformAdapter = {
  platform: "sleeper",

  async findUser(handle: string): Promise<UnifiedUser | null> {
    const cleaned = handle.trim().replace(/^@/, "");
    if (!cleaned) return null;
    const user = await getUserByUsername(cleaned);
    if (!user) return null;
    return {
      platform: "sleeper",
      platform_user_id: user.user_id,
      handle: cleaned,
      display_name: user.display_name ?? user.username ?? cleaned,
    };
  },

  async listLeagues(args: {
    user: UnifiedUser;
    season: string;
  }): Promise<UnifiedLeagueSummary[]> {
    const leagues = await getLeaguesForUser(args.user.platform_user_id, args.season);
    return leagues.map((l) => ({
      platform: "sleeper",
      platform_league_id: l.league_id,
      season: l.season,
      name: l.name,
      total_rosters: l.total_rosters ?? 0,
      status: l.status ?? null,
      format: detectFormat(l.roster_positions),
      is_dynasty: isDynastyLeague(l),
      link_params: { username: args.user.handle, season: l.season },
    }));
  },

  async buildSnapshot(args: {
    leagueId: string;
    user: UnifiedUser | null;
  }): Promise<LeagueSnapshot> {
    const userId = args.user?.platform_user_id ?? null;
    const [league, rosters, users, draftState] = await Promise.all([
      getLeague(args.leagueId),
      getRosters(args.leagueId),
      getLeagueUsers(args.leagueId),
      resolveDraftState(args.leagueId, userId),
    ]);
    if (!league) {
      throw new Error(`Sleeper league not found: ${args.leagueId}`);
    }
    return buildLeagueSnapshot({
      league,
      rosters,
      users,
      draftState,
      mySleeperUserId: userId,
    });
  },
};
