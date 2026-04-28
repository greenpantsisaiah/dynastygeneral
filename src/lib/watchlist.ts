/**
 * Watchlist (Stalking). Per-league localStorage of player IDs the
 * user has explicitly told us to track. Companion to the continuity
 * chip and draft journal: where continuity reacts to recommendations
 * changing, the watchlist reacts to PLAYERS the user named directly.
 *
 * Founder mandate 2026-04-28: "I've been stalking Mason Rudolph for
 * 17 picks." Make stalking a first-class product affordance.
 *
 * Pure client-side. Zero network. Zero LLM. Zero Supabase.
 */

export type WatchEntry = {
  player_id: string;
  player_name: string;
  position: string | null;
  team: string | null;
  added_at_ms: number;
  added_at_user_pick_no: number | null;
};

export type StoredWatchlist = {
  league_id: string;
  entries: WatchEntry[];
};

const MAX_ENTRIES = 12; // hard cap; stalking 12 players is already
// a lot of cognitive load.

function storageKey(leagueId: string): string {
  return `dg_watchlist_${leagueId}`;
}

export function readWatchlist(leagueId: string): StoredWatchlist {
  if (typeof window === "undefined") {
    return { league_id: leagueId, entries: [] };
  }
  try {
    const raw = window.localStorage.getItem(storageKey(leagueId));
    if (!raw) return { league_id: leagueId, entries: [] };
    const parsed = JSON.parse(raw) as StoredWatchlist;
    if (parsed.league_id !== leagueId) {
      return { league_id: leagueId, entries: [] };
    }
    return parsed;
  } catch {
    return { league_id: leagueId, entries: [] };
  }
}

function writeWatchlist(history: StoredWatchlist): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(history.league_id),
      JSON.stringify(history),
    );
  } catch {
    // localStorage may be unavailable (privacy mode, quota); fail silent.
  }
}

export function isWatching(
  leagueId: string,
  playerId: string,
): boolean {
  const list = readWatchlist(leagueId);
  return list.entries.some((e) => e.player_id === playerId);
}

export function addToWatchlist(
  leagueId: string,
  player: Omit<WatchEntry, "added_at_ms">,
): StoredWatchlist {
  const list = readWatchlist(leagueId);
  if (list.entries.some((e) => e.player_id === player.player_id)) {
    return list;
  }
  const entries = list.entries.slice();
  entries.push({
    ...player,
    added_at_ms: Date.now(),
  });
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  const next = { league_id: leagueId, entries };
  writeWatchlist(next);
  notifyChange(leagueId);
  return next;
}

export function removeFromWatchlist(
  leagueId: string,
  playerId: string,
): StoredWatchlist {
  const list = readWatchlist(leagueId);
  const next = {
    league_id: leagueId,
    entries: list.entries.filter((e) => e.player_id !== playerId),
  };
  writeWatchlist(next);
  notifyChange(leagueId);
  return next;
}

const CHANGE_EVENT = "dg:watchlist-changed";

function notifyChange(leagueId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CHANGE_EVENT, { detail: { leagueId } }),
  );
}

export function subscribeWatchlist(
  leagueId: string,
  callback: () => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ leagueId: string }>).detail;
    if (detail?.leagueId === leagueId) callback();
  };
  window.addEventListener(CHANGE_EVENT, handler);
  // Also listen to storage events from other tabs.
  const storageHandler = (event: StorageEvent) => {
    if (event.key === storageKey(leagueId)) callback();
  };
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", storageHandler);
  };
}
