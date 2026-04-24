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

export type ContenderOutlook = {
  years: ContenderYear[];
  // Synthesis. 2-3 sentences naming where the contender window is, where
  // it isn't, and the headline lever to protect or reach it.
  take: string;
  // 2-3 specific behaviors that preserve the trajectory (e.g. "Hold the
  // 2027 R1s from Sweat91, dbell0971, watticusgg"). Drawn from the
  // owned-pick map and the projected-roster shape.
  protect_bullets: string[];
};

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
