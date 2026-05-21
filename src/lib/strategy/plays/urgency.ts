/**
 * Play urgency. Canonical for turning per-partner survival math into a
 * graduated urgency, and for rolling per-partner urgencies up into a
 * single play urgency.
 *
 * CANONICAL_SOURCES.md "Play urgency (per-partner survival rolled up)".
 *
 * The whole point (founder direction 2026-05-20): a play's urgency is
 * NOT a fixed "next 4 picks" window. It comes from how likely the
 * pieces are to survive to the user's next pick. A high-value anchor
 * that goes in two picks is `act_now`; a partner nobody else wants is
 * `no_rush`.
 */

import type { PlayPlayerRef, Urgency } from "./types";

/**
 * Survival-to-urgency thresholds. P(survives) to the user's next pick.
 * Lower survival = more urgent.
 */
export function urgencyFromSurvival(survivalPct: number): Urgency {
  if (survivalPct < 25) return "act_now";
  if (survivalPct < 50) return "this_round";
  if (survivalPct < 75) return "two_round_cushion";
  return "no_rush";
}

/**
 * How much each urgency level outweighs the next when EV-weighting.
 * act_now dominates so a high-value piece about to leave the board
 * pulls the whole play to act_now even if the fallbacks are calm.
 */
export function urgencyScalar(urgency: Urgency): number {
  switch (urgency) {
    case "act_now":
      return 4;
    case "this_round":
      return 3;
    case "two_round_cushion":
      return 2;
    case "no_rush":
      return 1;
  }
}

const URGENCY_RANK: Record<Urgency, number> = {
  act_now: 3,
  this_round: 2,
  two_round_cushion: 1,
  no_rush: 0,
};

/**
 * The partner that drives the play's urgency: the one with the highest
 * (ev_contribution x urgencyScalar). A valuable piece that is also
 * about to leave the board wins. Value floor of 1 so a missing KTC
 * value still contributes its urgency. Returns null when no partner
 * carries a survival readout.
 */
export function urgentPartnerOf(
  partners: PlayPlayerRef[],
): PlayPlayerRef | null {
  const withSurvival = partners.filter((p) => p.survival != null);
  if (withSurvival.length === 0) return null;

  let best: { partner: PlayPlayerRef; weight: number } | null = null;
  for (const p of withSurvival) {
    const urgency = p.survival!.urgency;
    const value = Math.max(1, p.ktc_value ?? 1);
    const weight = value * urgencyScalar(urgency);
    if (
      !best ||
      weight > best.weight ||
      (weight === best.weight &&
        URGENCY_RANK[urgency] > URGENCY_RANK[best.partner.survival!.urgency])
    ) {
      best = { partner: p, weight };
    }
  }
  return best ? best.partner : null;
}

/**
 * Roll partner urgencies up into the play's overall urgency: the play
 * inherits the urgency of the EV-weighted urgent partner. Returns null
 * when no partner carries survival.
 */
export function derivePlayUrgency(partners: PlayPlayerRef[]): Urgency | null {
  return urgentPartnerOf(partners)?.survival?.urgency ?? null;
}

/**
 * Human label for an urgency, Voice A. Terse, no exclamation points.
 */
export function urgencyLabel(urgency: Urgency): string {
  switch (urgency) {
    case "act_now":
      return "act now";
    case "this_round":
      return "act this round";
    case "two_round_cushion":
      return "two-round cushion";
    case "no_rush":
      return "no rush";
  }
}
