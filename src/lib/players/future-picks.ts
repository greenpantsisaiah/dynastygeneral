/**
 * Future-pick valuation primitives. Single source of truth for the
 * scout (`scoreTeamForLeague`) and the windows engine (the "Future
 * picks held" component of the future-earned-value window).
 *
 * Calibration source: KeepTradeCut snapshot 2026-04-22. Round-base
 * values are anchored to 2027 Mid-1st / WR1 ratio (5638 / 9998 ≈ 0.564)
 * which implies R1 ≈ 100 on the scout's 180-point dynasty scale. R2/R3/R4
 * ratios pulled from KTC 2027 Early 2nd (3800) and DLF/FantasyCalc
 * consensus on round spacing. Year decay matches the KTC-implied
 * 2028 Mid / 2027 Mid ratio (0.80) per the assumption auditor's
 * `audit:future-picks` finding (2026-04-22).
 *
 * Re-anchor whenever the gap between this scale and the KTC market
 * exceeds ±15% on representative picks. Don't shave decimals; the
 * precision isn't there.
 */

import type { TradedPick } from "@/lib/sleeper/draft-state";

export const FUTURE_PICK_VALUE_BY_ROUND: Record<number, number> = {
  1: 100, // 2027 Mid 1st ≈ 56% of WR1 per KTC; on our 180 scale: ~100
  2: 60, // KTC R2/R1 ≈ 0.67 (2027 Early 2nd / 2027 Early 1st)
  3: 28, // KTC R3/R1 ≈ 0.28 typical
};
export const FUTURE_PICK_VALUE_LATE = 12; // R4+, KTC R4/R1 ≈ 0.12

export const FUTURE_PICK_YEAR_DECAY: Record<number, number> = {
  1: 1.0, // next season: full value
  2: 0.8, // +2 seasons (matches KTC implied 2028 Mid / 2027 Mid = 0.80)
  3: 0.6, // +3 seasons
  4: 0.45, // +4 seasons (extrapolated; KTC doesn't price this far out)
  5: 0.32, // +5 seasons (rare; lottery-ticket values)
};

// Smooth decay continues to year 5 rather than the prior hard cutoff
// at year 3 (a 0/non-zero discontinuity in a continuous quantity).
export const FUTURE_PICK_HORIZON = 5;

// Class-strength override. The market currently bids 2027 picks ABOVE
// 2026 picks because the 2027 class is perceived stronger; flat year
// decay misses this. Source: FantasyLife (Apr 2026) reporting
// rebuilders accumulating 2027 picks "with little to no interest in
// 2026 picks." KTC corroborates: 2027 Early 1st (6913) > 2026 Mid 1st
// (4677). Refresh annually; default 1.0 for unknown seasons.
export const CLASS_STRENGTH_MULTIPLIER: Record<string, number> = {
  "2026": 0.95,
  "2027": 1.10,
  "2028": 1.0,
  "2029": 1.0,
};

// Superflex format inflates pick value because rookie QBs add scarcity-
// premium upside. Industry consensus is ~30-50% QB premium in SF; we
// apply a conservative 1.20× to all SF-league pick values pending
// position-specific class adjustments.
export const SUPERFLEX_PICK_MULTIPLIER = 1.20;

/**
 * Approximate STARTUP-draft pick value on a 0-100 scale, calibrated to
 * the KTC startup pick chart (Apr 2026 snapshot). NOT for rookie/future
 * picks (use `valueForFuturePick` for those).
 *
 * Why this exists: Coach was freelancing trade pricing for startup
 * picks because no scale was plumbed. Result: "offer 6.2 for 4.3"
 * confidently proposed as a fair ask when KTC says pick 39 ≈ 2x pick 62.
 * Any pick value here, even rough, makes the LLM contradict the data
 * on the table rather than make up numbers from nothing.
 *
 * Piecewise-linear interpolation between anchor points. Anchors derived
 * from KTC startup-pick chart 2026-04-22:
 *   pick 1   ≈ 100   (1.01)
 *   pick 12  ≈ 83    (1.12)
 *   pick 24  ≈ 62    (2.12)
 *   pick 36  ≈ 45    (3.12)
 *   pick 48  ≈ 34    (4.12)
 *   pick 60  ≈ 25    (5.12)
 *   pick 84  ≈ 15    (7.12)
 *   pick 120 ≈ 8     (10.12)
 *   pick 150+ ≈ 3-5  (13+)
 *
 * Re-anchor when the gap to KTC exceeds ±15% on representative picks.
 * Don't shave decimals; the precision isn't there.
 */
