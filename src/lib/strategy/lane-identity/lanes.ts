/**
 * Lane definitions. Each lane specifies:
 *   - the axis (horizon vs archetype vs composite) for UI grouping
 *   - the formats it applies to (some only fire in SF or TE-premium)
 *   - per-player scoring (0-100 contribution)
 *   - top-K aggregator (how many contributors sum into the aggregate)
 *   - IN / CLOSE thresholds on the aggregate
 *   - optional format-size scaling (thresholds scale with team count
 *     and starter count so a 10-team 1QB doesn't share the 12-team SF
 *     bar)
 *   - gap describer that returns a precise close-gap line
 *
 * Calibration disclosure (2026-05-12 assumption audit):
 *   All thresholds are CALIBRATION TARGETS. Defaults were tuned against
 *   a single 12-team SF TE-premium dynasty draft (founder's 2026-05-11
 *   Finders Keepers AAR). Until a reference roster cohort (3 known
 *   contenders, 3 mid-pack, 3 known rebuilders from public KTC rankings)
 *   is added to the test fixtures, treat threshold drift suggestions
 *   with suspicion: a threshold tuned to one example has zero degrees
 *   of freedom in cross-validation.
 *
 * Position-aware age curves (2026-05-12 assumption audit):
 *   Floor / balanced / bellcow scoring honors position-specific age
 *   cliffs derived from Dynasty Edge EPA study (2014-2024), Harstad
 *   mortality tables, and Fantasy Points age-curve research. Sources
 *   captured in the audit report under MEMORY.md
 *   `feedback_pool_size_must_match_league_shape` adjacent context.
 *   Flat position-blind age multipliers mispriced QB / WR vets by
 *   roughly 25-35%; position-aware curves close that gap.
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
  appliesTo: (snap: LeagueSnapshot) => boolean;
  topK: number;
  inThreshold: number;
  closeThreshold: number;
  /**
   * When true, the runtime aggregator multiplies inThreshold and
   * closeThreshold by formatScaleFactor(snap) so 10-team 1QB leagues
   * don't share the 12-team SF starter-9 bar. Applies to roster-shape
   * lanes (win_now_floor, balanced, future_stock); archetype lanes
   * (rb_bellcow, wr_anchor, ...) keep absolute thresholds because the
   * archetype tier is league-size-agnostic.
   */
  formatScales: boolean;
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

/**
 * Position-aware age multiplier for win-now floor contribution.
 *
 * Derived from position-specific age-curve research (Dynasty Edge
 * 2014-2024 EPA study, Footballguys Harstad mortality tables,
 * Fantasy Points age-curve series). Position cliffs differ enough
 * that a flat curve produces 25-35% systematic mispricing.
 *
 * Bands:
 *   RB: peak 23-26 (1.0), 27-28 (0.8), 29-30 (0.5)
 *   WR: peak 24-29 (1.0), 23/30-31 (0.85), 32-33 (0.55)
 *   TE: peak 25-30 (1.0), 23-24/31-32 (0.85), 33-34 (0.55)
 *   QB: peak 26-33 (1.0), 24-25/34-36 (0.85), 37-38 (0.6)
 */
function positionAgeMult(position: string | null, age: number): number {
  const pos = (position ?? "").toUpperCase();
  switch (pos) {
    case "RB":
      if (age >= 23 && age <= 26) return 1.0;
      if (age === 27 || age === 28) return 0.8;
      if (age === 29 || age === 30) return 0.5;
      return 0;
    case "WR":
      if (age >= 24 && age <= 29) return 1.0;
      if (age === 23 || age === 30 || age === 31) return 0.85;
      if (age === 32 || age === 33) return 0.55;
      return 0;
    case "TE":
      if (age >= 25 && age <= 30) return 1.0;
      if (age === 23 || age === 24 || age === 31 || age === 32) return 0.85;
      if (age === 33 || age === 34) return 0.55;
      return 0;
    case "QB":
      if (age >= 26 && age <= 33) return 1.0;
      if ((age >= 24 && age <= 25) || (age >= 34 && age <= 36)) return 0.85;
      if (age === 37 || age === 38) return 0.6;
      return 0;
    default:
      return 0;
  }
}

