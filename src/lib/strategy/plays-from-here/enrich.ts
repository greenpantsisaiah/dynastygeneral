/**
 * PlayFromHere enrichment. For plays opted-in via context_resolution,
 * compute concrete actions from the live snapshot + available pool.
 *
 * The catalog stores generic templates ("take BPA at scarcest position").
 * At render time we resolve these to specific players the user can act
 * on right now. This is the difference between "Identify which scoring
 * position is thinnest" (jargon) and "Take Trey Benson (RB-ARI, age 23).
 * your RB room is 1 below need" (action).
 */

import type { Position } from "../archetypes/schema";
import type { LeagueSnapshot } from "../league-state/snapshot";
import type {
  AvailablePlayer,
} from "@/lib/players/available";
import type {
  PlayFromHere,
  ResolvedPlayFromHere,
} from "./types";

const POSITION_LABEL: Record<Position, string> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  K: "K",
  DST: "DST",
};

function starterNeeds(snap: LeagueSnapshot): Record<Position, number> {
  const isSuperflex =
    snap.format === "superflex" || snap.format === "2qb";
  return { QB: isSuperflex ? 2 : 1, RB: 2, WR: 3, TE: 1, K: 0, DST: 0 };
}

type NeedKind =
  | { kind: "below_need"; gap: number; position: Position }
  | { kind: "depth_round"; position: Position };

// "Top need" with tiebreaker. If the user has a real starter hole,
// pick that position. If everyone is at or above need, return the
// position whose top available player has the BEST dynasty rank (so
// we surface the actually-useful depth pick, not just the alphabetically-
// first tied position).
function topNeed(
  snap: LeagueSnapshot,
  available: AvailablePlayer[],
): NeedKind | null {
  const me = snap.rosters.find((r) => r.is_me);
  if (!me) return null;
  const reqs = starterNeeds(snap);
  const positions: Position[] = ["QB", "RB", "WR", "TE"];

  // First pass: deepest gap below starter need wins.
  let bestGap: { pos: Position; gap: number } | null = null;
  for (const pos of positions) {
    const gap = reqs[pos] - me.position_counts[pos];
    if (gap <= 0) continue;
    if (bestGap == null || gap > bestGap.gap) bestGap = { pos, gap };
  }
  if (bestGap) return { kind: "below_need", gap: bestGap.gap, position: bestGap.pos };

  // No starter holes. We're in depth/lottery territory. Pick the
  // position whose top available player has the best dynasty_rank,
  // so the recommendation is actually useful instead of "thinnest"
  // by raw surplus (which can fall on a position with no good names).
  let bestPick: { pos: Position; rank: number } | null = null;
  for (const pos of positions) {
    const top = available.find(
      (p) => (p.position ?? "").toUpperCase() === pos,
    );
    if (!top) continue;
    if (bestPick == null || top.dynasty_rank < bestPick.rank) {
      bestPick = { pos, rank: top.dynasty_rank };
    }
  }
  if (!bestPick) return null;
  return { kind: "depth_round", position: bestPick.pos };
}

// "Scarcest position" = the one with the steepest drop in available
// depth. Approximation: the position with fewest players in the top N
// of the available pool. With more data we'd compute tier-break gaps.
function scarcestPosition(
  available: AvailablePlayer[],
  topN = 30,
): Position | null {
  const window = available.slice(0, topN);
  const counts: Partial<Record<Position, number>> = {};
  for (const p of window) {
    const pos = (p.position ?? "").toUpperCase() as Position;
    if (!pos) continue;
    counts[pos] = (counts[pos] ?? 0) + 1;
  }
  const positions: Position[] = ["QB", "RB", "WR", "TE"];
  let scarcest: { pos: Position; count: number } | null = null;
  for (const pos of positions) {
    const c = counts[pos] ?? 0;
    if (scarcest == null || c < scarcest.count)
      scarcest = { pos, count: c };
  }
  return scarcest?.pos ?? null;
}

function topAt(
  available: AvailablePlayer[],
  position: Position,
  n: number,
): AvailablePlayer[] {
  return available
    .filter((p) => (p.position ?? "").toUpperCase() === position)
    .slice(0, n);
}

function reasonForTarget(
  player: AvailablePlayer,
  position: Position,
  snap: LeagueSnapshot,
): string {
  const me = snap.rosters.find((r) => r.is_me);
  const reqs = starterNeeds(snap);
  const have = me?.position_counts[position] ?? 0;
  const need = reqs[position];
  const ageNote =
    player.age != null ? `age ${player.age}` : "age unknown";

  if (have < need) {
    return `Fills your ${POSITION_LABEL[position]} hole (${have}/${need} starters). ${ageNote}.`;
  }
  if (have === need) {
    return `Starter-grade depth at ${POSITION_LABEL[position]}. ${ageNote}.`;
  }
  return `Best available, ${ageNote}, ${player.team ?? "FA"}.`;
}

export function enrichPlaysFromHere(
  plays: PlayFromHere[],
  snap: LeagueSnapshot,
  available: AvailablePlayer[],
): ResolvedPlayFromHere[] {
  return plays.map((p) => {
    if (!p.context_resolution) return p;
    const cr = p.context_resolution;
    const n_players = cr.n_players ?? 2;

    let position: Position | null = null;
    let needContext: NeedKind | null = null;

    if (cr.kind === "user_top_need") {
      needContext = topNeed(snap, available);
      position = needContext?.position ?? null;
    } else if (cr.kind === "scarcest_position") {
      position = scarcestPosition(available);
    }

    if (!position) return p;

    const players = topAt(available, position, n_players);
    if (players.length === 0) return p;

    const top = players[0];

    const teamSuffix = top.team ? `-${top.team}` : "";
    const ageSuffix = top.age != null ? `, age ${top.age}` : "";
    const namedMove = `Take ${top.name} (${top.position}${teamSuffix}${ageSuffix})${
      players[1] ? ` or pivot to ${players[1].name}` : ""
    }`;

    let resolved_title: string;
    let resolved_rationale: string;

    if (needContext?.kind === "below_need") {
      resolved_title = `Fill your ${POSITION_LABEL[position]} starter hole`;
      resolved_rationale = `Your ${POSITION_LABEL[position]} room is below starter need. ${top.name} is the best dynasty value still at the position.`;
    } else if (needContext?.kind === "depth_round") {
      resolved_title = `Best dynasty value left (${POSITION_LABEL[position]})`;
      resolved_rationale = `Your roster is at or above starter need everywhere. ${top.name} is the highest dynasty-value player still available; depth/lottery round.`;
    } else {
      // scarcest_position branch
      resolved_title = `Take the tier-leader at ${POSITION_LABEL[position]} (scarcest position)`;
      resolved_rationale = `${POSITION_LABEL[position]} is the scarcest position remaining; only a handful of starter-grade names left. ${top.name} leads the tier.`;
    }

    const resolved_move = namedMove;

    return {
      ...p,
      resolved_title,
      resolved_move,
      resolved_rationale,
      named_targets: players.map((player) => ({
        player_id: player.id,
        name: player.name,
        position: player.position,
        team: player.team,
        age: player.age,
        search_rank: player.search_rank,
        adp: player.adp,
        reason: reasonForTarget(player, position!, snap),
      })),
    };
  });
}
