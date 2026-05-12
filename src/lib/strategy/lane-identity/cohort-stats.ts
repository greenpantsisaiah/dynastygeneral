/**
 * Baked cohort distribution statistics per lane. Generated 2026-05-08
 * from cohort.json (82 rosters across 5 dynasty / keeper leagues).
 *
 * Used by the hub's statistical-claims chart to render the per-lane
 * score distribution with the user's roster score marked in context.
 * Honors REDESIGN_INTENTIONS principle 0 (every quantitative claim
 * carries a defensible source and provenance) + principle 3
 * (statistical credibility surfaced, not yelled).
 *
 * Cohort source data is gitignored (cohort.json contains roster-level
 * info). The aggregate bins + percentiles + n baked here are anonymous
 * and safe to ship.
 *
 * Regeneration: run `node` against cohort.json with the bake script
 * recorded in the project memory. Composite-axis lanes are included
 * but axis === "composite" callers should treat the binning as
 * discrete rather than continuous.
 */

import type { LaneId } from "./types";

export type LaneCohortStats = {
  label: string;
  axis: "horizon" | "archetype" | "composite";
  in_threshold: number;
  close_threshold: number;
  /** Sample size (rosters in cohort that had this lane scored). */
  n: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  /** Upper edge of the binned range. Bin i covers [i*bin_width, (i+1)*bin_width). */
  range_max: number;
  bin_width: number;
  /** 20 evenly-spaced bins from 0 to range_max. Tail captured in final bin. */
  bins: number[];
};

export const COHORT_TOTAL = 82;
export const COHORT_LEAGUE_COUNT = 5;
export const COHORT_GENERATED_AT = "2026-05-08";

