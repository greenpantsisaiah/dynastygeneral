/**
 * Build InflectionInputs from a HumanPlayer plus roster context.
 *
 * Phase 1 limitations (deliberately honest, surfaced as data_missing
 * in the resolver):
 *   - career_carries / career_targets: not yet plumbed from outcome data
 *   - prev_season usage: not yet plumbed (would require last-season
 *     historical_outcomes join at context-build time)
 *   - draft_pick_overall: Sleeper player metadata has it but we don't
 *     yet thread it through HumanPlayer
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
