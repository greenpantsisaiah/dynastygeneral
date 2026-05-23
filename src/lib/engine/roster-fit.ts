/**
 * Canonical roster-fit math. Single source of truth for "how many
 * starters at position X" across the engine.
 *
 * Three distinct concepts live here, each answering a different
 * question. The bug class that motivated centralization (Mac Jones /
 * Schultz / TE-saturated-but-SWOT-says-thin, 2026-04-27): SWOT and
 * Decision card had separate implementations that BOTH felt right for
 * their context but produced contradictory numbers from the user's
 * perspective. Centralizing makes the contradiction visible (3
 * concepts, 3 names) and tunable (1 file, propagates everywhere).
 *
 * Per INVARIANTS "Engine starter-need binds to LLM contract": no
 * surface outside this module is allowed to re-derive these numbers.
 * Lint enforces.
 */

import type { Position, LeagueScoring } from "@/lib/strategy/archetypes/schema";
import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";

/**
 * HARD STARTER REQUIREMENTS. The number of dedicated slots a position
 * MUST fill before flex is even considered. QB includes superflex
 * (because the SF slot is QB-eligible-only-for-QB). Skill positions
 * use literal hard.X.
 *
 * Use this for: "do I have a starter hole?" (Rule 1 fill_starter,
 * roster integrity checks, "thin" classification).
 *
 * Bug history: 3c61992 (2026-04-24) was caused by reading
 * `starter_slots.hard.QB` directly without adding superflex. SF leagues
 * with 1 QB on roster were classified "1/1 done" when actually 1/2.
 */
export function getHardStarterReqs(
  snap: LeagueSnapshot,
): Record<Position, number> {
  const ss = snap.starter_slots;
  return {
    QB: ss.hard.QB + (ss.superflex ?? 0),
    RB: ss.hard.RB,
    WR: ss.hard.WR,
    TE: ss.hard.TE,
    K: ss.hard.K,
    DST: ss.hard.DST,
  };
}

/**
 * UPPER-BOUND STARTER COUNT. The maximum number of THIS position the
 * format COULD start in a single week if every flex slot were filled
 * by this position. Hard slots + every flex they're eligible for, no
 * sharing assumptions.
 *
 * Use this for: room health framing ("TE room thin: 2 bodies for 4
 * starter slots"). The user reads this as bench-safety: if I lose a
 * starter, can I cover? Higher number = more roster pressure to keep
 * depth. Lower number = more depth = more comfortable.
 *
 * Cross-checks the FormatRules.X_starters_max value the LLM contract
 * ships. SWOT consumes this for "thin" / "locked" thresholds.
 */
export function getUpperBoundStarterMax(
  snap: LeagueSnapshot,
  pos: Position,
): number {
  const ss = snap.starter_slots;
  const sfSlots = ss.superflex ?? 0;
  const flexSlots = ss.flex ?? 0;
  const recFlexSlots = ss.rec_flex ?? 0;
  switch (pos) {
    case "QB":
      return ss.hard.QB + sfSlots;
    case "RB":
      return ss.hard.RB + flexSlots;
    case "WR":
      return ss.hard.WR + flexSlots + recFlexSlots;
    case "TE":
      return ss.hard.TE + flexSlots + recFlexSlots;
    case "K":
      return ss.hard.K;
    case "DST":
      return ss.hard.DST;
  }
}

/**
 * REALISTIC STARTER MAX. The number of THIS position the user would
 * realistically start in a typical week given format-aware flex share
 * (flex slots get distributed across eligible positions based on
 * scoring; PPR favors WR-heavy flex; standard favors RB-heavy flex).
 *
 * Use this for: economic ranking decisions ("would this player crack
 * my lineup?"). Saturation penalty in Decision card uses this.
 *
 * Distinct from upper-bound because users don't realistically start a
 * 4th TE in a 2-flex PPR (flex EV at TE peters out fast vs WR3).
 * Upper bound says "could," realistic says "would."
 */
export function getRealisticStarterMax(
  snap: LeagueSnapshot,
  pos: Position,
): number {
  const ss = snap.starter_slots;
  if (pos === "QB") {
    return ss.hard.QB + (ss.superflex ?? 0);
  }
  if (pos === "RB" || pos === "WR" || pos === "TE") {
    return ss.hard[pos] + flexShareForPosition(pos, snap.scoring);
  }
  return 0;
}

