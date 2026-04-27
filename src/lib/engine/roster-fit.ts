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
  current_count: number;
  hard_starters: number;
  upper_bound_starters: number;
  realistic_starters: number;
  /** Surplus after adding ONE MORE of this position. Drives saturation penalty. */
  surplus_after_one_more: number;
  room: "thin" | "adequate" | "saturated" | "locked";
};

export function buildPositionRoomHealth(
  snap: LeagueSnapshot,
  pos: Position,
): RoomHealth {
  const me = snap.rosters.find((r) => r.is_me);
  const current = me?.position_counts[pos] ?? 0;
  const hard = getHardStarterReqs(snap)[pos];
  const upper = getUpperBoundStarterMax(snap, pos);
  const realistic = getRealisticStarterMax(snap, pos);
  const surplusAfterOne = current + 1 - realistic;

  let room: RoomHealth["room"];
  if (current >= upper + 1) room = "locked";
  else if (current > realistic) room = "saturated";
  else if (current < hard) room = "thin";
  else room = "adequate";

  return {
    position: pos,
    current_count: current,
    hard_starters: hard,
    upper_bound_starters: upper,
    realistic_starters: realistic,
    surplus_after_one_more: surplusAfterOne,
    room,
  };
}
