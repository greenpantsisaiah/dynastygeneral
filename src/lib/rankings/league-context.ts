/**
 * League-context loader for the public /rankings page. Returns the
 * signed-in user's selected dynasty league plus the player ids on
 * their roster, so the rankings table can flag "MINE" badges and
 * filter to "my players only."
 *
 * Auto-pick logic: if URL ?league=<id> resolves to a real dynasty
 * league for the user, use it. Otherwise pick the first dynasty
 * league returned by Sleeper. Anonymous users (or signed-in users
 * without sleeper_username on file) get no league context; the
 * rankings page falls back to its public-mode behavior.
 *
 * The loader is intentionally lightweight: it fetches the leagues
 * list + the chosen league's rosters in parallel. No snapshot pipeline
 * is run; the /rankings page does not need archetype / window / lane
 * outputs for this surface.
 */

import {
  getLeaguesForUser,
  getNflState,
  getRosters,
  getLeagueUsers,
  isDynastyLeague,
  type SleeperLeague,
} from "@/lib/sleeper";
import { createClient } from "@/lib/supabase/server";
import { resolveDraftState } from "@/lib/sleeper/draft-state";

export type RankingsLeagueOption = {
  league_id: string;
  name: string;
  season: string;
  total_rosters: number;
  is_superflex: boolean;
};

export type RankingsLeagueContext = {
  /** All dynasty leagues for the user, sorted with newest season first. */
  options: RankingsLeagueOption[];
  /** The league currently in scope (URL ?league=<id> or auto-picked). */
  selected: RankingsLeagueOption;
  /** Player ids on the user's roster within the selected league. */
  myPlayerIds: Set<string>;
  /** Player ids on any opponent roster in the selected league. */
  drafted: Set<string>;
};

export async function loadRankingsLeagueContext(args: {
  userId: string;
  requestedLeagueId: string | null;
}): Promise<RankingsLeagueContext | null> {
  try {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("sleeper_user_id, sleeper_username")
      .eq("id", args.userId)
      .maybeSingle();
    const sleeperUserId =
      (profile?.sleeper_user_id as string | null) ?? null;
    if (!sleeperUserId) return null;

    const nflState = await getNflState().catch(() => null);
    const season = nflState?.season ?? String(new Date().getFullYear());

    const live = await getLeaguesForUser(sleeperUserId, season).catch(
      () => [] as SleeperLeague[],
    );
    const dynastyLeagues = live.filter(isDynastyLeague);
    if (dynastyLeagues.length === 0) return null;

    const options: RankingsLeagueOption[] = dynastyLeagues.map((l) => ({
      league_id: l.league_id,
      name: l.name ?? "Untitled league",
      season: l.season,
      total_rosters: l.total_rosters ?? 12,
      is_superflex: Array.isArray(l.roster_positions)
        ? l.roster_positions.includes("SUPER_FLEX")
        : false,
    }));

    const selected =
      options.find((o) => o.league_id === args.requestedLeagueId) ??
      options[0];

    // Pull rosters + the draft state so we know which players belong
    // to the user RIGHT NOW. During active drafts roster.players can
    // be empty; picks_made is authoritative.
    const [rosters, users, draftState] = await Promise.all([
      getRosters(selected.league_id),
      getLeagueUsers(selected.league_id),
      resolveDraftState(selected.league_id, sleeperUserId).catch(() => null),
    ]);

    // Map Sleeper user_id to roster_id via league users.
    const myUserSlot = users.find((u) => u.user_id === sleeperUserId);
    const myRosterId = myUserSlot
      ? rosters.find(
          (r) =>
            r.owner_id === sleeperUserId ||
            r.co_owners?.includes(sleeperUserId),
        )?.roster_id ?? null
      : null;

    const myPlayerIds = new Set<string>();
    const drafted = new Set<string>();
    for (const r of rosters) {
      const isMine = r.roster_id === myRosterId;
      for (const pid of r.players ?? []) {
        if (!pid) continue;
        drafted.add(pid);
        if (isMine) myPlayerIds.add(pid);
      }
    }
    if (draftState?.picks_so_far) {
      for (const pick of draftState.picks_so_far) {
        if (!pick.player_id) continue;
        drafted.add(pick.player_id);
        if (pick.roster_id === myRosterId) myPlayerIds.add(pick.player_id);
      }
    }

    return { options, selected, myPlayerIds, drafted };
  } catch (err) {
    console.error("[rankings:league-context]", err);
    return null;
  }
}
