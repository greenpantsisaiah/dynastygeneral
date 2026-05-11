/**
 * Lane Identity types. The roster-shape characterization layer that
 * replaces the legacy "declared window" concept.
 *
 * A roster is in N lanes simultaneously, not on a single horizon
 * point. Each player contributes to as many lanes as they earn:
 * Chase contributes to Win-Now Floor AND WR Anchor AND Trade Capital;
 * Tyler Warren (rookie TE in TE-premium SF) contributes to Future
 * Stock AND TE-Premium Lock AND Trade Capital AND Win-Now Floor.
 * A pick advancing multiple lanes is normal, not exceptional.
 *
 * Per founder direction 2026-05-11: declarations were a legacy
 * concept. The act of picking IS the strategy declaration. The
 * engine's job is to characterize roster shape across multiple lanes
 * (horizon + archetype) and tell the user which lanes they're IN,
 * which they're CLOSE to (1-2 moves away), and what move type closes
 * the gap.
 */

export type LaneId =
  | "win_now_floor"
  | "balanced"
  | "future_stock"
  | "rb_bellcow"
  | "wr_anchor"
  | "wr_stable"
  | "qb_cartel"
  | "te_premium_lock"
  | "trade_capital";

export type LaneAxis = "horizon" | "archetype";

/** Player shape consumed by lane scoring. Stable across surfaces. */
export type PlayerForLane = {
  id: string;
  name: string;
  position: string | null;
  team: string | null;
  age: number | null;
  years_exp: number | null;
  is_rookie: boolean;
  search_rank: number;
  /** FantasyCalc value, 0-100 normalized. Null when unresolved. */
  value: number | null;
};

export type LaneScoreEntry = {
  player_id: string;
  name: string;
  position: string | null;
  /** Per-player contribution to THIS lane, 0-100. */
  contribution: number;
};

/**
 * The type of move that would close a CLOSE-state lane. Drives the
 * monitor / trade-hunt surface in step 3 of the rollout.
 */
export type GapMoveType =
  | "trade_for"
  | "waiver"
  | "rookie_draft"
  | "stash_growth";

export type LaneMembership = {
  lane_id: LaneId;
  label: string;
  blurb: string;
  axis: LaneAxis;
  /** IN = rostered enough to advance the lane. CLOSE = 1-2 moves away. NOT_IN = not on the path. */
  state: "in" | "close" | "not_in";
  /** Sum of top-K contributor scores (K is lane-defined). */
  aggregate_score: number;
  in_threshold: number;
  close_threshold: number;
  /** All players with contribution > 0, sorted descending. */
  contributors: LaneScoreEntry[];
  /** Set only when state === "close": names the gap and move type. */
  gap: { description: string; move_type: GapMoveType } | null;
};
