import { getProjections } from "@/lib/players/projections";
import { getSeasonStats } from "@/lib/players/season-stats";
import { buildLeagueSnapshot } from "./snapshot";

type BuildStrategySnapshotArgs = Omit<
  Parameters<typeof buildLeagueSnapshot>[0],
  "lastSeasonStats" | "projections"
>;

/**
 * Build the canonical strategy snapshot used by both Hub and Coach.
 * This keeps starter-talent inputs aligned by always enriching with:
 *   - previous-season production (getSeasonStats)
 *   - current-season redraft ADP projections (getProjections)
 */
export async function buildStrategySnapshot(
  args: BuildStrategySnapshotArgs,
): Promise<Awaited<ReturnType<typeof buildLeagueSnapshot>>> {
  const prevSeason = String(Number(args.league.season) - 1);
  const [lastSeasonStats, projectionsCache] = await Promise.all([
    getSeasonStats(prevSeason).catch(() => new Map()),
    getProjections(args.league.season).catch(() => ({
      byPlayerId: new Map(),
      fetchedAt: 0,
    })),
  ]);
  return buildLeagueSnapshot({
    ...args,
    lastSeasonStats,
    projections: projectionsCache.byPlayerId,
  });
}
