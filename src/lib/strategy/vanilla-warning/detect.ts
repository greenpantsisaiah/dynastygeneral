/**
 * Vanilla / dynasty-purgatory detector.
 *
 * Fires when the user is drifting toward "Balanced & Forgettable". no
 * archetype showing meaningful drift, no clear trajectory, picks made
 * are scattered. The dynasty community consensus (per research) is
 * unanimous: this is the worst outcome.
 *
 * Thresholds:
 *   - max_drift < 0.35  AND
 *   - my_picks_made >= 3
 *
 * Below 3 picks we don't fire. too early to fairly judge. We instead
 * surface the steel-man "balance is fine TEMPORARILY" quote so the
 * user knows we're watching but not yet alarmed.
 */

import type { LeagueSnapshot } from "../league-state/snapshot";
import type { RankedArchetype } from "../archetypes/schema";
import {
  PURGATORY_QUOTES,
  BALANCED_DEFENSE_QUOTES,
  pickQuote,
  type Quote,
} from "./quotes";

const VANILLA_DRIFT_THRESHOLD = 0.35;
const MIN_PICKS_BEFORE_WARNING = 3;
const EARLY_TOLERANCE_MAX_PICKS = 2; // 0-2 picks → temporary-balance steel-man

export type VanillaWarningSeverity = "info" | "warning" | "critical";

export type VanillaWarning = {
  severity: VanillaWarningSeverity;
  headline: string;
  body: string;
  quote: Quote;
  diagnostic: string[];
  show_pivot_cta: boolean;
};

export function detectVanillaWarning(
  snap: LeagueSnapshot,
  ranked: RankedArchetype[],
): VanillaWarning | null {
  const me = snap.rosters.find((r) => r.is_me);
  if (!me) return null;

  // Count user's drafted picks (= player_ids on the merged roster, but
  // can also count from picks_made for accuracy).
  const myPicksCount = snap.draft.picks_made.filter(
    (p) => p.roster_id === me.roster_id,
  ).length;

  if (myPicksCount === 0) return null; // pre-pick, nothing to warn about

  const maxDrift = ranked.reduce(
    (max, r) => Math.max(max, r.drift_score),
    0,
  );

  // Steel-man: very early, balance is fine. Surface info-level reminder.
  if (myPicksCount <= EARLY_TOLERANCE_MAX_PICKS) {
    return {
      severity: "info",
      headline: "Optionality is fine. for now",
      body: "Early picks are the right time to keep doors open. The warning fires if you're still drifting balanced past Pick 3.",
      quote: pickQuote(BALANCED_DEFENSE_QUOTES, myPicksCount),
      diagnostic: [
        `${myPicksCount} pick${myPicksCount === 1 ? "" : "s"} in. too early to demand commitment`,
      ],
      show_pivot_cta: false,
    };
  }

  if (myPicksCount >= MIN_PICKS_BEFORE_WARNING && maxDrift < VANILLA_DRIFT_THRESHOLD) {
    const diagnostic: string[] = [
      `${myPicksCount} picks in, max drift only ${Math.round(maxDrift * 100)}%`,
      `No archetype has clear momentum on your roster`,
    ];

    // Add 1-2 evidence-style diagnostics from picks made
    if (me.avg_age != null) {
      if (me.avg_age >= 26 && me.avg_age <= 28) {
        diagnostic.push(
          `Roster avg age ${me.avg_age.toFixed(1)}. neither young enough to rebuild nor old enough to all-in`,
        );
      }
    }

    const positionsHit = new Set(
      snap.draft.picks_made
        .filter((p) => p.roster_id === me.roster_id && p.position)
        .map((p) => p.position),
    );
    if (positionsHit.size === myPicksCount && myPicksCount >= 3) {
      diagnostic.push(
        `Each of your ${myPicksCount} picks at a different position. no concentration anywhere`,
      );
    }

    const severity: VanillaWarningSeverity =
      maxDrift < 0.2 && myPicksCount >= 5 ? "critical" : "warning";

    return {
      severity,
      headline:
        severity === "critical"
          ? "Vanilla drift detected. pick a lane now"
          : "You're drifting toward the middle",
      body:
        severity === "critical"
          ? "No path has meaningful momentum on your roster. Vanilla teams have nothing scarce to trade. they don't win, don't rebuild, and stay in purgatory for years. Lock a direction in your next 1-2 picks or commit to a deliberate balanced strategy."
          : "No archetype has emerged from your picks yet. Past Pick 3, lack of direction starts becoming a real cost. Mark a primary direction in the board below. even a soft one is better than none.",
      quote: pickQuote(PURGATORY_QUOTES, myPicksCount + Math.floor(maxDrift * 100)),
      diagnostic,
      show_pivot_cta: true,
    };
  }

  return null;
}