/**
 * Position-aware "balanced" base score (production + multi-year
 * runway). Replaces the prior flat 23-27 cap that excluded age 28
 * across all positions, which created a 50-point cliff inside WR
 * prime (Chase / Lamb / DK at age 28 read as "not balanced" under
 * the flat band).
 *
 * Per-position prime bands match the audit's suggested adjustment.
 */
function balancedBase(position: string | null, age: number): number {
  const pos = (position ?? "").toUpperCase();
  switch (pos) {
    case "RB":
      if (age >= 23 && age <= 25) return 70;
      if (age === 26) return 50;
      return 0;
    case "WR":
      if (age >= 25 && age <= 28) return 70;
      if (age === 23 || age === 24 || age === 29) return 50;
      return 0;
    case "TE":
      if (age >= 26 && age <= 29) return 70;
      if (age === 24 || age === 25 || age === 30) return 50;
      return 0;
    case "QB":
      if (age >= 27 && age <= 31) return 70;
      if (age === 25 || age === 26 || age === 32) return 50;
      return 0;
    default:
      return 0;
  }
}

/**
 * Format-size scale factor. Applied to thresholds on roster-shape
 * lanes (win_now_floor, balanced, future_stock). A 10-team 1QB league
 * with 8 starters runs at factor (10/12) * (8/9) = 0.74. A 12-team SF
 * with 9 starters runs at factor 1.0 (baseline). Thresholds were
 * calibrated against the 12-team SF baseline; smaller leagues with
 * fewer starter slots should have proportionally lower bars.
 */
export function formatScaleFactor(snap: LeagueSnapshot): number {
  const s = snap.starter_slots;
  const skillStarters =
    s.hard.QB + s.hard.RB + s.hard.WR + s.hard.TE +
    s.flex + s.superflex + s.rec_flex;
  const teamFactor = snap.total_teams / 12;
  const starterFactor = skillStarters > 0 ? skillStarters / 9 : 1;
  return teamFactor * starterFactor;
}

/* ============================================================
 * Horizon lanes (roster-shape; format-scaled)
 * ============================================================ */