/**
 * Format-aware flex allocation. How many flex slots at this position
 * the user would realistically start (vs giving the slot to another
 * position). Calibrated to PPR/standard scoring.
 *
 * Numbers represent "additional starters of this position beyond hard
 * slots that would realistically claim flex." So a PPR roster with
 * hard.WR=2 has flexShare(WR)=2 → 4 realistic WR starters before a 5th
 * is bench-only.
 */
function flexShareForPosition(
  pos: "RB" | "WR" | "TE",
  scoring: LeagueScoring[],
): number {
  const isPpr =
    scoring.includes("PPR") || scoring.includes("half-PPR");
  if (isPpr) {
    if (pos === "WR") return 2;
    if (pos === "RB") return 2;
    if (pos === "TE") return 1;
  }
  // Standard scoring (less PPR weight on WR3, more on RB volume).
  if (pos === "RB") return 2;
  if (pos === "WR") return 1;
  if (pos === "TE") return 1;
  return 0;
}

/**
 * Per-position deficit (current count vs hard requirement). Use for
 * "do I have a hole?" reasoning. Format-aware via getHardStarterReqs.
 *
 * Replaces the inline buildStarterDemand (llm-contract.ts) which took
 * separately-computed FormatRules. This version takes a snapshot
 * directly so callers don't have to assemble FormatRules first.
 */
export function getStarterDemand(
  snap: LeagueSnapshot,
): Record<Position, number> {
  const reqs = getHardStarterReqs(snap);
  const me = snap.rosters.find((r) => r.is_me);
  const counts: Partial<Record<Position, number>> = me?.position_counts ?? {};
  return {
    QB: Math.max(0, reqs.QB - (counts.QB ?? 0)),
    RB: Math.max(0, reqs.RB - (counts.RB ?? 0)),
    WR: Math.max(0, reqs.WR - (counts.WR ?? 0)),
    TE: Math.max(0, reqs.TE - (counts.TE ?? 0)),
    K: Math.max(0, reqs.K - (counts.K ?? 0)),
    DST: Math.max(0, reqs.DST - (counts.DST ?? 0)),
  };
}

/**
 * Value-calibrated depth at one position for one roster.
 *   body     - raw rostered count (the old position_counts number)
 *   startable - players good enough to START somewhere in THIS league
 *   stable    - startable plus one tier of real bench insurance
 */
export type PositionDepth = {
  body: number;
  startable: number;
  stable: number;
};

export type RosterPositionDepth = Record<Position, PositionDepth>;

const DEPTH_VALUE_POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];
const ALL_POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];

function emptyDepth(): RosterPositionDepth {
  return {
    QB: { body: 0, startable: 0, stable: 0 },
    RB: { body: 0, startable: 0, stable: 0 },
    WR: { body: 0, startable: 0, stable: 0 },
    TE: { body: 0, startable: 0, stable: 0 },
    K: { body: 0, startable: 0, stable: 0 },
    DST: { body: 0, startable: 0, stable: 0 },
  };
}

/**
 * Value-calibrated startable / stable-depth counts per roster, per
 * position. The fix for "strategy advice over-weights total RB/WR
 * counts instead of startable quality and stable depth" (founder
 * 2026-05-16): depth is QUALITY, not headcount. Six replacement-level
 * WRs are not "deep at WR."
 *
 * A position's STARTABLE TIER is the top (total_teams x realistic
 * starters at the position) players leaguewide by value: the jobs that
 * actually start somewhere in this league. STABLE DEPTH extends one
 * starter deeper (x (realistic + 1)): bench insurance above
 * replacement. A roster's startable / stable count is how many of its
 * players land in each leaguewide tier.
 *
 * Rank-based, NOT an absolute KTC cutoff (per INVARIANTS "rank-based,
 * not absolute thresholds" + the no-hardcoded-number invariant). The
 * only constants are structural: starters x teams, and +1 for depth.
 *
 * K / DST carry no value scale (kicker careers run long; DST is a team
 * unit), so their startable == stable == body.
 *
 * When no value is known for a position's players leaguewide (e.g., the
 * snapshot was built without a value map), that position's startable
 * tier is empty and callers should fall back to the body count. The
 * `annotateStartableDepth` applier handles that fallback at the field
 * level.
 */
