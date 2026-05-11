/**
 * Lane definitions. Each lane specifies:
 *   - the axis (horizon vs archetype) for UI grouping
 *   - the formats it applies to (some only fire in SF or TE-premium)
 *   - per-player scoring (0-100 contribution)
 *   - top-K aggregator (how many contributors sum into the lane score)
 *   - IN / CLOSE thresholds on the aggregate
 *   - gap describer that returns a precise close-gap line
 *
 * Scoring functions are deliberately direct: clear conditions, named
 * branches, no opaque tuning constants without a comment. Thresholds
 * are tunable; defaults are calibrated against a 12-team dynasty
 * starting-9 lineup and validated against a real draft (founder's
 * 2026-05-11 Finders Keepers AAR). Update with calibration data, do
 * not over-engineer.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type {
  GapMoveType,
  LaneAxis,
  LaneId,
  LaneScoreEntry,
  PlayerForLane,
} from "./types";

export type LaneSpec = {
  id: LaneId;
  label: string;
  blurb: string;
  axis: LaneAxis;
  /** True when the lane applies to the given format. */
  appliesTo: (snap: LeagueSnapshot) => boolean;
  /** Number of top contributors summed into the aggregate. */
  topK: number;
  inThreshold: number;
  closeThreshold: number;
  scorePlayer: (player: PlayerForLane, snap: LeagueSnapshot) => number;
  describeGap: (args: {
    contributors: LaneScoreEntry[];
    aggregate: number;
    inThreshold: number;
    closeThreshold: number;
    snap: LeagueSnapshot;
  }) => { description: string; move_type: GapMoveType };
};

const ALL_FORMATS = (): boolean => true;
const SUPERFLEX_ONLY = (snap: LeagueSnapshot): boolean =>
  snap.format === "superflex" || snap.format === "2qb";
const TE_PREMIUM_ONLY = (snap: LeagueSnapshot): boolean =>
  snap.scoring.includes("TE-premium");

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function isScarcePosFormat(p: PlayerForLane, snap: LeagueSnapshot): boolean {
  if (p.position === "TE" && snap.scoring.includes("TE-premium")) return true;
  if (
    p.position === "QB" &&
    (snap.format === "superflex" || snap.format === "2qb")
  ) {
    return true;
  }
  return false;
}

/* ============================================================
 * Horizon lanes
 * ============================================================ */

const WIN_NOW_FLOOR: LaneSpec = {
  id: "win_now_floor",
  label: "Win-Now Floor",
  blurb: "Proven production that contributes to a competitive starting lineup right now.",
  axis: "horizon",
  appliesTo: ALL_FORMATS,
  topK: 9,
  inThreshold: 480,
  closeThreshold: 340,
  scorePlayer(p, snap) {
    const value = p.value ?? 0;
    // Rookies: only count when they're at a scarce-format position
    // (TE in TE-premium, QB in SF). Otherwise their year-1 contribution
    // to floor is unreliable.
    if (p.is_rookie) {
      if (!isScarcePosFormat(p, snap)) return 0;
      if (value >= 60) return 60;
      if (value >= 40) return 40;
      if (value >= 25) return 25;
      return 0;
    }
    if (p.age == null) return 0;
    // Vets need value >= 40 to be meaningful starters. Below that,
    // they're bench / depth pieces. The prior cutoff of 30 inflated
    // win-now reads on rosters with lots of cheap depth and produced
    // false IN states (2026-05-11 Finders Keepers calibration).
    if (value < 40) return 0;
    let base: number;
    if (p.age >= 24 && p.age <= 28) base = 70;
    else if (p.age >= 23 && p.age <= 30) base = 55;
    else if (p.age >= 31 && p.age <= 32) base = 35;
    else return 0;
    // Value-tier multiplier on base: 40-44 = 0.5x, 45-49 = 0.75x,
    // 50+ = full. Players below WR2 / RB2 tier shouldn't carry full
    // starter weight even when their age is right.
    let mult = 1.0;
    if (value < 45) mult = 0.5;
    else if (value < 50) mult = 0.75;
    const valueBonus = clamp((value - 50) * 0.5, 0, 30);
    return Math.round(clamp(base * mult + valueBonus, 0, 100));
  },
  describeGap() {
    return {
      description:
        "Sell rookie / project depth for 1-2 proven WR2 or RB2 producers.",
      move_type: "trade_for",
    };
  },
};