export function startupPickValue(overallPick: number): number {
  if (overallPick <= 1) return 100;
  if (overallPick <= 12) return 100 - (overallPick - 1) * 1.55;
  if (overallPick <= 24) return 83 - (overallPick - 12) * 1.75;
  if (overallPick <= 36) return 62 - (overallPick - 24) * 1.42;
  if (overallPick <= 48) return 45 - (overallPick - 36) * 0.92;
  if (overallPick <= 60) return 34 - (overallPick - 48) * 0.75;
  if (overallPick <= 84) return Math.max(15, 25 - (overallPick - 60) * 0.42);
  if (overallPick <= 120) return Math.max(8, 15 - (overallPick - 84) * 0.20);
  return Math.max(3, 8 - (overallPick - 120) * 0.04);
}

// Default Sleeper rookie-draft round count when we can't read it from
// draft.settings.rounds. 4 is the modal dynasty league setup.
export const DEFAULT_ROOKIE_ROUNDS = 4;

// Rookie drafts realistically run 4-6 rounds. Startup drafts run 20+.
// When the active draft is a STARTUP, snap.draft.rounds returns that
// big number and using it for future-pick enumeration produces absurd
// counts (e.g., "150 future picks owned"). Cap so we always treat the
// future-pick horizon as a rookie-draft horizon.
const MAX_PLAUSIBLE_ROOKIE_ROUNDS = 6;

/**
 * Resolve the rookie-round count to use for future-pick enumeration.
 * Falls back to DEFAULT_ROOKIE_ROUNDS when the source rounds is missing
 * or implausibly large (likely a startup-draft setting bleeding through).
 */
export function resolveRookieRounds(rawRounds: number | null | undefined): number {
  if (typeof rawRounds !== "number" || rawRounds <= 0) {
    return DEFAULT_ROOKIE_ROUNDS;
  }
  if (rawRounds > MAX_PLAUSIBLE_ROOKIE_ROUNDS) return DEFAULT_ROOKIE_ROUNDS;
  return rawRounds;
}

export function valueForFuturePick(
  round: number,
  yearOffset: number,
): number {
  if (yearOffset < 1 || yearOffset > FUTURE_PICK_HORIZON) return 0;
  const base = FUTURE_PICK_VALUE_BY_ROUND[round] ?? FUTURE_PICK_VALUE_LATE;
  const decay = FUTURE_PICK_YEAR_DECAY[yearOffset] ?? 0;
  return base * decay;
}

export type OwnedPick = { season: string; round: number; count: number };

