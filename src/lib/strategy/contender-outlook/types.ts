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