const BALANCED: LaneSpec = {
  id: "balanced",
  label: "Balanced",
  blurb: "Prime-age producers with both immediate output and multi-year runway.",
  axis: "horizon",
  appliesTo: ALL_FORMATS,
  topK: 6,
  inThreshold: 320,
  closeThreshold: 220,
  scorePlayer(p) {
    if (p.is_rookie) return 0;
    if (p.age == null || p.age < 23 || p.age > 27) return 0;
    const value = p.value ?? 0;
    if (value < 40) return 0;
    const base = p.age >= 24 && p.age <= 26 ? 70 : 50;
    const valueBonus = clamp((value - 40) * 0.6, 0, 30);
    return Math.round(clamp(base + valueBonus, 0, 100));
  },
  describeGap() {
    return {
      description:
        "Acquire a prime-age (24-26) producer with established production.",
      move_type: "trade_for",
    };
  },
};

const FUTURE_STOCK: LaneSpec = {
  id: "future_stock",
  label: "Future Stock",
  blurb: "Rookies and year-2 ascending assets with multi-year runway.",
  axis: "horizon",
  appliesTo: ALL_FORMATS,
  topK: 8,
  inThreshold: 480,
  closeThreshold: 340,
  scorePlayer(p) {
    const value = p.value ?? 0;
    if (p.is_rookie) {
      if (value < 15) return 30;
      return Math.round(clamp(50 + value * 0.5, 0, 100));
    }
    if (p.age != null && p.age <= 23 && value >= 25) {
      return Math.round(clamp(45 + value * 0.5, 0, 100));
    }
    if (
      p.years_exp != null &&
      p.years_exp <= 1 &&
      p.age == null &&
      value >= 25
    ) {
      return Math.round(clamp(40 + value * 0.5, 0, 100));
    }
    return 0;
  },
  describeGap() {
    return {
      description:
        "Stash 2-3 more rookies via next year's draft or buy-low rookies trading down.",
      move_type: "rookie_draft",
    };
  },
};

/* ============================================================
 * Archetype lanes
 * ============================================================ */

const RB_BELLCOW: LaneSpec = {
  id: "rb_bellcow",
  label: "RB Bellcow",
  blurb: "Anchor workhorse RB1 with peak-age workload.",
  axis: "archetype",
  appliesTo: ALL_FORMATS,
  topK: 1,
  inThreshold: 75,
  closeThreshold: 50,
  scorePlayer(p) {
    if (p.position !== "RB") return 0;
    const value = p.value ?? 0;
    if (value < 45) return 0;
    if (p.age != null && p.age >= 29) {
      return Math.round(clamp(value * 0.4, 0, 60));
    }
    if (value >= 70) return Math.round(clamp(70 + (value - 70), 0, 100));
    return Math.round(clamp(value * 0.8, 0, 70));
  },
  describeGap() {
    return {
      description:
        "Trade for a top-tier workhorse RB1. Package rookies / depth at scarce positions.",
      move_type: "trade_for",
    };
  },
};

const WR_ANCHOR: LaneSpec = {
  id: "wr_anchor",
  label: "WR Anchor",
  blurb: "Elite WR1 cornerstone.",
  axis: "archetype",
  appliesTo: ALL_FORMATS,
  topK: 1,
  inThreshold: 80,
  closeThreshold: 55,
  scorePlayer(p) {
    if (p.position !== "WR") return 0;
    const value = p.value ?? 0;
    if (value < 60) return 0;
    if (value >= 85) return Math.round(clamp(80 + (value - 85), 0, 100));
    return Math.round(clamp(50 + (value - 60), 0, 80));
  },
  describeGap() {
    return {
      description:
        "Trade for an elite WR1. Package multi-asset bundles around the ask.",
      move_type: "trade_for",
    };
  },
};

