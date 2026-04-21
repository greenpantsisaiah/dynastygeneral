/**
 * Drift trajectory. For each archetype, look at the last K picks across
 * the league and determine whether the archetype's drift is rising,
 * falling, or steady. and WHY.
 *
 * Heuristic per pick:
 *   - Pick at archetype's preferred position by USER  → +1 (commitment)
 *   - Pick at archetype's preferred position by OTHER → -0.5 (depletes
 *     supply, narrows your window)
 *   - Pick at non-preferred position → 0 (neutral)
 *
 * Sum across the last K picks. Positive = direction "up", negative =
 * "down", near-zero = "steady". Reasons cite the specific picks.
 */

import type {
  Archetype,
  DriftDirection,
  DriftTrajectory,
  Position,
} from "../archetypes/schema";
import type { LeagueSnapshot, DraftPickRecord } from "../league-state/snapshot";

const TRAJECTORY_WINDOW = 4;

const POSITION_LABEL: Record<Position, string> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  K: "K",
  DST: "DST",
};

function preferredPositions(archetype: Archetype): Set<Position> {
  const out = new Set<Position>();
  for (const sig of archetype.fit_signals) {
    if (sig.kind === "user_owns_top_n_at_position" || sig.kind === "user_position_count") {
      // For min-style signals, the position is what you want MORE of.
      // For max-only signals (e.g. "few QBs"), don't add to preferred -
      // the archetype is fine without picks at that position.
      if (sig.min != null && sig.min >= 1) out.add(sig.position);
    }
  }
  for (const sig of archetype.opening_signals ?? []) {
    if (
      sig.kind === "league_position_scarcity_after_round" ||
      sig.kind === "league_position_overdrafted_through_round"
    ) {
      out.add(sig.position);
    }
  }
  return out;
}

function directionFrom(delta: number): DriftDirection {
  if (delta >= 0.5) return "up";
  if (delta <= -0.5) return "down";
  return "steady";
}

export function computeTrajectory(
  archetype: Archetype,
  snap: LeagueSnapshot,
): DriftTrajectory {
  const preferred = preferredPositions(archetype);
  if (preferred.size === 0) {
    return { direction: "steady", delta: 0, reasons: [] };
  }

  const picks = snap.draft.picks_made.slice(-TRAJECTORY_WINDOW);
  if (picks.length === 0) {
    return { direction: "steady", delta: 0, reasons: [] };
  }

  const me = snap.rosters.find((r) => r.is_me);
  let delta = 0;
  const reasons: string[] = [];

  for (const p of picks) {
    if (!p.position || !preferred.has(p.position)) continue;
    if (me && p.roster_id === me.roster_id) {
      delta += 1;
      reasons.push(
        `+ Your pick at ${POSITION_LABEL[p.position]} (${pickLabel(p)}). committing to the lane`,
      );
    } else {
      delta -= 0.5;
      const owner = snap.rosters.find((r) => r.roster_id === p.roster_id);
      reasons.push(
        `− ${owner?.owner_name ?? "Opponent"} took ${POSITION_LABEL[p.position]} at ${pickLabel(p)}. supply tightening`,
      );
    }
  }

  return {
    direction: directionFrom(delta),
    delta,
    reasons,
  };
}

function pickLabel(p: DraftPickRecord): string {
  return `${p.round}.${((p.pick_no - 1) % 12) + 1}`;
}
