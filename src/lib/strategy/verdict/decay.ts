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
