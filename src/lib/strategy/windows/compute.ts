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

// =====================================================================
// Window scorers
// =====================================================================

function scoreWinNow(snap: LeagueSnapshot): WindowScore {
  const me = getMyRoster(snap);
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
      label: "Record",
      value: recordSignal(me),
      weight: 0.15,
      blurb: me ? `${me.wins}-${me.losses}` : "",
    },
    {
      label: "Roster fullness",
      value: rosterDepth(me, targetDepth),
      weight: 0.2,
      blurb: me ? `${me.player_ids.length}/${targetDepth} slots` : "",
    },
  ];

  const score = Math.round(
    components.reduce((sum, c) => sum + c.value * c.weight, 0) * 100,
  );
  return { score, components };
}

function scoreFutureValue(snap: LeagueSnapshot): WindowScore {
  const me = getMyRoster(snap);
  const targetDepth = Math.max(snap.draft.rounds || 12, 12);

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
      value: 0.5, // not yet wired. neutral placeholder
      weight: 0.2,
      blurb: "future-pick tracking not yet wired",
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