export function computeOwnedFuturePicks(args: {
  rosterId: number;
  rosterIds: number[];
  tradedPicks: TradedPick[];
  leagueSeason: string;
  rounds: number;
}): OwnedPick[] {
  const { rosterId, rosterIds, tradedPicks, leagueSeason, rounds } = args;
  const currentYear = parseInt(leagueSeason, 10);
  if (!Number.isFinite(currentYear) || rounds <= 0) return [];
  // Trade override map: (season, round, original_owner) → current_owner.
  // Picks not in this map default to original_owner == roster.roster_id.
  const overrides = new Map<string, number>();
  for (const t of tradedPicks) {
    overrides.set(
      `${t.season}:${t.round}:${t.original_owner}`,
      t.current_owner,
    );
  }
  const counts = new Map<string, number>();
  for (let yr = currentYear + 1; yr <= currentYear + FUTURE_PICK_HORIZON; yr++) {
    const season = String(yr);
    for (let round = 1; round <= rounds; round++) {
      for (const rid of rosterIds) {
        const key = `${season}:${round}:${rid}`;
        const owner = overrides.get(key) ?? rid;
        if (owner === rosterId) {
          const k = `${season}:${round}`;
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
    }
  }
  return Array.from(counts.entries())
    .map(([k, count]) => {
      const [season, roundStr] = k.split(":");
      return { season, round: Number(roundStr), count };
    })
    .sort(
      (a, b) =>
        a.season.localeCompare(b.season) || a.round - b.round,
    );
}

/**
 * Expected dynasty value of the rookie produced by a future pick,
 * post-NFL-draft. Used by the contender-outlook forecast to materialize
 * "the player this pick becomes" once the pick has landed in some prior
 * year, then age that player forward via the position age curve.
 *
 * Hit-rate priors (top-24 seasonal finish, years 1-3 inclusive,
 * blended across positions):
 *   R1 ≈ 50%, R2 ≈ 30%, R3 ≈ 15%, R4+ ≈ 6%.
 * Sources: The Dynasty Guru "How Often Do Rookie Picks Hit?" (45.8%
 * R1, 30.6% R2), IDP Show 2018-2022 update (56% R1, 33.3% R2),
 * Campus2Canton WR-only data (48.7% R1 WR top-24). These are
 * multi-year hit windows, not year-1-only; the prior "top-24 year 1"
 * framing was undercounting hits per the assumption auditor's
 * 2026-04-22 review (audit:specific). Coarse blends across
 * QB/RB/WR/TE; v2 will split by position.
 *
 * If-hit value (100) anchors to a typical top-24 post-rookie-year
 * dynasty value on the scout's 180-point scale (top-24 mean of the
 * KTC class median; well above replacement, below the elite ceiling).
 * If-miss value (15) is "waiver-wire-replaceable" residual. Hit-rate
 * weighted:
 *   R1  = 0.50*100 + 0.50*15 = 57.5
 *   R2  = 0.30*100 + 0.70*15 = 40.5
 *   R3  = 0.15*100 + 0.85*15 = 27.75
 *   R4+ = 0.06*100 + 0.94*15 = 20.1
 *
 * Class-strength + format multipliers (passed in by caller) layer on
 * top so a 2027 pick worth more in the SF market gets the same lift
 * as `valueForFuturePick` already grants.
 */
const ROOKIE_HIT_RATE_BY_ROUND: Record<number, number> = {
  1: 0.50,
  2: 0.30,
  3: 0.15,
};
const ROOKIE_HIT_RATE_LATE = 0.06;
const ROOKIE_HIT_VALUE = 100;
const ROOKIE_MISS_VALUE = 15;

export function expectedRookieValue(
  round: number,
  classStrengthMultiplier: number,
  formatMultiplier: number,
): number {
  const hitRate =
    ROOKIE_HIT_RATE_BY_ROUND[round] ?? ROOKIE_HIT_RATE_LATE;
  const blended =
    hitRate * ROOKIE_HIT_VALUE + (1 - hitRate) * ROOKIE_MISS_VALUE;
  return blended * classStrengthMultiplier * formatMultiplier;
}

export function totalFuturePickValue(
  picks: OwnedPick[],
  leagueSeason: string,
  formatMultiplier: number,
): number {
  const currentYear = parseInt(leagueSeason, 10);
  if (!Number.isFinite(currentYear)) return 0;
  let total = 0;
  for (const p of picks) {
    const yr = parseInt(p.season, 10);
    if (!Number.isFinite(yr)) continue;
    const classStrength = CLASS_STRENGTH_MULTIPLIER[p.season] ?? 1.0;
    total +=
      valueForFuturePick(p.round, yr - currentYear) *
      p.count *
      classStrength *
      formatMultiplier;
  }
  return total;
}
