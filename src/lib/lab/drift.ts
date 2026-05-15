/**
 * Doctrine drift detection.
 *
 * Compares the user's recent pick behavior against their declared
 * Horizon dial. When a user's last N picks lean strongly future
 * but their dial says win-now (or vice versa), the doctrine is
 * drifting from declared posture. Per founder direction 2026-05-14
 * the answer was "warn mode": surface a small banner the user can
 * dismiss.
 *
 * v1 scope: Horizon only. Other dials (rookie tilt, risk tolerance,
 * etc.) could get drift detection too in a future pass. Horizon is
 * the simplest single-axis signal and the highest-value drift to
 * catch. The classic dissonance is a Win-Now Maxer doctrine paired
 * with a Rebuilder pick pattern.
 */

import type {
  DraftPickRecord,
  RosterSnapshot,
} from "@/lib/strategy/league-state/snapshot";

const MIN_PICKS_FOR_DRIFT = 5;
const DRIFT_THRESHOLD = 40;

export type DriftReadout = {
  /** True when |behavioral - declared| > threshold AND we have enough picks. */
  detected: boolean;
  /** Behavioral horizon score in [-100, +100]. */
  behavioral_horizon: number;
  /** User's declared horizon dial value in [-100, +100]. */
  declared_horizon: number;
  /** Number of recent picks used in the computation. */
  picks_considered: number;
  /** Plain-language summary suitable for the banner. */
  summary: string;
};

/**
 * Per-pick horizon signal in [-1, +1]. Positive = future-lean (rookie
 * or young vet); negative = win-now-lean (proven vet, past peak).
 * Position-agnostic; the per-position age curve lives elsewhere.
 */
function pickHorizonSignal(args: {
  age: number | null;
  is_rookie: boolean;
}): number {
  if (args.is_rookie) return 1;
  if (args.age == null) return 0;
  const v = (28 - args.age) / 7;
  return Math.max(-1, Math.min(1, v));
}

export function detectDoctrineDrift(args: {
  rosters: RosterSnapshot[];
  picks_made: DraftPickRecord[];
  declared_horizon: number;
  player_meta_by_id: Map<
    string,
    { age: number | null; is_rookie: boolean } | null
  >;
}): DriftReadout {
  const me = args.rosters.find((r) => r.is_me);
  if (!me) {
    return {
      detected: false,
      behavioral_horizon: 0,
      declared_horizon: args.declared_horizon,
      picks_considered: 0,
      summary: "",
    };
  }

  // Most-recent N picks by the user. picks_made is sorted by pick_no
  // ascending; reverse + filter to user's roster.
  const userPicks = args.picks_made
    .filter((p) => p.roster_id === me.roster_id)
    .sort((a, b) => b.pick_no - a.pick_no)
    .slice(0, 8);

  if (userPicks.length < MIN_PICKS_FOR_DRIFT) {
    return {
      detected: false,
      behavioral_horizon: 0,
      declared_horizon: args.declared_horizon,
      picks_considered: userPicks.length,
      summary: "",
    };
  }

  let signalSum = 0;
  let signalCount = 0;
  for (const pick of userPicks) {
    const meta = args.player_meta_by_id.get(pick.player_id);
    if (!meta) continue;
    signalSum += pickHorizonSignal({
      age: meta.age,
      is_rookie: meta.is_rookie,
    });
    signalCount += 1;
  }

  if (signalCount === 0) {
    return {
      detected: false,
      behavioral_horizon: 0,
      declared_horizon: args.declared_horizon,
      picks_considered: 0,
      summary: "",
    };
  }

  const behavioral = (signalSum / signalCount) * 100;
  const gap = behavioral - args.declared_horizon;
  const absGap = Math.abs(gap);
  const detected = absGap > DRIFT_THRESHOLD;

  let summary = "";
  if (detected) {
    const behaviorLabel =
      behavioral > 25
        ? "future-leaning"
        : behavioral < -25
          ? "win-now-leaning"
          : "balanced";
    const declaredLabel =
      args.declared_horizon > 25
        ? "future-leaning"
        : args.declared_horizon < -25
          ? "win-now-leaning"
          : "balanced";
    summary = `Your last ${signalCount} picks read as ${behaviorLabel} (${behavioral > 0 ? "+" : ""}${Math.round(behavioral)}), but your Horizon dial says ${declaredLabel} (${args.declared_horizon > 0 ? "+" : ""}${args.declared_horizon}). The math drifted from the dial.`;
  }

  return {
    detected,
    behavioral_horizon: Math.round(behavioral),
    declared_horizon: args.declared_horizon,
    picks_considered: signalCount,
    summary,
  };
}
