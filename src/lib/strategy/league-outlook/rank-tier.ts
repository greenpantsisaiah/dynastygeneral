/**
 * Canonical relative-rank tier helper for league standings surfaces.
 *
 * The OLD per-team `peak_tier` field on LeagueOutlookTeam uses
 * absolute score thresholds (e.g. "anything above 70 is a Contender").
 * That works for a single-team scout view, but it falls apart on the
 * league standings table for compressed leagues: when 10 of 12 rosters
 * cluster within 25 points of each other, every team above the floor
 * lands in "Contender" and the label stops differentiating anything.
 *
 * The fix is to label by RELATIVE rank inside the league, not by
 * absolute score. Both league-table.tsx and league-divergence.tsx
 * consume this helper so the public standings table and the in-app
 * standings view agree on who is a contender in this league.
 *
 * Bands match what league-divergence shipped 2026-04-29:
 *   - Top quartile (floor(total/4), min 1): Contender
 *   - Next two-thirds up to ceil(total * 0.66): In the mix
 *   - Bottom third: Long shot
 *
 * Founder report 2026-05-15 (watticusgg, dynasty rebuild league):
 * the public standings table labeled 9 of 10 rosters "Contender"
 * including a team in a clear rebuild. The in-app standings already
 * showed "Long shot" for the same team using the relative system.
 * Two surfaces drifted off the same concept; consolidate.
 */

export type RankTier = "contender" | "mix" | "longshot";

export type RankTierLabel = {
  label: string;
  tone: RankTier;
};

/**
 * Map a 1-indexed rank inside a league of `total` teams to a relative
 * tier label. Stable across formats: a 12-team league produces 3
 * contenders; a 10-team league produces 2; a 4-team league produces 1.
 */
export function tierForLeagueRank(
  rank: number,
  total: number,
): RankTierLabel {
  if (rank <= Math.max(1, Math.floor(total / 4))) {
    return { label: "Contender", tone: "contender" };
  }
  if (rank <= Math.ceil(total * 0.66)) {
    return { label: "In the mix", tone: "mix" };
  }
  return { label: "Long shot", tone: "longshot" };
}
