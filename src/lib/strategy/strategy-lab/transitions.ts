/**
 * Strategy Lab transition tracking. Each visit to the hub captures a
 * snapshot of (archetype_id → viability, state) into localStorage.
 * On the next visit we diff the current Lab state against the
 * snapshot and surface transitions: paths that just closed, paths
 * that tightened, paths that opened back up (rare).
 *
 * Why client-side: Server has no per-user persistent storage cheap
 * enough for "what did this user see last time" without adding a
 * table. localStorage is per-device but matches the natural "since
 * you last looked" semantic and costs nothing.
 *
 * The screenshot moment: refresh the hub mid-draft, see "JUST CLOSED ·
 * QB Cartel" slammed across a path because Allen and Hurts went in
 * the last 4 picks. That's the Reddit demo.
 */

import type {
  StrategyLabPath,
  StrategyLabPathState,
} from "./types";

const STORAGE_KEY_PREFIX = "dc:strategy-lab-prev:";

function key(leagueId: string): string {
  return `${STORAGE_KEY_PREFIX}${leagueId}`;
}

type PreviousPathSnapshot = {
  state: StrategyLabPathState;
  viability: number;
};

type PreviousSnapshot = {
  // archetype_id -> snapshot
  paths: Record<string, PreviousPathSnapshot>;
  // ISO time the snapshot was taken. Used to suppress transitions
  // when too much time has passed (a refresh after 24h shouldn't
  // light up "just closed" badges; that drama is for live-draft
  // refreshes).
  ts: string;
};

// Window inside which transitions are considered "live" (still
// dramatic). Beyond this we just save the snapshot silently and
// don't render badges on stale comparisons.
const LIVE_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

export function readPreviousSnapshot(
  leagueId: string,
): PreviousSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(leagueId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "paths" in parsed &&
      "ts" in parsed
    ) {
      return parsed as PreviousSnapshot;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeSnapshot(
  leagueId: string,
  paths: StrategyLabPath[],
): void {
  if (typeof window === "undefined") return;
  try {
    const snap: PreviousSnapshot = {
      paths: Object.fromEntries(
        paths.map((p) => [
          p.archetype_id,
          { state: p.state, viability: p.viability },
        ]),
      ),
      ts: new Date().toISOString(),
    };
    window.localStorage.setItem(key(leagueId), JSON.stringify(snap));
  } catch {
    // ignore (private mode, quota, etc.)
  }
}

export type TransitionKind =
  | "just_closed"
  | "tightened"
  | "just_opened"
  | "loosened";

export type Transition = {
  kind: TransitionKind;
  // Signed delta (current - previous). Negative = path got worse.
  viability_delta: number;
  // The previous state, for tooltips ("was open, now narrowing").
  prev_state: StrategyLabPathState;
};

const STATE_RANK: Record<StrategyLabPathState, number> = {
  open: 3,
  narrowing: 2,
  closing: 1,
  closed: 0,
};

export function computeTransition(
  current: StrategyLabPath,
  prev: PreviousPathSnapshot | undefined,
  prevTs: string,
): Transition | null {
  if (!prev) return null;
  if (prev.state === current.state && prev.viability === current.viability) {
    return null;
  }
  // Only render badges for snapshots taken within the live window.
  const prevMs = Date.parse(prevTs);
  if (!Number.isFinite(prevMs)) return null;
  if (Date.now() - prevMs > LIVE_WINDOW_MS) return null;

  const delta = current.viability - prev.viability;
  const prevRank = STATE_RANK[prev.state];
  const currRank = STATE_RANK[current.state];

  if (currRank === 0 && prevRank > 0) {
    return { kind: "just_closed", viability_delta: delta, prev_state: prev.state };
  }
  if (currRank === 3 && prevRank < 3) {
    return { kind: "just_opened", viability_delta: delta, prev_state: prev.state };
  }
  if (currRank < prevRank) {
    return { kind: "tightened", viability_delta: delta, prev_state: prev.state };
  }
  if (currRank > prevRank) {
    return { kind: "loosened", viability_delta: delta, prev_state: prev.state };
  }
  // Same state, viability moved within band. No badge unless the
  // viability delta is meaningful (>=10pts).
  if (Math.abs(delta) >= 10) {
    return delta < 0
      ? { kind: "tightened", viability_delta: delta, prev_state: prev.state }
      : { kind: "loosened", viability_delta: delta, prev_state: prev.state };
  }
  return null;
}
