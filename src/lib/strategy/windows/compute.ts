/**
 * Window scoring. Two metrics computed from the snapshot:
 *
 *   WIN-NOW (0..100)  . how strong is your roster RIGHT NOW
 *   FUTURE-VALUE (0..100). how much value is locked for tomorrow
 *
 * These quantify the user's "CAN WIN this year window" and
 * "FUTURE EARNED VALUE window." They run pre-draft, mid-draft,
 * and in-season. When a window weighting is declared, the UI
 * overlays the target and flags drift.
 *
 * Stage A approach: pure heuristics over roster age + position
 * counts + record. When player tier rankings + future-pick data
 * land, the components inside each weight can sharpen without
 * changing the public 0-100 contract.
 */

import {
  getMyRoster,
  type LeagueSnapshot,
  type RosterSnapshot,
} from "../league-state/snapshot";
import type { Position } from "../archetypes/schema";
import {
  SUPERFLEX_PICK_MULTIPLIER,
  computeOwnedFuturePicks,
  resolveRookieRounds,
  totalFuturePickValue,
} from "@/lib/players/future-picks";

const SCORING_POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

export type WindowComponent = {
  label: string;
  value: number; // 0..1
  weight: number; // 0..1
  blurb?: string;
};

export type WindowScore = {
  score: number; // 0..100
  components: WindowComponent[];
};

export type WindowsResult = {
  win_now: WindowScore;
  future_value: WindowScore;
  current_ratio: number; // win_now share of (win_now + future), 0..100
  drift: number | null; // |target - current|, null if no target declared
  drift_severity: "none" | "low" | "high" | null;
};

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// =====================================================================
// Component scorers. each returns 0..1
// =====================================================================

function ageWinNowSignal(me: RosterSnapshot | null): number {
  if (!me || me.avg_age == null) return 0.5; // neutral when unknown
  // 24 → 0, 28 → 1, linear
  return clamp01((me.avg_age - 24) / 4);
}

function ageFutureSignal(me: RosterSnapshot | null): number {
  if (!me || me.avg_age == null) return 0.5;
  // 28 → 0, 24 → 1, linear
  return clamp01((28 - me.avg_age) / 4);
}

function positionCompleteness(me: RosterSnapshot | null): number {
  if (!me) return 0;
  let present = 0;
  for (const p of SCORING_POSITIONS) {
    if (me.position_counts[p] >= 1) present += 1;
  }
  return present / SCORING_POSITIONS.length;
}

function rosterDepth(me: RosterSnapshot | null, target: number): number {
  if (!me) return 0;
  return clamp01(me.player_ids.length / target);
}

function recordSignal(me: RosterSnapshot | null): number {
  if (!me) return 0.5;
  const games = me.wins + me.losses + me.ties;
  if (games < 4) return 0.5; // not enough games
  return clamp01(me.wins / games);
}

function computeFuturePickCapital(
  snap: LeagueSnapshot,
  me: RosterSnapshot | null,
): { value: number; blurb: string } {
  if (!me) return { value: 0.5, blurb: "no roster identified" };
  const rounds = resolveRookieRounds(snap.draft.rounds);
  const isSuperflex = snap.format === "superflex" || snap.format === "2qb";
  const formatMultiplier = isSuperflex ? SUPERFLEX_PICK_MULTIPLIER : 1.0;
  const rosterIds = snap.rosters.map((r) => r.roster_id);
  const tradedPicks = snap.draft.traded_picks;

  // No traded-pick data: degrade gracefully to a neutral score so the
  // window number doesn't lurch on data unavailability.
  if (tradedPicks.length === 0 && snap.rosters.length === 0) {
    return { value: 0.5, blurb: "future-pick data unavailable" };
  }

  const myPicks = computeOwnedFuturePicks({
    rosterId: me.roster_id,
    rosterIds,
    tradedPicks,
    leagueSeason: snap.season,
    rounds,
  });
  const myValue = totalFuturePickValue(myPicks, snap.season, formatMultiplier);

  // Score relative to the league average so this is self-calibrating.
  // 1.0 at 2× league average, 0.5 at average, 0 when empty.
  const allValues = snap.rosters.map((r) => {
    const picks = computeOwnedFuturePicks({
      rosterId: r.roster_id,
      rosterIds,
      tradedPicks,
      leagueSeason: snap.season,
      rounds,
    });
    return totalFuturePickValue(picks, snap.season, formatMultiplier);
  });
  const avg =
    allValues.length > 0
      ? allValues.reduce((s, v) => s + v, 0) / allValues.length
      : 0;
  const denom = Math.max(avg * 2, 1);
  const value = clamp01(myValue / denom);

  // Compact summary: "3× R1, 2× R2 across 2027-2029"
  const totalCount = myPicks.reduce((s, p) => s + p.count, 0);
  const r1 = myPicks
    .filter((p) => p.round === 1)
    .reduce((s, p) => s + p.count, 0);
  const r2 = myPicks
    .filter((p) => p.round === 2)
    .reduce((s, p) => s + p.count, 0);
  const blurb =
    totalCount === 0
      ? "no future picks owned"
      : `${totalCount} picks (${r1}× R1, ${r2}× R2)`;

  return { value, blurb };
}