export const COHORT_STATS_BY_LANE: Record<LaneId, LaneCohortStats> = {
  win_now_floor: {
    label: "Win-Now Floor",
    axis: "horizon",
    in_threshold: 300,
    close_threshold: 200,
    n: 82,
    p10: 0,
    p25: 0,
    p50: 246,
    p75: 310,
    p90: 352,
    range_max: 450,
    bin_width: 22.5,
    bins: [24, 0, 0, 0, 1, 1, 2, 1, 5, 3, 4, 8, 6, 8, 8, 4, 3, 1, 2, 1],
  },
  balanced: {
    label: "Balanced",
    axis: "horizon",
    in_threshold: 240,
    close_threshold: 160,
    n: 82,
    p10: 0,
    p25: 0,
    p50: 157,
    p75: 244,
    p90: 311,
    range_max: 433,
    bin_width: 21.67,
    bins: [27, 0, 1, 2, 4, 1, 5, 7, 4, 4, 3, 7, 4, 3, 5, 2, 0, 0, 2, 1],
  },
  future_stock: {
    label: "Future Stock",
    axis: "horizon",
    in_threshold: 320,
    close_threshold: 200,
    n: 82,
    p10: 0,
    p25: 0,
    p50: 103,
    p75: 283,
    p90: 397,
    range_max: 531,
    bin_width: 26.53,
    bins: [30, 0, 9, 2, 7, 2, 0, 8, 1, 0, 4, 2, 3, 3, 2, 3, 2, 2, 0, 2],
  },
  rb_bellcow: {
    label: "RB Bellcow",
    axis: "archetype",
    in_threshold: 75,
    close_threshold: 50,
    n: 82,
    p10: 0,
    p25: 0,
    p50: 0,
    p75: 47,
    p90: 97,
    range_max: 100,
    bin_width: 5,
    bins: [53, 0, 0, 0, 0, 0, 0, 3, 3, 6, 1, 0, 0, 0, 3, 3, 0, 0, 0, 10],
  },
  wr_anchor: {
    label: "WR Anchor",
    axis: "archetype",
    in_threshold: 80,
    close_threshold: 55,
    n: 82,
    p10: 0,
    p25: 0,
    p50: 0,
    p75: 56,
    p90: 87,
    range_max: 96,
    bin_width: 4.8,
    bins: [58, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 0, 0, 0, 1, 3, 7, 3],
  },
  wr_stable: {
    label: "WR Stable",
    axis: "archetype",
    in_threshold: 140,
    close_threshold: 100,
    n: 82,
    p10: 0,
    p25: 0,
    p50: 49,
    p75: 85,
    p90: 116,
    range_max: 176,
    bin_width: 8.79,
    bins: [28, 0, 8, 1, 0, 8, 3, 4, 6, 4, 6, 3, 0, 5, 1, 1, 1, 1, 0, 2],
  },
  qb_stable: {
    label: "QB Stable",
    axis: "archetype",
    in_threshold: 140,
    close_threshold: 100,
    n: 48,
    p10: 0,
    p25: 0,
    p50: 67,
    p75: 96,
    p90: 123,
    range_max: 168,
    bin_width: 8.4,
    bins: [15, 0, 0, 4, 1, 0, 2, 2, 4, 1, 5, 3, 3, 1, 2, 2, 0, 0, 2, 1],
  },
  te_premium_lock: {
    label: "TE-Premium Lock",
    axis: "archetype",
    in_threshold: 90,
    close_threshold: 60,
    n: 60,
    p10: 0,
    p25: 0,
    p50: 0,
    p75: 40,
    p90: 88,
    range_max: 125,
    bin_width: 6.23,
    bins: [39, 0, 0, 0, 5, 0, 2, 0, 2, 3, 0, 0, 1, 1, 2, 3, 0, 1, 0, 1],
  },
  trade_capital: {
    label: "Trade Capital",
    axis: "archetype",
    in_threshold: 190,
    close_threshold: 130,
    n: 82,
    p10: 0,
    p25: 0,
    p50: 106,
    p75: 171,
    p90: 216,
    range_max: 262,
    bin_width: 13.1,
    bins: [24, 0, 3, 3, 1, 2, 3, 4, 4, 5, 7, 4, 1, 4, 4, 4, 2, 3, 2, 2],
  },
  sustained_contender: {
    label: "Sustained Contender",
    axis: "composite",
    in_threshold: 3,
    close_threshold: 2,
    n: 82,
    p10: 0,
    p25: 0,
    p50: 1,
    p75: 2,
    p90: 3,
    range_max: 4,
    bin_width: 0.2,
    bins: [41, 0, 0, 0, 0, 16, 0, 0, 0, 0, 0, 13, 0, 0, 0, 0, 12, 0, 0, 0],
  },
  zero_rb: {
    label: "Zero-RB",
    axis: "composite",
    in_threshold: 2,
    close_threshold: 1,
    n: 82,
    p10: 0,
    p25: 1,
    p50: 1,
    p75: 1,
    p90: 2,
    range_max: 2,
    bin_width: 0.1,
    bins: [13, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0],
  },
};

/**
 * Percentile rank of a given score within the lane cohort. Linear
 * interpolation between known percentile anchors so we can render
 * "you sit at the 73rd percentile" type chrome.
 */
export function percentileForScore(lane: LaneId, score: number): number {
  const s = COHORT_STATS_BY_LANE[lane];
  if (!s) return 0;
  const anchors: Array<[number, number]> = [
    [0, 0],
    [s.p10, 10],
    [s.p25, 25],
    [s.p50, 50],
    [s.p75, 75],
    [s.p90, 90],
    [Math.max(s.range_max, s.p90 + 1), 100],
  ];
  if (score <= anchors[0][0]) return 0;
  for (let i = 1; i < anchors.length; i++) {
    const [aScore, aPct] = anchors[i];
    if (score <= aScore) {
      const [pScore, pPct] = anchors[i - 1];
      const span = aScore - pScore;
      if (span <= 0) return aPct;
      const t = (score - pScore) / span;
      return Math.round(pPct + t * (aPct - pPct));
    }
  }
  return 100;
}