const WIN_NOW_FLOOR: LaneSpec = {
  id: "win_now_floor",
  label: "Win-Now Floor",
  blurb: "Proven production that contributes to a competitive starting lineup right now.",
  axis: "horizon",
  appliesTo: ALL_FORMATS,
  topK: 9,
  // CALIBRATION TARGET: sample-of-1 (Finders Keepers 2026-05-11).
  // Awaits beta-roster cohort for cross-validation.
  inThreshold: 480,
  closeThreshold: 340,
  formatScales: true,
  scorePlayer(p, snap) {
    // Sliding scale, not a binary cutoff. A WR3 / RB3 fills in on
    // bye weeks and injuries; they're part of the floor even if
    // they don't start every Sunday (founder 2026-05-12).
    const value = p.value ?? 0;
    if (p.is_rookie) {
      // Rookies at scarce-format positions (TE in TE-premium, QB in
      // SF) contribute via year-1 starter snaps; non-scarce rookies
      // don't (unreliable role).
      if (!isScarcePosFormat(p, snap)) return 0;
      return Math.round(clamp((value - 5) * 0.95, 0, 65));
    }
    if (p.age == null) return 0;
    // Position-aware age multiplier (2026-05-12 audit B.1). Replaces
    // the prior flat band that mispriced QB / WR vets by 25-35%.
    const ageMult = positionAgeMult(p.position, p.age);
    if (ageMult === 0) return 0;
    if (value < 10) return 0;
    // Linear ramp from value 10 (waiver-tier, ~0 contribution) to
    // value 95 (elite anchor, ~100). Shape is provisional placeholder;
    // expect concave once calibration data lands.
    const raw = (value - 10) * (100 / 85);
    return Math.round(clamp(raw * ageMult, 0, 100));
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
  // CALIBRATION TARGET: sample-of-1.
  inThreshold: 320,
  closeThreshold: 220,
  formatScales: true,
  scorePlayer(p) {
    if (p.is_rookie) return 0;
    if (p.age == null) return 0;
    const value = p.value ?? 0;
    if (value < 40) return 0;
    // Position-aware prime band (2026-05-12 audit B.3). Replaces the
    // flat 23-27 cutoff that excluded age 28 across all positions
    // and created a cliff inside WR prime.
    const base = balancedBase(p.position, p.age);
    if (base === 0) return 0;
    const valueBonus = clamp((value - 40) * 0.6, 0, 30);
    return Math.round(clamp(base + valueBonus, 0, 100));
  },
  describeGap() {
    return {
      description:
        "Acquire a prime-age producer with established production and 2-3 year runway.",
      move_type: "trade_for",
    };
  },
};

const FUTURE_STOCK: LaneSpec = {
  id: "future_stock",
  label: "Future Stock",
  blurb: "Rookies and ascending year-2 / year-3 assets with multi-year runway.",
  axis: "horizon",
  appliesTo: ALL_FORMATS,
  topK: 8,
  // CALIBRATION TARGET: sample-of-1. Audit C.4 flagged that
  // future-stock is structurally easier to accumulate than win-now-floor,
  // so parity-thresholding (480/340) may under-flag future-stock
  // strength. Raised modestly from prior 480/340 to 540/380.
  inThreshold: 540,
  closeThreshold: 380,
  formatScales: true,
  scorePlayer(p) {
    const value = p.value ?? 0;
    if (p.is_rookie) {
      if (value < 15) return 30;
      return Math.round(clamp(50 + value * 0.5, 0, 100));
    }
    // Year-2 age 22-23 and year-3 age 23-24 still count as Future
    // Stock per audit B.4. Age 23 alone is too narrow.
    if (p.age != null && p.age <= 24 && (p.years_exp ?? 99) <= 2 && value >= 25) {
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
 * Archetype lanes (player-tier; thresholds absolute)
 * ============================================================ */

const RB_BELLCOW: LaneSpec = {
  id: "rb_bellcow",
  label: "RB Bellcow",
  blurb: "Anchor workhorse RB1 with peak-age workload.",
  axis: "archetype",
  appliesTo: ALL_FORMATS,
  topK: 1,
  // CALIBRATION TARGET: per-tier intuition, not data-validated.
  inThreshold: 75,
  closeThreshold: 50,
  formatScales: false,
  scorePlayer(p) {
    if (p.position !== "RB") return 0;
    const value = p.value ?? 0;
    if (value < 45) return 0;
    // Audit B.6: two-tier decline curve in the RB cliff window
    // (29 → 0.55x, 30 → 0.35x, 31+ → 0x). Replaces the prior
    // flat 0.4x at 29+ which under-counted age 29 bellcows
    // (Henry-shape) and over-counted age 30 bellcows.
    if (p.age != null) {
      if (p.age === 29) {
        return Math.round(clamp(value * 0.55, 0, 65));
      }
      if (p.age === 30) {
        return Math.round(clamp(value * 0.35, 0, 50));
      }
      if (p.age >= 31) return 0;
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
  // CALIBRATION TARGET. Floor raised from 60 to 70 per audit B.7:
  // value 60 mapped to WR12-WR18 tier, which is solid WR1 but not
  // anchor. Anchor is WR1-WR8 (value 75+).
  inThreshold: 80,
  closeThreshold: 55,
  formatScales: false,
  scorePlayer(p) {
    if (p.position !== "WR") return 0;
    const value = p.value ?? 0;
    if (value < 70) return 0;
    if (value >= 85) return Math.round(clamp(80 + (value - 85), 0, 100));
    // value 70-84 ramp: 50 + (value-70) * 2, capped at 80
    return Math.round(clamp(50 + (value - 70) * 2, 0, 80));
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
  blurb: "Three-plus WR1 / WR2-tier producers in starting rotation, with uniform contribution.",
  axis: "archetype",
  appliesTo: ALL_FORMATS,
  topK: 3,
  // CALIBRATION TARGET. Per audit B.8, the lane requires uniform
  // contribution. Aggregator enforces min-of-top-3 ≥ 45 alongside
  // the sum threshold (logic in score.ts:computeMembership).
  inThreshold: 180,
  closeThreshold: 130,
  formatScales: false,
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

const QB_STABLE: LaneSpec = {
  // Renamed from qb_cartel per audit B.9: "cartel" is internal
  // jargon and not a recognized dynasty term. Industry uses
  // "SF QB stable" or "QB room locked."
  id: "qb_stable",
  label: "QB Stable",
  blurb: "Two-plus high-value QBs in superflex / 2QB format.",
  axis: "archetype",
  appliesTo: SUPERFLEX_ONLY,
  topK: 3,
  // CALIBRATION TARGET.
  inThreshold: 170,
  closeThreshold: 120,
  formatScales: false,
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
  // CALIBRATION TARGET.
  inThreshold: 120,
  closeThreshold: 80,
  formatScales: false,
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
  blurb: "Tradeable consolidation depth (vets and matured assets) for 2-for-1 packages.",
  axis: "archetype",
  appliesTo: ALL_FORMATS,
  topK: 8,
  // CALIBRATION TARGET. Threshold restored to 440 (was briefly 420
  // tuned to one founder roster) per audit C.5 + F.1: sample-of-1
  // threshold-fitting is indefensible. Founder's 2026-05-11 roster
  // now reads CLOSE on Trade Capital, which is the honest read.
  inThreshold: 440,
  closeThreshold: 320,
  formatScales: false,
  scorePlayer(p) {
    const value = p.value ?? 0;
    if (value < 30) return 0;
    // Eligibility restriction per audit A.3: trade capital measures
    // CONSOLIDATION fodder (mature assets you can package), not raw
    // youth. Without this filter, Trade Capital and Future Stock
    // overlap heavily on young rosters and the user reads two
    // checkmarks for one underlying asset class. Players age 25+
    // (or veterans where age is unknown) count; younger rookies /
    // sophomores are excluded here because they already count in
    // Future Stock. Scarce-position rookies (TE in TE-premium, QB
    // in SF) are an exception: their tradeable value AS rookies is
    // a market reality.
    const isMatureVet =
      (p.age != null && p.age >= 25) ||
      (!p.is_rookie && p.age == null);
    if (!isMatureVet) {
      // Scarce-position rookie exception (Warren-shape).
      // is_rookie + scarce-position + value >= 50 still counts.
      // Otherwise filter out.
      // (We can't access snap from scorePlayer here without changing
      // the signature; the scarce check below is approximate by
      // position only. Real scarce check would need snap. For now,
      // any rookie TE or rookie QB at value 50+ gets in, since
      // those are the only positions where rookie trade value
      // routinely tracks veteran value.)
      const isRookieScarcePos =
        p.is_rookie &&
        (p.position === "TE" || p.position === "QB") &&
        value >= 50;
      if (!isRookieScarcePos) return 0;
    }
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
 * Base lane specs in render order. Horizon lanes first (timeline
 * read), then archetype lanes (roster-shape read). Derived lanes
 * (Sustained Contender, Zero-RB) computed AFTER base lanes resolve;
 * see DERIVED_LANE_SPECS + score.ts:aggregateRosterIdentity.
 */
export const LANE_SPECS: readonly LaneSpec[] = [
  WIN_NOW_FLOOR,
  BALANCED,
  FUTURE_STOCK,
  RB_BELLCOW,
  WR_ANCHOR,
  WR_STABLE,
  QB_STABLE,
  TE_PREMIUM_LOCK,
  TRADE_CAPITAL,
];

export function laneSpec(id: LaneId): LaneSpec {
  const found = LANE_SPECS.find((l) => l.id === id);
  if (!found) throw new Error(`Unknown base lane: ${id}`);
  return found;
}

/* ============================================================
 * Per-lane minimum contributor floor (uniformity guard)
 * ============================================================ */

/**
 * Some lanes (WR Stable explicitly) require not just a top-K sum
 * above threshold but also a minimum contribution per top-K slot.
 * Three WR2s at 60 each (uniform) is a "stable"; one WR1 at 100 plus
 * two replacement-tier at 40 each (sum 180) is not. This map captures
 * the per-lane min-of-top-K guard; aggregator applies it before the
 * sum threshold (score.ts:computeMembership).
 */
export const TOP_K_MIN_BY_LANE: Partial<Record<LaneId, number>> = {
  wr_stable: 45,
};
