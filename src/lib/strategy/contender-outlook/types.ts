/**
 * Shared types for the Contender Outlook synthesis.
 *
 * The outlook answers a different question than the WindowsBar:
 * "where does my current trajectory put me in years 2026 through 2030?"
 * not "am I on plan vs my declared target right now?"
 */

export type ContenderTier = "rebuild" | "bubble" | "contender";

export type ContenderYear = {
  season: string; // "2026", "2027", etc.
  // Projected win-now score 0-100 if THIS user's roster ages to that year
  // and any owned future picks landing on or before that year materialize
  // as expected-value rookies.
  score: number;
  tier: ContenderTier;
};

// Confidence stage of the outlook. Derived from how many roster anchors
// the user actually has at render time (= player_ids.length on their
// roster snapshot). The 5-year forecast is mathematically derived from
// aged-roster contribution + materialized future picks; with too few
// real anchors the variance dominates the signal and conclusive tier
// labels (Rebuild/Bubble/Contender) project false precision.
//
// Per cross-panel decision framework (statistician + dynasty pro
// derivation, 2026-04-24):
//   forming      0-4 anchors    no conclusive tier; directional only
//   trending     5-12 anchors   "trending [tier]" with confidence band
//   provisional  13-24 anchors  "[tier] (provisional)" with pivot conditions
//   earned       25+ anchors    conclusive tier earned
//
// Math: at n=3 anchors, forecast SD is ~±15-20 points, exceeding the
// 15-point Rebuild/Bubble/Contender band widths. A point estimate of
// "55/100 Rebuild" is statistically indistinguishable from "70/100
// Bubble"; surfacing a hard label is dishonest. The thresholds map to
// dynasty startup roster fractions: 5/33 ≈ 15%, 13/33 ≈ 40%, 25/33 ≈ 75%.
export type ConfidenceStage =
  | "forming"
  | "trending"
  | "provisional"
  | "earned";

export type ContenderOutlook = {
  years: ContenderYear[];
  // Synthesis. 2-3 sentences naming where the contender window is, where
  // it isn't, and the headline lever to protect or reach it.
  take: string;
  // 2-3 specific behaviors that preserve the trajectory (e.g. "Hold the
  // 2027 R1s from Sweat91, dbell0971, watticusgg"). Drawn from the
  // owned-pick map and the projected-roster shape.
  protect_bullets: string[];
  // Calibration stage. UI uses this to decide whether to render
  // conclusive labels (Rebuild/Contender) or softer framings
  // ("Forming", "Trending Bubble"). Downstream branching that needs
  // raw scores still uses years[i].score / .tier directly.
  confidence_stage: ConfidenceStage;
  // Number of named roster anchors the forecast is derived from.
  // Surfaced in the UI so users can see the evidence base.
  anchor_count: number;
};

export const CONFIDENCE_THRESHOLDS = {
  forming_max: 4,
  trending_max: 12,
  provisional_max: 24,
} as const;

export function deriveConfidenceStage(anchorCount: number): ConfidenceStage {
  if (anchorCount <= CONFIDENCE_THRESHOLDS.forming_max) return "forming";
  if (anchorCount <= CONFIDENCE_THRESHOLDS.trending_max) return "trending";
  if (anchorCount <= CONFIDENCE_THRESHOLDS.provisional_max) return "provisional";
  return "earned";
}

export const TIER_THRESHOLD_CONTENDER = 75;
export const TIER_THRESHOLD_BUBBLE = 60;
// Fuzz band around each threshold. Per audit 2026-04-23 MEDIUM #5:
// hard cutoffs at 60/75 produce label flicker (74.8 reads "Bubble"
// while 75.1 reads "Contender" despite an identical underlying
// signal). The base tier is unchanged for downstream logic; this
// only widens the *display label* when a score is within FUZZ of a
// boundary. Mirrors the soft-band approach already used in
// projectRosterForYear's age-factor interpolation.
export const TIER_FUZZ = 4;

export function tierForScore(score: number): ContenderTier {
  if (score >= TIER_THRESHOLD_CONTENDER) return "contender";
  if (score >= TIER_THRESHOLD_BUBBLE) return "bubble";
  return "rebuild";
}

export function tierLabel(tier: ContenderTier): string {
  switch (tier) {
    case "contender":
      return "Contender";
    case "bubble":
      return "Bubble";
    case "rebuild":
      return "Rebuild";
  }
}

/**
 * Display-only label that adds "near Contender" / "near Bubble"
 * suffixes when the score sits within TIER_FUZZ of a boundary. Use
 * for visible UI strings; use tierLabel(tier) directly for
 * downstream branching logic that must stay categorical.
 */
export function tierLabelFuzzy(tier: ContenderTier, score: number): string {
  const base = tierLabel(tier);
  if (
    tier === "bubble" &&
    score >= TIER_THRESHOLD_CONTENDER - TIER_FUZZ
  ) {
    return `${base}, near Contender`;
  }
  if (tier === "rebuild" && score >= TIER_THRESHOLD_BUBBLE - TIER_FUZZ) {
    return `${base}, near Bubble`;
  }
  if (
    tier === "contender" &&
    score < TIER_THRESHOLD_CONTENDER + TIER_FUZZ
  ) {
    return `${base}, low end`;
  }
  return base;
}
