/**
 * Opening detection. An opening is when an archetype becomes
 * unusually viable RIGHT NOW because of what other teams have or
 * haven't done. Openings can fire even when fit_signals are weak -
 * this is how the system surfaces "you're not currently set up for
 * this, but the league is giving you a 30-second window" (e.g. the
 * QB Cartel scenario where 7 teams hadn't drafted a QB after Rd 2).
 *
 * An opening contributes a fit-score boost AND a visible badge label
 * ("QB hole opening in front of you") for the UI to highlight.
 */

import type {
  ActiveOpening,
  Archetype,
  OpeningSignal,
} from "../archetypes/schema";
import type { LeagueSnapshot } from "../league-state/snapshot";

const OPENING_BOOST_PER_SIGNAL = 0.4; // a single firing opening lifts an archetype to "consider this"

function evalOpening(
  signal: OpeningSignal,
  snap: LeagueSnapshot,
): ActiveOpening | null {
  switch (signal.kind) {
    case "league_position_scarcity_after_round": {
      const nextPick = snap.draft.next_pick_no ?? Infinity;
      const passedRound = nextPick > signal.round * snap.total_teams;
      if (!passedRound) return null;
      const historical = snap.agg.teams_without_position_after_round(
        signal.position,
        signal.round,
      );
      if (historical < signal.threshold_teams_without) return null;

      // Live decay: count teams CURRENTLY below starter need at this
      // position. If they've all covered themselves the opening is
      // closed. Strength = currentShort / historical, capped at 1.
      const isSuperflexQB =
        signal.position === "QB" &&
        (snap.format === "superflex" || snap.format === "2qb");
      const currentThreshold = isSuperflexQB ? 2 : 1;
      const currentShort = snap.rosters.filter(
        (r) => r.position_counts[signal.position] < currentThreshold,
      ).length;
      const strength =
        historical > 0 ? Math.min(1, currentShort / historical) : 0;
      // Below 0.1 strength the opening is essentially closed. Drop it
      // so the UI doesn't surface a stale badge claiming the room is
      // QB-thin when actually all 12 teams have 3+ QBs.
      if (strength < 0.1) return null;

      const decay_note =
        currentShort < historical
          ? `${historical} were short at R${signal.round}; ${currentShort} still are`
          : undefined;
      return {
        label: signal.label,
        signal_kind: signal.kind,
        strength,
        decay_note,
      };
    }
    case "league_position_overdrafted_through_round": {
      const nextPick = snap.draft.next_pick_no ?? Infinity;
      const passedRound = nextPick > signal.round * snap.total_teams;
      if (!passedRound) return null;
      const drafted = snap.draft.picks_made.filter(
        (p) => p.round <= signal.round && p.position === signal.position,
      ).length;
      if (drafted < signal.threshold_picks) return null;
      // "Overdrafted" is a backwards-looking historical signal; the
      // imbalance it captures doesn't decay (the picks already happened).
      // Full strength always. We can refine this later if needed.
      return {
        label: signal.label,
        signal_kind: signal.kind,
        strength: 1,
      };
    }
  }
}

export function detectOpenings(
  archetype: Archetype,
  snap: LeagueSnapshot,
): { active: ActiveOpening[]; boost: number } {
  const signals = archetype.opening_signals ?? [];
  if (signals.length === 0) return { active: [], boost: 0 };
  const active: ActiveOpening[] = [];
  let boost = 0;
  for (const s of signals) {
    const a = evalOpening(s, snap);
    if (a) {
      active.push(a);
      boost += a.strength * OPENING_BOOST_PER_SIGNAL;
    }
  }
  return { active, boost };
}
