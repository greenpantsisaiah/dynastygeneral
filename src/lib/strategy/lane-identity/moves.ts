/**
 * Identity moves. For each CLOSE-state lane, identify the concrete
 * moves that would close the gap: specific opponent-rostered players
 * to target in trades, plus the user's own pieces that could fund
 * the package.
 *
 * Per founder direction 2026-05-11: "show strategies I'm close to
 * (1-2 trades / rookie drafts / waivers away) so I'm always knowing
 * what to monitor for or possibly trade. This is valuable post-draft
 * all the time, not just in the AAR."
 *
 * Move-type handling:
 *   trade_for     : populates targets (opponent rosters) + funding
 *                   (user's surplus value at non-gap positions).
 *   rookie_draft  : no specific player IDs (next year's class is
 *                   unrostered); description carries the framing.
 *   waiver        : no specific IDs; intent is monitoring.
 *   stash_growth  : identifies user's currently-rostered young assets
 *                   who could mature into the gap.
 *
 * The function ignores IN lanes (no gap to close) and NOT_IN lanes
 * (too far to act on without a strategic shift the user should make
 * deliberately).
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type {
  GapMoveType,
  LaneId,
  LaneMembership,
  PlayerForLane,
} from "./types";
import { LANE_SPECS } from "./lanes";
import type { PlayerMeta, PlayerValueRecord } from "./score";

export type MoveTarget = {
  player_id: string;
  name: string;
  position: string | null;
  age: number | null;
  value: number;
  archetype_score: number;
  owner_name: string | null;
  roster_id: number;
};

export type FundingPiece = {
  player_id: string;
  name: string;
  position: string | null;
  value: number;
  rationale: string;
};

export type IdentityMove = {
  lane_id: LaneId;
  lane_label: string;
  move_type: GapMoveType;
  description: string;
  targets: MoveTarget[];
  funding: FundingPiece[];
};

const MIN_TARGET_SCORE = 60;
const MAX_TARGETS = 3;
const MAX_FUNDING = 4;

export function identityMoves(args: {
  memberships: LaneMembership[];
  myRosterId: number;
  rosters: Array<{
    roster_id: number;
    owner_name: string | null;
    player_ids: readonly string[];
    is_me: boolean;
  }>;
  playerLookup: (id: string) => PlayerMeta | null;
  playerValueMap: Map<string, PlayerValueRecord>;
  snap: LeagueSnapshot;
}): IdentityMove[] {
  const {
    memberships,
    myRosterId,
    rosters,
    playerLookup,
    playerValueMap,
    snap,
  } = args;

  const closeLanes = memberships.filter((m) => m.state === "close" && m.gap);
  if (closeLanes.length === 0) return [];

  const myRoster = rosters.find((r) => r.roster_id === myRosterId);
  const opponentRosters = rosters.filter((r) => r.roster_id !== myRosterId);

  const moves: IdentityMove[] = [];
  for (const lane of closeLanes) {
    const spec = LANE_SPECS.find((s) => s.id === lane.lane_id);
    if (!spec || !lane.gap) {
      moves.push({
        lane_id: lane.lane_id,
        lane_label: lane.label,
        move_type: lane.gap?.move_type ?? "trade_for",
        description: lane.gap?.description ?? "",
        targets: [],
        funding: [],
      });
      continue;
    }
    const moveType = lane.gap.move_type;
    let targets: MoveTarget[] = [];
    let funding: FundingPiece[] = [];

    if (moveType === "trade_for") {
      targets = findTargets({
        spec,
        opponentRosters,
        playerLookup,
        playerValueMap,
        snap,
      });
      funding = findFunding({
        gapLaneId: lane.lane_id,
        memberships,
        myRoster,
        playerLookup,
        playerValueMap,
      });
    } else if (moveType === "stash_growth") {
      funding = findFunding({
        gapLaneId: lane.lane_id,
        memberships,
        myRoster,
        playerLookup,
        playerValueMap,
      });
    }
    moves.push({
      lane_id: lane.lane_id,
      lane_label: lane.label,
      move_type: moveType,
      description: lane.gap.description,
      targets,
      funding,
    });
  }
  return moves;
}

function findTargets(args: {
  spec: (typeof LANE_SPECS)[number];
  opponentRosters: Array<{
    roster_id: number;
    owner_name: string | null;
    player_ids: readonly string[];
  }>;
  playerLookup: (id: string) => PlayerMeta | null;
  playerValueMap: Map<string, PlayerValueRecord>;
  snap: LeagueSnapshot;
}): MoveTarget[] {
  const { spec, opponentRosters, playerLookup, playerValueMap, snap } = args;
  const candidates: MoveTarget[] = [];
  for (const roster of opponentRosters) {
    for (const id of roster.player_ids) {
      const meta = playerLookup(id);
      if (!meta) continue;
      const v = playerValueMap.get(id);
      const value = v ? v.value : null;
      const p: PlayerForLane = {
        id,
        name: meta.name,
        position: meta.position,
        team: meta.team,
        age: meta.age,
        years_exp: meta.years_exp,
        is_rookie: meta.is_rookie,
        search_rank: meta.search_rank,
        value,
      };
      const score = spec.scorePlayer(p, snap);
      if (score < MIN_TARGET_SCORE) continue;
      candidates.push({
        player_id: id,
        name: meta.name,
        position: meta.position,
        age: meta.age,
        value: value ?? 0,
        archetype_score: score,
        owner_name: roster.owner_name,
        roster_id: roster.roster_id,
      });
    }
  }
  candidates.sort((a, b) => b.archetype_score - a.archetype_score);
  return candidates.slice(0, MAX_TARGETS);
}

function findFunding(args: {
  gapLaneId: LaneId;
  memberships: LaneMembership[];
  myRoster:
    | { roster_id: number; player_ids: readonly string[] }
    | undefined;
  playerLookup: (id: string) => PlayerMeta | null;
  playerValueMap: Map<string, PlayerValueRecord>;
}): FundingPiece[] {
  const { gapLaneId, memberships, myRoster, playerLookup, playerValueMap } =
    args;
  if (!myRoster) return [];

  // Identify lanes the user is IN. Players past those lanes' top-K are
  // "surplus" the user can package without weakening their identity.
  // Players who DO NOT contribute to the gap lane are eligible funding
  // (trading them doesn't make the gap worse).
  const inLanes = memberships.filter((m) => m.state === "in" && !m.is_derived);
  const gapMembership = memberships.find((m) => m.lane_id === gapLaneId);
  const gapContributorIds = new Set(
    (gapMembership?.contributors ?? []).map((c) => c.player_id),
  );

  // A player counts as "surplus" when they appear past the lane's top-K
  // contributors on any IN lane they participate in. The lane label
  // explains why they're tradeable: "you're IN on TE-Premium Lock with
  // 4 contributors; positions 3-4 are surplus."
  type Candidate = { id: string; value: number; rationale: string };
  const candidatesById = new Map<string, Candidate>();
  for (const lane of inLanes) {
    if (lane.contributors.length === 0) continue;
    // Find the corresponding spec to determine topK.
    const spec = LANE_SPECS.find((s) => s.id === lane.lane_id);
    if (!spec) continue;
    const surplusStart = spec.topK;
    const surplus = lane.contributors.slice(surplusStart);
    for (const c of surplus) {
      if (gapContributorIds.has(c.player_id)) continue;
      const v = playerValueMap.get(c.player_id);
      const value = v ? v.value : 0;
      if (value < 30) continue;
      // Only record the highest-value rationale per player (a player
      // surplus on multiple lanes shouldn't double-count in funding).
      const existing = candidatesById.get(c.player_id);
      if (!existing || existing.value < value) {
        candidatesById.set(c.player_id, {
          id: c.player_id,
          value,
          rationale: `${lane.label} surplus (you have ${lane.contributors.length} contributors past the topK of ${spec.topK})`,
        });
      }
    }
  }

  // If we couldn't find surplus from IN lanes (small roster, no IN
  // lanes, etc.), fall back to the user's highest-value players who
  // are not gap contributors.
  if (candidatesById.size === 0) {
    for (const id of myRoster.player_ids) {
      if (gapContributorIds.has(id)) continue;
      const meta = playerLookup(id);
      if (!meta) continue;
      const v = playerValueMap.get(id);
      const value = v ? v.value : 0;
      if (value < 50) continue;
      candidatesById.set(id, {
        id,
        value,
        rationale: "highest-value non-gap asset",
      });
    }
  }

  const ranked = [...candidatesById.values()].sort(
    (a, b) => b.value - a.value,
  );
  return ranked.slice(0, MAX_FUNDING).map((c) => {
    const meta = playerLookup(c.id);
    return {
      player_id: c.id,
      name: meta?.name ?? c.id,
      position: meta?.position ?? null,
      value: c.value,
      rationale: c.rationale,
    };
  });
}