export function buildPositionDepth(args: {
  snap: LeagueSnapshot;
  valueOf: (playerId: string) => number | null;
  positionOf: (playerId: string) => Position | null;
}): Map<number, RosterPositionDepth> {
  const { snap, valueOf, positionOf } = args;
  const teams = snap.total_teams;

  // Leaguewide value list per position, tagged with the owning roster.
  const byPos: Record<Position, Array<{ roster_id: number; value: number }>> = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
    K: [],
    DST: [],
  };
  const bodyByRoster = new Map<number, Record<Position, number>>();
  for (const r of snap.rosters) {
    const body: Record<Position, number> = {
      QB: 0,
      RB: 0,
      WR: 0,
      TE: 0,
      K: 0,
      DST: 0,
    };
    for (const id of r.player_ids ?? []) {
      const pos = positionOf(id);
      if (!pos) continue;
      body[pos] += 1;
      if (DEPTH_VALUE_POSITIONS.includes(pos)) {
        const v = valueOf(id);
        if (typeof v === "number" && Number.isFinite(v)) {
          byPos[pos].push({ roster_id: r.roster_id, value: v });
        }
      }
    }
    bodyByRoster.set(r.roster_id, body);
  }

  // Tier membership tallies per position (roster_id -> count in tier).
  const startableTally: Record<Position, Map<number, number>> = {
    QB: new Map(),
    RB: new Map(),
    WR: new Map(),
    TE: new Map(),
    K: new Map(),
    DST: new Map(),
  };
  const stableTally: Record<Position, Map<number, number>> = {
    QB: new Map(),
    RB: new Map(),
    WR: new Map(),
    TE: new Map(),
    K: new Map(),
    DST: new Map(),
  };
  const tally = (m: Map<number, number>, rid: number) =>
    m.set(rid, (m.get(rid) ?? 0) + 1);
  for (const pos of DEPTH_VALUE_POSITIONS) {
    const realistic = getRealisticStarterMax(snap, pos);
    const startableSlots = Math.max(0, Math.round(teams * realistic));
    const stableSlots = Math.max(0, Math.round(teams * (realistic + 1)));
    const sorted = byPos[pos].slice().sort((a, b) => b.value - a.value);
    sorted.slice(0, startableSlots).forEach((e) => tally(startableTally[pos], e.roster_id));
    sorted.slice(0, stableSlots).forEach((e) => tally(stableTally[pos], e.roster_id));
  }

  const out = new Map<number, RosterPositionDepth>();
  for (const r of snap.rosters) {
    const body = bodyByRoster.get(r.roster_id) ?? {
      QB: 0,
      RB: 0,
      WR: 0,
      TE: 0,
      K: 0,
      DST: 0,
    };
    const depth = emptyDepth();
    for (const pos of ALL_POSITIONS) {
      const b = body[pos] ?? 0;
      if (pos === "K" || pos === "DST") {
        depth[pos] = { body: b, startable: b, stable: b };
      } else {
        depth[pos] = {
          body: b,
          startable: startableTally[pos].get(r.roster_id) ?? 0,
          stable: stableTally[pos].get(r.roster_id) ?? 0,
        };
      }
    }
    out.set(r.roster_id, depth);
  }
  return out;
}

/**
 * Annotate a snapshot's rosters in place with value-calibrated
 * startable_counts + stable_depth_counts (from buildPositionDepth).
 * Called at the entry points that have a value map + position lookup
 * (hub, Coach) so every downstream consumer reads the same numbers off
 * the snapshot instead of re-deriving. Per-position fallback: if a
 * position's startable tier is empty (no leaguewide values), that
 * position keeps its body count so a missing value map degrades to the
 * old behavior rather than zeroing the roster out.
 */
