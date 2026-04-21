/**
 * Briefing storage. Two collections per league, both in localStorage:
 *
 *   feed   - chronological stream of all generated briefings
 *            (append-only, newest first, retention-capped)
 *   pinned - user-curated subset moved out of the feed into the
 *            "War Room." Full CRUD: add, remove, list.
 *
 * Pin moves a briefing to pinned (it stays in feed too, just marked).
 * Unpin removes the pinned-status (briefing remains in feed).
 * The user's pinned set is THEIR insights pane: stable, intentional,
 * separate from the always-fresh feed.
 */

import type { Briefing } from "./types";

const FEED_KEY_PREFIX = "dc:briefing-feed:";
const PINNED_KEY_PREFIX = "dc:briefing-pinned:";
const FEED_RETENTION = 50; // most recent N kept in feed; older fall off

export function feedKey(leagueId: string): string {
  return `${FEED_KEY_PREFIX}${leagueId}`;
}

export function pinnedKey(leagueId: string): string {
  return `${PINNED_KEY_PREFIX}${leagueId}`;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Module-level snapshot caches. useSyncExternalStore requires the
// snapshot function to return a stable reference when nothing has
// changed; without this, parsing JSON on every read produces a new
// array reference each call and triggers React's infinite-loop guard
// ("The result of getSnapshot should be cached"). The cache key is
// the raw localStorage string. If the raw bytes match the cached
// version, return the same parsed array instance.
type CacheEntry<T> = { raw: string | null; parsed: T };
const feedCache = new Map<string, CacheEntry<Briefing[]>>();
const pinnedCache = new Map<string, CacheEntry<string[]>>();

const EMPTY_FEED: Briefing[] = [];
const EMPTY_PINNED: string[] = [];

export function readFeed(leagueId: string): Briefing[] {
  if (typeof window === "undefined") return EMPTY_FEED;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(feedKey(leagueId));
  } catch {
    return EMPTY_FEED;
  }
  const cached = feedCache.get(leagueId);
  if (cached && cached.raw === raw) return cached.parsed;
  const parsed = safeParse<Briefing[]>(raw) ?? EMPTY_FEED;
  feedCache.set(leagueId, { raw, parsed });
  return parsed;
}

export function readPinned(leagueId: string): string[] {
  if (typeof window === "undefined") return EMPTY_PINNED;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(pinnedKey(leagueId));
  } catch {
    return EMPTY_PINNED;
  }
  const cached = pinnedCache.get(leagueId);
  if (cached && cached.raw === raw) return cached.parsed;
  const parsed = safeParse<string[]>(raw) ?? EMPTY_PINNED;
  pinnedCache.set(leagueId, { raw, parsed });
  return parsed;
}

function writeFeed(leagueId: string, feed: Briefing[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(feedKey(leagueId), JSON.stringify(feed));
    window.dispatchEvent(new StorageEvent("storage", { key: feedKey(leagueId) }));
  } catch {
    // ignore
  }
}

function writePinned(leagueId: string, ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(pinnedKey(leagueId), JSON.stringify(ids));
    window.dispatchEvent(new StorageEvent("storage", { key: pinnedKey(leagueId) }));
  } catch {
    // ignore
  }
}

export function appendBriefings(
  leagueId: string,
  briefings: Briefing[],
): void {
  const existing = readFeed(leagueId);
  // Newest-first ordering. Cap at retention.
  const next = [...briefings, ...existing].slice(0, FEED_RETENTION);
  writeFeed(leagueId, next);
}

export function pinBriefing(leagueId: string, briefingId: string): void {
  const ids = new Set(readPinned(leagueId));
  ids.add(briefingId);
  writePinned(leagueId, [...ids]);
}

export function unpinBriefing(leagueId: string, briefingId: string): void {
  const ids = readPinned(leagueId).filter((id) => id !== briefingId);
  writePinned(leagueId, ids);
}

export function clearFeed(leagueId: string): void {
  writeFeed(leagueId, []);
}

// Subscribe helper for useSyncExternalStore. Watches BOTH keys
// (feed + pinned) so pin/unpin and feed-append both trigger re-render.
export function subscribeBriefings(
  leagueId: string,
  callback: () => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === feedKey(leagueId) || e.key === pinnedKey(leagueId)) {
      callback();
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
