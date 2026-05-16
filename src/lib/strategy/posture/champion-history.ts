/**
 * Champion history reader. Walks the league.previous_league_id chain
 * backwards, fetches each prior league's winners_bracket + rosters,
 * and identifies whether the current user was champion in each prior
 * season.
 *
 * Quality caveat: Sleeper's winners_bracket field is reliably populated
 * for completed playoffs but may be empty for ongoing seasons,
 * preseason chains, or leagues that disable playoffs. The reader
 * silently skips seasons it can't resolve.
 *
 * Per founder direction 2026-05-16: try detection (option A) and see
 * how the quality holds up; fallback degrades gracefully.
 */

import {
  getLeague,
  getRosters,
  getWinnersBracket,
} from "@/lib/sleeper/client";
import type { ChampionHistory, ChampionHistoryEntry } from "./types";

/** Walk at most this many prior leagues back through previous_league_id. */
const MAX_SEASONS_BACK = 3;

/**
 * Find the championship match in a Sleeper winners_bracket. The bracket
 * is an array of match entries; the final match is the one with the
 * highest round `r` and `p === 1` (place=1, championship). Returns the
 * winner roster_id or null when no championship has been resolved.
 */
function findChampionRosterId(
  bracket: Array<{
    r?: number | null;
    p?: number | null;
    w?: number | null;
  }>,
): number | null {
  if (bracket.length === 0) return null;
  // Prefer the explicit championship match (p === 1) when present.
  const explicit = bracket.find(
    (e) => e.p === 1 && typeof e.w === "number",
  );
  if (explicit && typeof explicit.w === "number") return explicit.w;
  // Fallback: the highest-round match with a recorded winner.
  let maxRound = -Infinity;
  let champion: number | null = null;
  for (const e of bracket) {
    if (typeof e.r !== "number") continue;
    if (typeof e.w !== "number") continue;
    if (e.r > maxRound) {
      maxRound = e.r;
      champion = e.w;
    }
  }
  return champion;
}

export async function readChampionHistory(args: {
  /** Current league id (the active hub). */
  leagueId: string;
  /** The current user's sleeper user_id. */
  userOwnerId: string;
}): Promise<ChampionHistory> {
  const seasons: ChampionHistoryEntry[] = [];
  let lastChampionshipSeason: string | null = null;
  let cursor: string | null = null;

  // Walk to the IMMEDIATELY-prior league first (we don't need to check
  // the current season; playoffs haven't finished if we're still here).
  try {
    const current = await getLeague(args.leagueId);
    cursor = current?.previous_league_id ?? null;
  } catch {
    cursor = null;
  }

  let visited = 0;
  while (cursor && visited < MAX_SEASONS_BACK) {
    visited += 1;
    let priorLeagueId: string = cursor;
    let nextCursor: string | null = null;
    try {
      const [priorLeague, rosters, bracket] = await Promise.all([
        getLeague(priorLeagueId),
        getRosters(priorLeagueId),
        getWinnersBracket(priorLeagueId),
      ]);
      if (!priorLeague) break;
      nextCursor = priorLeague.previous_league_id ?? null;

      const championRosterId = findChampionRosterId(bracket);
      let championOwnerId: string | null = null;
      let wasMe = false;
      if (championRosterId != null) {
        const championRoster = rosters.find(
          (r) => r.roster_id === championRosterId,
        );
        championOwnerId = championRoster?.owner_id ?? null;
        wasMe =
          championOwnerId != null && championOwnerId === args.userOwnerId;
        // Also check co_owners; a co-owned championship still counts.
        if (!wasMe && championRoster?.co_owners) {
          wasMe = championRoster.co_owners.includes(args.userOwnerId);
        }
      }

      seasons.push({
        season: priorLeague.season,
        was_me: wasMe,
        champion_roster_id: championRosterId,
        champion_owner_id: championOwnerId,
      });
      if (wasMe && !lastChampionshipSeason) {
        lastChampionshipSeason = priorLeague.season;
      }
    } catch (err) {
      console.error("[champion-history]", priorLeagueId, err);
      // Swallow per-league failures; keep walking the chain.
    }
    cursor = nextCursor;
  }

  return { seasons, last_championship_season: lastChampionshipSeason };
}
