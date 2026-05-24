/**
 * Build InflectionInputs from a HumanPlayer plus roster context.
 *
 * Remaining limitations (deliberately honest, surfaced as data_missing
 * in the resolver):
 *   - prev_season / prev_prev_season carries + targets: PLUMBED
 *     (2026-05-23) from the free Sleeper /stats endpoint (rush_att /
 *     rec_tgt) via `buildInflectionsFromSnapshot`, keyed by Sleeper
 *     player_id. Lights up the workload-trend signal on the hub + Coach.
 *   - career_carries / career_targets: PLUMBED (2026-05-24) via
 *     getCareerUsage (a bounded multi-season sum of the same Sleeper
 *     /stats), gated on rosterHasAgingRb so only aging-RB rosters pay
 *     the fetch. Lights up the mileage signal + the 1500-carry RB cliff
 *     trigger. Phase 3 ingestion supersedes it with stored values.
 *   - draft_pick_overall: NOT in the Sleeper players blob. Verified
 *     2026-05-23 against api.sleeper.app/v1/players/nfl: metadata
 *     carries only channel_id / genius_id / rookie_year, no NFL draft
 *     position. Filling this needs an external draft-capital source
 *     (the Phase 3 acquisition track), not a HumanPlayer thread-through.
 *   - compounding_news_count: only present for RBs we extracted
 *
 * The architecture is right; the data plumbing fills in over v2.
 */

import type { HumanPlayer } from "@/lib/players/cache";
import type { Position } from "../../strategy/archetypes/schema";
import type { InflectionInputs } from "./types";

const SKILL_POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

export function buildInflectionInputsFromHumanPlayer(args: {
  player: HumanPlayer;
  // Other players on the same NFL team at the same position. Used to
  // detect successor / position-room saturation signals.
  sameTeamSamePosition: HumanPlayer[];
  draftPickOverall?: number | null;
  careerCarries?: number | null;
  careerTargets?: number | null;
  prevSeasonCarries?: number | null;
  prevSeasonTargets?: number | null;
  prevPrevSeasonCarries?: number | null;
  prevPrevSeasonTargets?: number | null;
  compoundingNewsCount?: number | null;
}): InflectionInputs | null {
  const { player } = args;
  const positionRaw = (player.position ?? "").toUpperCase();
  if (!SKILL_POSITIONS.includes(positionRaw as Position)) return null;

  return {
    player_id: player.id,
    player_name: player.name,
    position: positionRaw as Position,
    age: player.age,
    years_exp: player.yearsExp,
    team: player.team,
    career_carries: args.careerCarries ?? null,
    career_targets: args.careerTargets ?? null,
    prev_season_carries: args.prevSeasonCarries ?? null,
    prev_season_targets: args.prevSeasonTargets ?? null,
    prev_prev_season_carries: args.prevPrevSeasonCarries ?? null,
    prev_prev_season_targets: args.prevPrevSeasonTargets ?? null,
    same_team_same_position: args.sameTeamSamePosition.map((p) => ({
      player_id: p.id,
      age: p.age,
      years_exp: p.yearsExp,
      is_rookie: p.yearsExp === 0,
    })),
    draft_pick_overall: args.draftPickOverall ?? null,
    compounding_news_count: args.compoundingNewsCount ?? null,
  };
}

/**
 * Group a roster of HumanPlayers by (team, position). Used to compute
 * sameTeamSamePosition cheaply.
 */
export function groupRosterByTeamPosition(
  allPlayers: HumanPlayer[],
): Map<string, HumanPlayer[]> {
  const out = new Map<string, HumanPlayer[]>();
  for (const p of allPlayers) {
    if (!p.team || !p.position) continue;
    const key = `${p.team}:${p.position.toUpperCase()}`;
    const existing = out.get(key);
    if (existing) existing.push(p);
    else out.set(key, [p]);
  }
  return out;
}
