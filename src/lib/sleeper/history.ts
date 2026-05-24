/**
 * Walks the previous_league_id chain to surface a user's prior-season
 * record + roster shape. Read-only, cached aggressively (prior seasons
 * don't change once they're over), and bounded so a long dynasty league
 * doesn't fan out into 8 years of fetches.
 *
 * Used by the scout verdict so it can say things like "you won 2024
 * with Bijan + Hill leading the way" instead of stumbling over the
 * "I can't see prior seasons" disclaimer.
 */

import {
  getLeague,
  getRosters,
  getLeagueUsers,
  type SleeperLeague,
  type SleeperRoster,
  type SleeperLeagueUser,
} from "@/lib/sleeper";
import { resolvePlayers } from "@/lib/players/cache";
import { isRosterOwnedBy } from "./roster-identity";

export type PriorSeasonSummary = {
  season: string;
  league_id: string;
  league_name: string;
  // The user's record that year, if records are present on the roster.
  record: { wins: number; losses: number; ties: number } | null;
  // Final standings rank within league. Sleeper exposes this via
  // settings.rank when the season is concluded; null if unavailable.
  final_rank: number | null;
  total_rosters: number;
  // Top 3 players the user had on roster at season end (by Sleeper
  // search_rank). For dynasty narratives like "you had Hill + Bijan."
  // Empty when the player cache can't resolve any of the ids.
  top_players: Array<{ name: string; position: string | null }>;
};

const MAX_DEPTH = 3; // walk back at most 3 seasons

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Walk back from `currentLeagueId` through `previous_league_id`,
 * collecting prior-season summaries for the user identified by
 * `mySleeperUserId`. Returns at most MAX_DEPTH entries, most recent
 * first. Best-effort: any failed fetch in the chain stops the walk
 * (we return what we got rather than throwing).
 */
export async function walkLeagueHistory(args: {
  currentLeagueId: string;
  mySleeperUserId: string | null;
  depth?: number;
}): Promise<PriorSeasonSummary[]> {
  const { currentLeagueId, mySleeperUserId } = args;
  const depth = Math.min(args.depth ?? MAX_DEPTH, MAX_DEPTH);
  if (!mySleeperUserId || depth <= 0) return [];

  // Start by fetching the current league JUST to get its
  // previous_league_id pointer. We don't include the current season
  // in the output (the scout already has that data live).
  const currentLeague = await getLeague(currentLeagueId);
  if (!currentLeague) return [];

  let nextId = currentLeague.previous_league_id ?? null;
  const out: PriorSeasonSummary[] = [];

  for (let i = 0; i < depth && nextId; i++) {
    const summary = await fetchSeasonSummary(nextId, mySleeperUserId);
    if (!summary) break;
    out.push(summary.summary);
    nextId = summary.previous_league_id;
  }

  return out;
}

async function fetchSeasonSummary(
  leagueId: string,
  mySleeperUserId: string,
): Promise<{
  summary: PriorSeasonSummary;
  previous_league_id: string | null;
} | null> {
  let league: SleeperLeague | null;
  let rosters: SleeperRoster[];
  let users: SleeperLeagueUser[];
  try {
    [league, rosters, users] = await Promise.all([
      getLeague(leagueId),
      getRosters(leagueId),
      getLeagueUsers(leagueId),
    ]);
  } catch (err) {
    console.error("[history:fetch]", leagueId, err);
    return null;
  }
  if (!league) return null;
  // Find the user's roster (handles co-ownership via the canonical).
  const myRoster = rosters.find((r) => isRosterOwnedBy(r, mySleeperUserId));
  // Even if we can't find the user's roster, return a thin summary so
  // the verdict knows the league existed (orphaned ownership is real).
  const settings = (myRoster?.settings ?? {}) as Record<string, unknown>;
  const wins = num(settings.wins);
  const losses = num(settings.losses);
  const ties = num(settings.ties);
  const record = wins + losses + ties > 0 ? { wins, losses, ties } : null;

  // final_rank: settings.rank in Sleeper (1 = champion). Null when
  // playoffs haven't been played or the data isn't there.
  const rankRaw = settings.rank;
  const final_rank =
    typeof rankRaw === "number" && rankRaw > 0 ? rankRaw : null;

  const top_players = await topPlayersFromRoster(myRoster);

  // Resolve the user's display_name as it was in this league (used
  // only for narrative; not surfaced today but kept for future).
  void users;

  return {
    summary: {
      season: league.season,
      league_id: leagueId,
      league_name: league.name,
      record,
      final_rank,
      total_rosters: league.total_rosters ?? rosters.length ?? 0,
      top_players,
    },
    previous_league_id: league.previous_league_id ?? null,
  };
}

async function topPlayersFromRoster(
  roster: SleeperRoster | undefined,
): Promise<Array<{ name: string; position: string | null }>> {
  if (!roster) return [];
  const ids = (roster.players ?? []).filter(
    (id): id is string => typeof id === "string",
  );
  if (ids.length === 0) return [];
  const map = await resolvePlayers(ids);
  const ranked = Array.from(map.values())
    .filter((p) => typeof p.search_rank === "number" && p.search_rank > 0)
    .sort(
      (a, b) =>
        (a.search_rank ?? 9999) - (b.search_rank ?? 9999),
    )
    .slice(0, 3);
  return ranked.map((p) => ({
    name:
      p.full_name ??
      [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ??
      p.player_id,
    position: p.position ?? null,
  }));
}
