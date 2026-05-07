/**
 * Inflection-window detection. For a player + their context, return the
 * list of inflection windows they're currently in. A player can be in
 * zero, one, or multiple windows simultaneously.
 *
 * Keep detection cheap: it runs for every player in the available pool.
 * Resolution (heavier work: signals, comparators, prose) only runs for
 * players who are in at least one window.
 */

import type { InflectionInputs } from "./types";

export type ActiveWindow =
  | "aging_cliff_rb"
  | "aging_cliff_wr"
  | "aging_cliff_te"
  | "aging_cliff_qb"
  | "rookie_debut"
  | "post_major_injury";

/**
 * Detect aging-cliff window. Position-specific thresholds reflect
 * documented age-decline curves: RB cliff at 28+ (or 1500+ career
 * carries, whichever first), WR / TE at 30+, QB at 36+.
 *
 * Sources:
 *   - Football Outsiders RB age-curve studies
 *   - Berri "The Wages of Wins" position aging curves
 *   - PFF cohort tracking on aging skill positions
 */
function detectAgingCliff(p: InflectionInputs): ActiveWindow | null {
  if (p.age == null) return null;
  switch (p.position) {
    case "RB": {
      if (p.age >= 28) return "aging_cliff_rb";
      const carries = p.career_carries;
      if (carries != null && carries >= 1500) return "aging_cliff_rb";
      return null;
    }
    case "WR":
      return p.age >= 30 ? "aging_cliff_wr" : null;
    case "TE":
      return p.age >= 30 ? "aging_cliff_te" : null;
    case "QB":
      return p.age >= 36 ? "aging_cliff_qb" : null;
    default:
      return null;
  }
}

/**
 * Detect rookie-debut window. Year 1 in NFL.
 */
function detectRookieDebut(p: InflectionInputs): ActiveWindow | null {
  if (p.years_exp == null) return null;
  if (p.years_exp !== 0) return null;
  // Skip K / DST.
  if (p.position !== "QB" && p.position !== "RB" && p.position !== "WR" && p.position !== "TE") {
    return null;
  }
  return "rookie_debut";
}

/**
 * Detect post-major-injury return window.
 *
 * Phase 1 limitation: our pipeline doesn't yet have a clean
 * `recent_major_injury` signal. We use compounding_news_count >= 3 as a
 * partial proxy for "lots of news around this player," which often
 * correlates with injury / role-uncertainty narratives. This is honest:
 * the signal is WEAK by design until we add an `rb_injury_recovery_status`
 * extraction pass per the 2026-05-07 calibration recommendation.
 *
 * The detection threshold is deliberately permissive (catches more, with
 * scorecard signals showing data missing). False-positive cost is low
 * (the user just sees the bifurcation panel and the data-missing flags).
 */
function detectPostInjury(p: InflectionInputs): ActiveWindow | null {
  if (p.compounding_news_count == null) return null;
  if (p.compounding_news_count >= 3) return "post_major_injury";
  return null;
}

/**
 * Returns the list of active windows for this player. May be empty.
 * Multiple windows can fire simultaneously.
 */
export function detectInflectionWindows(p: InflectionInputs): ActiveWindow[] {
  const out: ActiveWindow[] = [];
  const aging = detectAgingCliff(p);
  if (aging) out.push(aging);
  const rookie = detectRookieDebut(p);
  if (rookie) out.push(rookie);
  const injury = detectPostInjury(p);
  if (injury) out.push(injury);
  return out;
}
