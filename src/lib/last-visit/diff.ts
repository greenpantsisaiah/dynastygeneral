/**
 * Compute the delta between the user's last hub visit and now.
 *
 * Produces the data structure that drives the "Since [time]: ..."
 * digest line at the top of the Bridge plus the per-surface change
 * dots. Pure function; no IO. The caller reads cookies and snapshot
 * state, calls this, then renders.
 */

import type { LastVisitFingerprint } from "./cookie";

export type LastVisitDelta = {
  // ms since last visit, or null when no prior visit (first time).
  ms_since_last_visit: number | null;
  // True when there was no prior visit; the digest line should not
  // render in this case (nothing to be different from).
  is_first_visit: boolean;
  // Picks made anywhere in the league since last visit.
  picks_made_total: number;
  // Picks the user themselves made since last visit.
  picks_made_by_user: number;
  // True when the standing-call player_id has changed since last
  // visit. False on first visit. False when the standing call player
  // is the same.
  standing_call_changed: boolean;
  // Delta on EV bank total since last visit. Positive = banked more
  // value. Null when EV bank wasn't resolved at one or both points.
  ev_bank_delta: number | null;
  // Per-position roster-count delta since last visit. Positive when
  // the user added a player at that position between visits. Powers
  // the within-surface delta marker on PositionCard. Empty when the
  // prior fingerprint did not carry per-position counts.
  position_count_deltas: Partial<Record<string, number>>;
  // League rank delta. Negative means the user moved UP in rank
  // (lower rank number = better). Null when either the prior or
  // current rank is unknown. Powers the rank-delta marker on the
  // league-rank MetricCard.
  league_rank_delta: number | null;
  // Whether the digest is meaningful (any of the above moved). If
  // false, the Bridge can suppress the digest line.
  has_changes: boolean;
};

export function computeLastVisitDelta(args: {
  prior: LastVisitFingerprint | null;
  now: {
    timestamp_ms: number;
    total_picks_made: number;
    standing_call_id: string | null;
    ev_bank_total: number | null;
    my_roster_size: number;
    my_position_counts?: Partial<Record<string, number>>;
    my_league_rank?: number | null;
  };
}): LastVisitDelta {
  const { prior, now } = args;
  if (!prior) {
    return {
      ms_since_last_visit: null,
      is_first_visit: true,
      picks_made_total: 0,
      picks_made_by_user: 0,
      standing_call_changed: false,
      ev_bank_delta: null,
      position_count_deltas: {},
      league_rank_delta: null,
      has_changes: false,
    };
  }
  const priorTs = Date.parse(prior.ts);
  const ms_since_last_visit = Number.isFinite(priorTs)
    ? Math.max(0, now.timestamp_ms - priorTs)
    : null;
  const picks_made_total = Math.max(
    0,
    now.total_picks_made - prior.total_picks_made,
  );
  const picks_made_by_user = Math.max(
    0,
    now.my_roster_size - prior.my_roster_size,
  );
  const standing_call_changed =
    prior.standing_call_id != null &&
    now.standing_call_id != null &&
    prior.standing_call_id !== now.standing_call_id;
  const ev_bank_delta =
    prior.ev_bank_total != null && now.ev_bank_total != null
      ? round2(now.ev_bank_total - prior.ev_bank_total)
      : null;
  const position_count_deltas: Partial<Record<string, number>> = {};
  if (prior.my_position_counts && now.my_position_counts) {
    const positions = new Set([
      ...Object.keys(prior.my_position_counts),
      ...Object.keys(now.my_position_counts),
    ]);
    for (const pos of positions) {
      const a = prior.my_position_counts[pos] ?? 0;
      const b = now.my_position_counts[pos] ?? 0;
      const d = b - a;
      if (d !== 0) position_count_deltas[pos] = d;
    }
  }
  const league_rank_delta =
    prior.my_league_rank != null && now.my_league_rank != null
      ? now.my_league_rank - prior.my_league_rank
      : null;
  const has_changes =
    picks_made_total > 0 ||
    standing_call_changed ||
    (ev_bank_delta != null && Math.abs(ev_bank_delta) >= 0.5) ||
    Object.keys(position_count_deltas).length > 0 ||
    (league_rank_delta != null && league_rank_delta !== 0);
  return {
    ms_since_last_visit,
    is_first_visit: false,
    picks_made_total,
    picks_made_by_user,
    standing_call_changed,
    ev_bank_delta,
    position_count_deltas,
    league_rank_delta,
    has_changes,
  };
}

/**
 * Friendly relative-time formatter for the digest line. "11 minutes
 * ago" / "2 hours ago" / "yesterday" / "3 days ago". Voice A: terse,
 * no exclamation, no decoration.
 */
export function formatTimeSince(msAgo: number | null): string {
  if (msAgo == null) return "since you were last here";
  const minutes = Math.floor(msAgo / 60_000);
  if (minutes < 1) return "moments ago";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }
  return "last month";
}

/**
 * Compose the digest sentence from a LastVisitDelta. Voice A:
 * "Since 11 minutes ago: 3 picks made, standing call shifted, EV
 * bank +0.4." Returns null when the delta has no changes (caller
 * suppresses the line).
 */
export function composeDigestLine(delta: LastVisitDelta): string | null {
  if (delta.is_first_visit || !delta.has_changes) return null;
  const parts: string[] = [];
  if (delta.picks_made_total > 0) {
    parts.push(
      `${delta.picks_made_total} pick${delta.picks_made_total === 1 ? "" : "s"} made`,
    );
  }
  if (delta.standing_call_changed) {
    parts.push("standing call shifted");
  }
  if (delta.ev_bank_delta != null && Math.abs(delta.ev_bank_delta) >= 0.5) {
    const sign = delta.ev_bank_delta >= 0 ? "+" : "";
    parts.push(`EV bank ${sign}${delta.ev_bank_delta.toFixed(1)}`);
  }
  if (parts.length === 0) return null;
  return `Since ${formatTimeSince(delta.ms_since_last_visit)}: ${parts.join(", ")}.`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
