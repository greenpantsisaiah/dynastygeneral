/**
 * Drift scoring. Each archetype's fit_signals are evaluated against
 * the user's roster snapshot. but unlike the old binary AND-gate,
 * signals contribute PARTIAL credit. The result is a "drift toward
 * this archetype" 0..1 score.
 *
 * Mental model: at Pick 2.x with 1 QB, you're not yet a "QB Cartel"
 * (which needs 2+) but you're 50% drifted toward it. The board
 * surfaces all plausible drifts so the user can see which paths are
 * narrowing/widening. not just which paths are hard fits.
 *
 * Hard-binary signals (league_format, league_scoring) still return
 * 0 or 1. no league is "partially superflex." Roster-count signals
 * scale linearly toward the threshold.
 */

import type {
  Archetype,
  FitSignal,
  Position,
} from "../archetypes/schema";
import {
  getMyRoster,
  type LeagueSnapshot,
  type RosterSnapshot,
} from "../league-state/snapshot";

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Partial scoring for "have ≥ min at position". credit scales linearly
 * from 0 (have nothing) to 1 (have min). Above min stays at 1.
 *
 * For "max" signals (have ≤ max), full credit when at-or-below max,
 * scales DOWN as you exceed max (each extra player above max docks
 * 0.3 from the score).
 */
function partialPositionScore(
  have: number,
  min: number | undefined,
  max: number | undefined,
): number {
  let score = 1;
  if (min != null) {
    score = Math.min(score, have / min);
  }
  if (max != null && have > max) {
    score = Math.min(score, Math.max(0, 1 - (have - max) * 0.3));
  }
  return clamp01(score);
}

function signalScore(
  signal: FitSignal,
  me: RosterSnapshot | null,
  snap: LeagueSnapshot,
): number {
  switch (signal.kind) {
    case "user_owns_top_n_at_position": {
      if (!me) return 0;
      // When `rank_threshold` is set, count only players whose
      // search_rank meets the threshold ("top 12 at position"). Without
      // a threshold, every roster entry at this position counts. The
      // rank-aware path makes signals like "2+ TOP-12 QBs" actually
      // tighter than "2+ QBs at all," which they were not before.
      const have =
        signal.rank_threshold != null
          ? me.position_ranks[signal.position].filter(
              (r) => r <= (signal.rank_threshold ?? Infinity),
            ).length
          : me.position_counts[signal.position];
      return partialPositionScore(have, signal.min, signal.max);
    }
    case "user_position_count": {
      if (!me) return 0;
      const have = me.position_counts[signal.position];
      return partialPositionScore(have, signal.min, signal.max);
    }
    case "league_format": {
      const want = Array.isArray(signal.format)
        ? signal.format
        : [signal.format];
      return want.includes(snap.format) ? 1 : 0;
    }
    case "league_scoring": {
      const want = Array.isArray(signal.includes)
        ? signal.includes
        : [signal.includes];
      return want.some((w) => snap.scoring.includes(w)) ? 1 : 0;
    }
    case "user_record": {
      if (!me) return 0;
      const games = me.wins + me.losses + me.ties;
      // Pre-season: no games means we can't evaluate this signal.
      // Return neutral 0.5 so it doesn't drag the archetype down to 0.
      if (signal.games_min != null && games < signal.games_min) return 0.5;
      if (signal.wins_min != null && me.wins < signal.wins_min)
        return clamp01(me.wins / signal.wins_min);
      if (signal.wins_max != null && me.wins > signal.wins_max)
        return clamp01(1 - (me.wins - signal.wins_max) * 0.25);
      return 1;
    }
    case "user_roster_avg_age": {
      if (!me || me.avg_age == null) return 0.5; // unknown → neutral
      // Linear scoring: full credit inside the band, falloff outside.
      if (signal.min != null && me.avg_age < signal.min)
        return clamp01(1 - (signal.min - me.avg_age) * 0.2);
      if (signal.max != null && me.avg_age > signal.max)
        return clamp01(1 - (me.avg_age - signal.max) * 0.2);
      return 1;
    }
    case "user_owns_future_picks":
      // Future-pick data not wired yet. neutral signal.
      return 0.5;
  }
}

export type FitResult = {
  archetype_id: string;
  drift_score: number; // 0..1
  matched_signals: number; // signals scoring ≥ 0.5
  total_signals: number;
  signal_breakdown: Array<{ kind: string; score: number; weight: number }>;
};

export function scoreFit(
  archetype: Archetype,
  snap: LeagueSnapshot,
): FitResult {
  const me = getMyRoster(snap);
  if (archetype.fit_signals.length === 0) {
    return {
      archetype_id: archetype.id,
      drift_score: 0,
      matched_signals: 0,
      total_signals: 0,
      signal_breakdown: [],
    };
  }

  let weightedSum = 0;
  let weightTotal = 0;
  let matched = 0;
  const breakdown: Array<{ kind: string; score: number; weight: number }> = [];

  for (const signal of archetype.fit_signals) {
    const w = signal.weight ?? 1;
    const s = signalScore(signal, me, snap);
    weightedSum += w * s;
    weightTotal += w;
    if (s >= 0.5) matched += 1;
    breakdown.push({ kind: signal.kind, score: s, weight: w });
  }

  return {
    archetype_id: archetype.id,
    drift_score: weightTotal > 0 ? weightedSum / weightTotal : 0,
    matched_signals: matched,
    total_signals: archetype.fit_signals.length,
    signal_breakdown: breakdown,
  };
}

// Backward-compat alias for callers still using the old name. The
// "fit_score" terminology evolves into "drift_score" but old call
// sites can keep working until migrated.
export type { Position };
