/**
 * Per-player + per-roster lane scoring.
 *
 *   scorePlayerPerLane(player, snap)
 *     → Record<LaneId, number>  (full vector, 0-100 per base lane;
 *                                derived lanes omitted because they
 *                                don't have per-player scoring)
 *
 *   aggregateRosterIdentity({ playerIds, playerLookup, playerValueMap, snap })
 *     → LaneMembership[]        (one per applicable base lane plus
 *                                applicable derived lanes; each
 *                                classified IN / CLOSE / NOT_IN)
 *
 * Threshold logic per audit (2026-05-12):
 *   - Roster-shape lanes (win_now_floor / balanced / future_stock)
 *     scale thresholds by formatScaleFactor(snap) so smaller leagues
 *     don't share the 12-team SF starter-9 bar.
 *   - Archetype lanes (rb_bellcow / wr_anchor / ...) use absolute
 *     thresholds because the tier definition is league-size-agnostic.
 *   - WR Stable enforces a min-of-top-K guard (no anchor-plus-fillers
 *     loopholes; "stable" requires uniform contribution).
 *   - Derived lanes (Sustained Contender, Zero-RB) compute AFTER base
 *     lanes and consume their states.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type {
  LaneId,
  LaneMembership,
  LaneScoreEntry,
  PlayerForLane,
} from "./types";
import {
  LANE_SPECS,
  TOP_K_MIN_BY_LANE,
  formatScaleFactor,
  type LaneSpec,
} from "./lanes";
import { DERIVED_LANE_SPECS } from "./derived";

export function scorePlayerPerLane(
  player: PlayerForLane,
  snap: LeagueSnapshot,
): Record<LaneId, number> {
  const out = {} as Record<LaneId, number>;
  for (const spec of LANE_SPECS) {
    out[spec.id] = spec.appliesTo(snap) ? spec.scorePlayer(player, snap) : 0;
  }
  // Derived lanes don't have per-player scoring; zero them in the
  // vector so callers that read the full record don't trip on
  // missing keys.
  for (const spec of DERIVED_LANE_SPECS) {
    out[spec.id] = 0;
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

  const scale = formatScaleFactor(snap);

  const baseMemberships: LaneMembership[] = [];
  for (const spec of LANE_SPECS) {
    if (!spec.appliesTo(snap)) continue;
    baseMemberships.push(computeMembership(spec, players, snap, scale));
  }

  const derivedMemberships: LaneMembership[] = [];
  for (const spec of DERIVED_LANE_SPECS) {
    if (!spec.appliesTo(snap)) continue;
    derivedMemberships.push(spec.derive({ base: baseMemberships, snap }));
  }

  return [...baseMemberships, ...derivedMemberships];
}

function computeMembership(
  spec: LaneSpec,
  players: PlayerForLane[],
  snap: LeagueSnapshot,
  scale: number,
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

  // Format-scaling: roster-shape lanes scale thresholds with league
  // size and starter count; archetype lanes do not (audit 2026-05-12).
  const effectiveIn = spec.formatScales
    ? Math.round(spec.inThreshold * scale)
    : spec.inThreshold;
  const effectiveClose = spec.formatScales
    ? Math.round(spec.closeThreshold * scale)
    : spec.closeThreshold;

  // Min-of-top-K guard: some lanes (WR Stable) require uniform
  // contribution across the top-K, not just sum above threshold. A
  // value-100 anchor plus two fillers shouldn't classify as "Stable."
  // The min check applies only when the top-K is fully populated;
  // partial top-K (e.g., 2 of 3 WRs) cannot be IN regardless.
  const minRequired = TOP_K_MIN_BY_LANE[spec.id];
  let uniformityOk = true;
  if (minRequired != null) {
    if (topK.length < spec.topK) uniformityOk = false;
    else {
      const minContribution = Math.min(...topK.map((e) => e.contribution));
      if (minContribution < minRequired) uniformityOk = false;
    }
  }

  let state: LaneMembership["state"];
  if (aggregate >= effectiveIn && uniformityOk) state = "in";
  else if (aggregate >= effectiveClose) state = "close";
  else state = "not_in";

  const gap =
    state === "close"
      ? spec.describeGap({
          contributors: topK,
          aggregate,
          inThreshold: effectiveIn,
          closeThreshold: effectiveClose,
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
    in_threshold: effectiveIn,
    close_threshold: effectiveClose,
    contributors: scored,
    gap,
    is_derived: false,
  };
}