const WR_STABLE: LaneSpec = {
  id: "wr_stable",
  label: "WR Stable",
  blurb: "Three-plus WR1 / WR2-tier producers in starting rotation.",
  axis: "archetype",
  appliesTo: ALL_FORMATS,
  topK: 3,
  inThreshold: 180,
  closeThreshold: 130,
  scorePlayer(p) {
    if (p.position !== "WR") return 0;
    const value = p.value ?? 0;
    if (value < 35) return 0;
    if (value >= 50) {
      return Math.round(clamp(50 + (value - 50) * 0.5, 0, 100));
    }
    return Math.round(value * 0.6);
  },
  describeGap() {
    return {
      description: "Add one more WR2-tier producer to round out the stable.",
      move_type: "trade_for",
    };
  },
};

const QB_CARTEL: LaneSpec = {
  id: "qb_cartel",
  label: "QB Cartel",
  blurb: "Two-plus high-value QBs in superflex / 2QB format.",
  axis: "archetype",
  appliesTo: SUPERFLEX_ONLY,
  topK: 3,
  inThreshold: 170,
  closeThreshold: 120,
  scorePlayer(p) {
    if (p.position !== "QB") return 0;
    const value = p.value ?? 0;
    if (value < 35) return 0;
    if (value >= 75) return Math.round(clamp(70 + (value - 75), 0, 100));
    if (value >= 50) return Math.round(clamp(50 + (value - 50), 0, 70));
    return Math.round(value * 0.8);
  },
  describeGap() {
    return {
      description:
        "Add one more high-value QB to lock the SF starter pair and a strong third.",
      move_type: "trade_for",
    };
  },
};

const TE_PREMIUM_LOCK: LaneSpec = {
  id: "te_premium_lock",
  label: "TE-Premium Lock",
  blurb: "Two-plus top-tier TEs in a TE-premium format.",
  axis: "archetype",
  appliesTo: TE_PREMIUM_ONLY,
  topK: 2,
  inThreshold: 120,
  closeThreshold: 80,
  scorePlayer(p) {
    if (p.position !== "TE") return 0;
    const value = p.value ?? 0;
    if (value < 30) return 0;
    if (p.is_rookie && value >= 35) {
      return Math.round(clamp(55 + (value - 35), 0, 90));
    }
    if (value >= 60) return Math.round(clamp(65 + (value - 60), 0, 100));
    if (value >= 40) return Math.round(clamp(40 + (value - 40), 0, 65));
    return Math.round(value * 0.8);
  },
  describeGap() {
    return {
      description:
        "Add one more top-tier TE. The scoring multiplier rewards stacking.",
      move_type: "trade_for",
    };
  },
};

const TRADE_CAPITAL: LaneSpec = {
  id: "trade_capital",
  label: "Trade Capital",
  blurb: "Roster carries enough KTC-value depth to fund 2-for-1 consolidation trades.",
  axis: "archetype",
  appliesTo: ALL_FORMATS,
  topK: 8,
  // Threshold calibrated against the 2026-05-11 Finders Keepers
  // roster: 8 assets summing 426 should classify as IN given the
  // unusual TE-premium SF depth (4 high-KTC TEs + 5 SF QBs).
  // The prior 440 threshold left that roster at CLOSE despite
  // genuinely strong trade capital.
  inThreshold: 420,
  closeThreshold: 300,
  scorePlayer(p) {
    const value = p.value ?? 0;
    if (value < 30) return 0;
    return Math.round(clamp(value * 0.9, 0, 95));
  },
  describeGap() {
    return {
      description:
        "Consolidate value: package 2-3 mid-value assets into a single top-tier piece.",
      move_type: "trade_for",
    };
  },
};

/**
 * All lane specs in render order. Horizon lanes first (timeline read),
 * then archetype lanes (roster-shape read). Both axes render in the
 * same panel; the `axis` field lets the UI group / color them.
 */
export const LANE_SPECS: readonly LaneSpec[] = [
  WIN_NOW_FLOOR,
  BALANCED,
  FUTURE_STOCK,
  RB_BELLCOW,
  WR_ANCHOR,
  WR_STABLE,
  QB_CARTEL,
  TE_PREMIUM_LOCK,
  TRADE_CAPITAL,
];

export function laneSpec(id: LaneId): LaneSpec {
  const found = LANE_SPECS.find((l) => l.id === id);
  if (!found) throw new Error(`Unknown lane: ${id}`);
  return found;
}
