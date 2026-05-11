/**
 * Per-player + per-roster lane scoring.
 *
 *   scorePlayerPerLane(player, snap)
 *     → Record<LaneId, number>  (full vector, 0-100 per lane)
 *
 *   aggregateRosterIdentity({ roster, playerLookup, playerValueMap, snap })
 *     → LaneMembership[]        (one per applicable lane, IN/CLOSE/NOT_IN)
 *
 * The roster aggregator filters to lanes whose `appliesTo(snap)`
 * returns true. A 1QB league won't see QB Cartel; a non-TE-premium
 * league won't see TE-Premium Lock. Both states are correct.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type {
  LaneId,
  LaneMembership,
  LaneScoreEntry,
  PlayerForLane,
} from "./types";
import { LANE_SPECS, type LaneSpec } from "./lanes";

export function scorePlayerPerLane(
  player: PlayerForLane,
  snap: LeagueSnapshot,
): Record<LaneId, number> {
  const out = {} as Record<LaneId, number>;
  for (const spec of LANE_SPECS) {
    out[spec.id] = spec.appliesTo(snap) ? spec.scorePlayer(player, snap) : 0;
  }
  return out;
}

export type PlayerValueRecord = {
  value: number;
  overall_rank: number | null;
};

export type PlayerMeta = {
  name: string;
  position: string | null;
  team: string | null;
  age: number | null;
  years_exp: number | null;
  is_rookie: boolean;
  search_rank: number;
};

export function aggregateRosterIdentity(args: {
  playerIds: readonly string[];
  playerLookup: (id: string) => PlayerMeta | null;
  playerValueMap: Map<string, PlayerValueRecord>;
  snap: LeagueSnapshot;
}): LaneMembership[] {
  const { playerIds, playerLookup, playerValueMap, snap } = args;

  const players: PlayerForLane[] = [];
  for (const id of playerIds) {
    const meta = playerLookup(id);
    if (!meta) continue;
    const vRec = playerValueMap.get(id);
    players.push({
      id,
      name: meta.name,
      position: meta.position,
      team: meta.team,
      age: meta.age,
      years_exp: meta.years_exp,
      is_rookie: meta.is_rookie,
      search_rank: meta.search_rank,
      value: vRec ? vRec.value : null,
    });
  }

  const out: LaneMembership[] = [];
  for (const spec of LANE_SPECS) {
    if (!spec.appliesTo(snap)) continue;
    const membership = computeMembership(spec, players, snap);
    out.push(membership);
  }
  return out;
}

function computeMembership(
  spec: LaneSpec,
  players: PlayerForLane[],
  snap: LeagueSnapshot,
): LaneMembership {
  const scored: LaneScoreEntry[] = [];
  for (const p of players) {
    const score = spec.scorePlayer(p, snap);
    if (score > 0) {
      scored.push({
        player_id: p.id,
        name: p.name,
        position: p.position,
        contribution: score,
      });
    }
  }
  scored.sort((a, b) => b.contribution - a.contribution);
  const topK = scored.slice(0, spec.topK);
  const aggregate = topK.reduce((s, e) => s + e.contribution, 0);

  let state: LaneMembership["state"];
  if (aggregate >= spec.inThreshold) state = "in";
  else if (aggregate >= spec.closeThreshold) state = "close";
  else state = "not_in";

  const gap =
    state === "close"
      ? spec.describeGap({
          contributors: topK,
          aggregate,
          inThreshold: spec.inThreshold,
          closeThreshold: spec.closeThreshold,
          snap,
        })
      : null;

  return {
    lane_id: spec.id,
    label: spec.label,
    blurb: spec.blurb,
    axis: spec.axis,
    state,
    aggregate_score: aggregate,
    in_threshold: spec.inThreshold,
    close_threshold: spec.closeThreshold,
    contributors: scored,
    gap,
  };
}