// =====================================================================
// Window scorers
// =====================================================================

function scoreWinNow(snap: LeagueSnapshot): WindowScore {
  return scoreWinNowFor(snap, getMyRoster(snap));
}

// Internal: score win-now for ANY roster (or a synthetic projected
// one). The contender-outlook forecast calls this directly with rosters
// projected to a future year. Public callers use scoreWinNow(snap).
export function scoreWinNowFor(
  snap: LeagueSnapshot,
  me: RosterSnapshot | null,
): WindowScore {
  const targetDepth = Math.max(snap.draft.rounds || 12, 12);

  const components: WindowComponent[] = [
    {
      label: "Roster age (proven production)",
      value: ageWinNowSignal(me),
      weight: 0.35,
      blurb: me?.avg_age
        ? `avg age ${me.avg_age.toFixed(1)}`
        : "no age data yet",
    },
    {
      label: "Starting positions filled",
      value: positionCompleteness(me),
      weight: 0.3,
      blurb: me
        ? `${SCORING_POSITIONS.filter((p) => me.position_counts[p] >= 1).length}/4 scoring positions covered`
        : "",
    },
    {
      label: "Roster fullness",
      value: rosterDepth(me, targetDepth),
      weight: 0.2,
      blurb: me ? `${me.player_ids.length}/${targetDepth} slots` : "",
    },
  ];

  // Record only contributes signal once games are actually played. In
  // pre-season, "0-0" at 50/100 (the neutral default) was noise the
  // user could read as a real component. Append the Record row only
  // when there's a real W/L, then normalize so weights always sum to 1
  // (otherwise removing the row understates the score).
  const gamesPlayed = me ? me.wins + me.losses + me.ties : 0;
  if (gamesPlayed > 0 && me) {
    components.push({
      label: "Record",
      value: recordSignal(me),
      weight: 0.15,
      blurb: `${me.wins}-${me.losses}`,
    });
  }

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const score = Math.round(
    (components.reduce((sum, c) => sum + c.value * c.weight, 0) / totalWeight) *
      100,
  );
  return { score, components };
}

function scoreFutureValue(snap: LeagueSnapshot): WindowScore {
  const me = getMyRoster(snap);
  const targetDepth = Math.max(snap.draft.rounds || 12, 12);

  // Future-pick capital component, scored relative to the league's own
  // average. Above-average pick stacks score high (1.0 at 2x avg);
  // empty stacks score 0; default holdings score 0.5. Self-calibrating
  // so we don't have to pick a fixed denominator.
  const fpc = computeFuturePickCapital(snap, me);

  const components: WindowComponent[] = [
    {
      label: "Roster age (longevity)",
      value: ageFutureSignal(me),
      weight: 0.5,
      blurb: me?.avg_age
        ? `avg age ${me.avg_age.toFixed(1)}`
        : "no age data yet",
    },
    {
      label: "Roster fullness (depth pool)",
      value: rosterDepth(me, targetDepth),
      weight: 0.3,
      blurb: me ? `${me.player_ids.length}/${targetDepth} slots` : "",
    },
    {
      label: "Future picks held",
      value: fpc.value,
      weight: 0.2,
      blurb: fpc.blurb,
    },
  ];

  const score = Math.round(
    components.reduce((sum, c) => sum + c.value * c.weight, 0) * 100,
  );
  return { score, components };
}

// =====================================================================
// Public entry point
// =====================================================================

export function computeWindows(
  snap: LeagueSnapshot,
  target_win_now_share: number | null = null,
): WindowsResult {
  const win_now = scoreWinNow(snap);
  const future_value = scoreFutureValue(snap);
  const total = win_now.score + future_value.score;
  const current_ratio =
    total > 0 ? Math.round((win_now.score / total) * 100) : 50;
  const drift =
    target_win_now_share == null
      ? null
      : Math.abs(target_win_now_share - current_ratio);
  const drift_severity =
    drift == null
      ? null
      : drift >= 25
        ? "high"
        : drift >= 12
          ? "low"
          : "none";

  return {
    win_now,
    future_value,
    current_ratio,
    drift,
    drift_severity,
  };
}