export function annotateStartableDepth(args: {
  snap: LeagueSnapshot;
  valueOf: (playerId: string) => number | null;
  positionOf: (playerId: string) => Position | null;
}): void {
  const { snap } = args;
  const depthByRoster = buildPositionDepth(args);
  // Does ANY roster have ANY startable signal? If the value map was
  // empty, every startable count is 0 and we should not clobber the
  // body-count behavior; leave the fields unset.
  let hasSignal = false;
  for (const depth of depthByRoster.values()) {
    for (const pos of DEPTH_VALUE_POSITIONS) {
      if (depth[pos].startable > 0) {
        hasSignal = true;
        break;
      }
    }
    if (hasSignal) break;
  }
  // No startable signal anywhere means the snapshot was built without a
  // value map. Leave the fields unset so consumers fall back to raw body
  // counts (the old behavior) rather than reading every roster as zero.
  if (!hasSignal) return;
  for (const r of snap.rosters) {
    const depth = depthByRoster.get(r.roster_id);
    if (!depth) continue;
    const startable: Record<Position, number> = {
      QB: 0,
      RB: 0,
      WR: 0,
      TE: 0,
      K: 0,
      DST: 0,
    };
    const stable: Record<Position, number> = {
      QB: 0,
      RB: 0,
      WR: 0,
      TE: 0,
      K: 0,
      DST: 0,
    };
    // Trust the per-position startable / stable counts. A position with
    // bodies but zero startable is a roster whose players at that
    // position genuinely don't clear the leaguewide tier (the exact case
    // we want surfaced: scrubs are not depth). FantasyCalc prices every
    // dynasty-relevant player, so an unpriced body is correctly
    // replacement-level, not a missed starter. K / DST already equal body
    // inside buildPositionDepth.
    for (const pos of ALL_POSITIONS) {
      startable[pos] = depth[pos].startable;
      stable[pos] = depth[pos].stable;
    }
    r.startable_counts = startable;
    r.stable_depth_counts = stable;
  }
}

/**
 * Room-health classification per position. Consolidates "thin /
 * adequate / saturated / locked" framing into one place. SWOT uses
 * this for briefing copy; Decision card uses surplus_after_one_more +
 * room for saturation penalties.
 *
 * Thresholds:
 *   THIN     current < hard_starters (literal hole)
 *   ADEQUATE current in [hard_starters, realistic_max]
 *   SATURATED current > realistic_max (over economic ceiling)
 *   LOCKED   current >= upper_bound + 1 (no room for one more even
 *            in worst-case bench scramble)
 */
export type RoomHealth = {
  position: Position;
  /** Raw rostered count (bodies). For display. */
  current_count: number;
  /**
   * Value-calibrated count of startable-quality bodies (from
   * startable_counts when the snapshot was annotated, else equals
   * current_count). The room classification + surplus are computed on
   * THIS so six replacement-level WRs do not read as a saturated room.
   */
  startable_count: number;
  hard_starters: number;
  upper_bound_starters: number;
  realistic_starters: number;
  /** Surplus after adding ONE MORE of this position. Drives saturation penalty. Quality-calibrated. */
  surplus_after_one_more: number;
  room: "thin" | "adequate" | "saturated" | "locked";
};

export function buildPositionRoomHealth(
  snap: LeagueSnapshot,
  pos: Position,
): RoomHealth {
  const me = snap.rosters.find((r) => r.is_me);
  const body = me?.position_counts[pos] ?? 0;
  // Classify on STARTABLE quality, not raw bodies. Falls back to body
  // count when the snapshot wasn't annotated with startable_counts.
  // Bug 2026-05-16: a roster deep in replacement-level WRs read as
  // "saturated" and the Decision card penalized adding a real starter.
  const startable = me?.startable_counts?.[pos] ?? body;
  const hard = getHardStarterReqs(snap)[pos];
  const upper = getUpperBoundStarterMax(snap, pos);
  const realistic = getRealisticStarterMax(snap, pos);
  const surplusAfterOne = startable + 1 - realistic;

  let room: RoomHealth["room"];
  if (startable >= upper + 1) room = "locked";
  else if (startable > realistic) room = "saturated";
  else if (startable < hard) room = "thin";
  else room = "adequate";

  return {
    position: pos,
    current_count: body,
    startable_count: startable,
    hard_starters: hard,
    upper_bound_starters: upper,
    realistic_starters: realistic,
    surplus_after_one_more: surplusAfterOne,
    room,
  };
}
