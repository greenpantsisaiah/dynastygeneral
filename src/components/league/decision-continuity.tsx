"use client";

/**
 * Decision continuity chip. Renders above the standing-call band on
 * the Decision card. Bridges the user's emotional experience across
 * refreshes by acknowledging:
 *
 *   PIVOT: previous standing call was just drafted by an opponent.
 *          Copy: "Mason Taylor went at 21.10 to topspotpro.
 *                 Pivoting to Brock Bowers."
 *
 *   HOLD:  current standing call is the same as the previous refresh.
 *          Copy: "Holding · Mason Taylor still your call. Watched
 *                 for 14 picks."
 *
 *   (no chip when there is no localStorage history yet, or when the
 *    prior call entry has aged out beyond STALE_MS.)
 *
 * State lives in localStorage keyed by leagueId. Zero network, zero
 * LLM, zero Supabase. Pure client-side memory across refreshes.
 *
 * Founder mandate 2026-04-28: "I've been stalking [a player] for
 * 17 picks and the guy right before me picked him. The product just
 * silently moved on. The trust moment is acknowledging it noticed
 * with me." Build cost: under 100 LOC + plumbing. Production cost:
 * zero.
 */

import { useEffect, useState } from "react";

type RecentPick = {
  pick_no: number;
  player_id: string;
  owner_name: string | null;
};

type StandingCall = {
  player_id: string;
  player_name: string;
};

type HistoryEntry = {
  // The user's next_pick_no when this call was the standing call. We
  // use it to compute "watched for N picks."
  user_pick_no: number;
  player_id: string;
  player_name: string;
  first_seen_ms: number;
  last_seen_ms: number;
  refresh_count: number;
};

type StoredHistory = {
  league_id: string;
  entries: HistoryEntry[];
};

const STALE_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ENTRIES = 30;

function storageKey(leagueId: string): string {
  return `dg_rec_history_${leagueId}`;
}

function readHistory(leagueId: string): StoredHistory {
  try {
    const raw = window.localStorage.getItem(storageKey(leagueId));
    if (!raw) return { league_id: leagueId, entries: [] };
    const parsed = JSON.parse(raw) as StoredHistory;
    if (parsed.league_id !== leagueId) {
      return { league_id: leagueId, entries: [] };
    }
    return parsed;
  } catch {
    return { league_id: leagueId, entries: [] };
  }
}

function writeHistory(history: StoredHistory): void {
  try {
    window.localStorage.setItem(
      storageKey(history.league_id),
      JSON.stringify(history),
    );
  } catch {
    // localStorage may be unavailable (privacy mode, quota); fail silent.
  }
}

type ChipState =
  | { kind: "pivot"; priorName: string; priorPickNo: number; priorOwner: string | null }
  | { kind: "hold"; watchedPicks: number }
  | { kind: "none" };

function deriveChipState(
  history: StoredHistory,
  currentCall: StandingCall,
  currentUserPickNo: number,
  recentPicks: RecentPick[],
  nowMs: number,
): ChipState {
  const fresh = history.entries.filter(
    (e) => nowMs - e.last_seen_ms < STALE_MS,
  );
  if (fresh.length === 0) return { kind: "none" };

  const lastEntry = fresh[fresh.length - 1];

  // PIVOT: prior standing call was a different player AND that player
  // appears in recent draft picks. The chip names the pick number and
  // opponent so the user knows exactly who got snagged by whom.
  if (lastEntry.player_id !== currentCall.player_id) {
    const drafted = recentPicks.find(
      (p) => p.player_id === lastEntry.player_id,
    );
    if (drafted) {
      return {
        kind: "pivot",
        priorName: lastEntry.player_name,
        priorPickNo: drafted.pick_no,
        priorOwner: drafted.owner_name,
      };
    }
    // Standing call changed but prior player NOT in recent picks. This
    // is the DRIFT case (engine reconsidered without a draft event).
    // Founder said skip DRIFT for now; render no chip.
    return { kind: "none" };
  }

  // HOLD: same player as last refresh. Compute watched-pick span by
  // counting how many distinct user_pick_no values we've seen this
  // player as the call. Also adds the refresh count for cases where
  // the user reloaded multiple times within one pick window.
  const watchedEntries = fresh.filter(
    (e) => e.player_id === currentCall.player_id,
  );
  const distinctPickWindows = new Set(
    watchedEntries.map((e) => e.user_pick_no),
  ).size;
  // Threshold: only show HOLD when the user has actually waited at
  // least one pick window with this call. Single-refresh reaffirms
  // are noise.
  if (distinctPickWindows < 2) return { kind: "none" };
  return { kind: "hold", watchedPicks: distinctPickWindows };
}

function appendCurrentCallToHistory(
  history: StoredHistory,
  currentCall: StandingCall,
  currentUserPickNo: number,
  nowMs: number,
): StoredHistory {
  const entries = history.entries.slice();
  const last = entries[entries.length - 1];
  // Same player, same pick window: bump last_seen + refresh_count,
  // don't append a new entry.
  if (
    last &&
    last.player_id === currentCall.player_id &&
    last.user_pick_no === currentUserPickNo
  ) {
    entries[entries.length - 1] = {
      ...last,
      last_seen_ms: nowMs,
      refresh_count: last.refresh_count + 1,
    };
  } else {
    entries.push({
      user_pick_no: currentUserPickNo,
      player_id: currentCall.player_id,
      player_name: currentCall.player_name,
      first_seen_ms: nowMs,
      last_seen_ms: nowMs,
      refresh_count: 1,
    });
  }
  // Trim to MAX_ENTRIES.
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  return { league_id: history.league_id, entries };
}

export function DecisionContinuity({
  leagueId,
  currentCall,
  currentUserPickNo,
  recentPicks,
}: {
  leagueId: string;
  currentCall: StandingCall;
  currentUserPickNo: number;
  recentPicks: RecentPick[];
}) {
  const [chip, setChip] = useState<ChipState>({ kind: "none" });

  useEffect(() => {
    const nowMs = Date.now();
    const history = readHistory(leagueId);
    const derivedChip = deriveChipState(
      history,
      currentCall,
      currentUserPickNo,
      recentPicks,
      nowMs,
    );
    setChip(derivedChip);
    const updated = appendCurrentCallToHistory(
      history,
      currentCall,
      currentUserPickNo,
      nowMs,
    );
    writeHistory(updated);
    // Run once per mount (per refresh). Subsequent renders don't
    // re-detect; the chip is for the moment of arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (chip.kind === "none") return null;

  if (chip.kind === "pivot") {
    const ownerLabel = chip.priorOwner ?? "the room";
    return (
      <div className="mt-3 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-xs">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-warning">
          Pivot ·{" "}
        </span>
        <span className="text-foreground">
          <span className="font-semibold">{chip.priorName}</span> went at{" "}
          <span className="font-semibold">
            pick {chip.priorPickNo}
          </span>{" "}
          to <span className="font-semibold">{ownerLabel}</span>. New
          standing call below.
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-success/40 bg-success/5 px-3 py-2 text-xs">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-success">
        Holding ·{" "}
      </span>
      <span className="text-foreground">
        Same call across{" "}
        <span className="font-semibold">
          {chip.watchedPicks} pick window{chip.watchedPicks === 1 ? "" : "s"}
        </span>
        . Still on the board.
      </span>
    </div>
  );
}
