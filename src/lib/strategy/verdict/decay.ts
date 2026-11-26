/**
 * Offseason value decay: how much of a player's market value is expected
 * to be gone by the next keeper / rookie-draft window if he is held.
 * Registered as offseason_value_decay@v1 (hypothesis). Reads the one
 * canonical age curve (ageRetention); never re-derives an aging shape.
 *
 * Model: value scales with production retention, so the share kept after
 * `years` is ageRetention(age + years) / ageRetention(age). Young players
 * can come out above 1 (appreciation); the sign is kept.
 *
 * Honest caveat: the market already prices age, so this may double count.
 * That is exactly what the ledger tests (baseline: no change).
 */

import { ageRetention } from "@/lib/players/age-curve";

/** Late November to the August keeper deadline, in years. */
export const OFFSEASON_YEARS = 0.75;

export type LeagueType = "redraft" | "keeper" | "dynasty";
/**
 * What the sell-or-keep call is about. Redraft rosters reset after the
 * season, so nothing a player is worth next August belongs to the user:
 * the call reads only this season's chances (design QA on #142, 2026-11-26:
 * redraft leagues were told a sale "avoids about 6 value points of
 * offseason drop"). Keeper and dynasty rosters carry players over.
 */
export type VerdictHorizon = "this_season" | "next_season";

export function verdictHorizon(leagueType: LeagueType | null | undefined): VerdictHorizon {
  return leagueType === "redraft" ? "this_season" : "next_season";
}

/** Years of age decay a held player carries into value the user keeps. */
export function decayYearsFor(horizon: VerdictHorizon): number {
  return horizon === "this_season" ? 0 : OFFSEASON_YEARS;
}

export interface DecayRead {
  retained_share: number;
  /** Value points lost by holding (negative = expected to gain). */
  value_lost: number;
  value_now: number;
  value_later: number;
}

export function offseasonValueDecay(args: {
  value: number;
  position: string | null;
  age: number | null;
  years?: number;
}): DecayRead {
  const years = args.years ?? OFFSEASON_YEARS;
  const now = ageRetention(args.position, args.age);
  const later = ageRetention(args.position, args.age == null ? null : args.age + years);
  const share = now > 0 ? later / now : 1;
  const valueLater = args.value * share;
  return {
    retained_share: share,
    value_lost: args.value - valueLater,
    value_now: args.value,
    value_later: valueLater,
  };
}
