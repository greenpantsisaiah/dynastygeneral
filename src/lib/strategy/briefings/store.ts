/**
 * Briefing storage. Three collections per league:
 *
 *   feed       - chronological stream of all generated briefings
 *                (append-only, newest first, retention-capped) [local]
 *   pinned     - user-curated subset moved out of the feed into the
 *                "War Room." Full CRUD: add, remove, list. [local + server for Pro]
 *   pinnedBank - full briefing payload keyed by id, so a pinned
 *                briefing survives a feed clear or a feed-rollover
 *                that pushed it out of retention. Hydrated from the
 *                server response on mount for Pro users. [local]
 *
 * Pin moves a briefing to pinned (it stays in feed too, just marked)
 * AND copies the full payload into pinnedBank.
 * Unpin removes the pinned-status (briefing remains in feed; bank
 * entry is kept until next prune to allow undo without a re-fetch).
 * The user's pinned set is THEIR insights pane: stable, intentional,
 * separate from the always-fresh feed.
 */

import type { Briefing } from "./types";

const FEED_KEY_PREFIX = "dc:briefing-feed:";
const PINNED_KEY_PREFIX = "dc:briefing-pinned:";
const PINNED_BANK_KEY_PREFIX = "dc:briefing-pinned-bank:";
const FEED_RETENTION = 50; // most recent N kept in feed; older fall off
const BANK_RETENTION = 100; // pinned-bank holds at most this many full briefings

export function feedKey(leagueId: string): string {
  return `${FEED_KEY_PREFIX}${leagueId}`;
}

export function pinnedKey(leagueId: string): string {
  return `${PINNED_KEY_PREFIX}${leagueId}`;
}

export function pinnedBankKey(leagueId: string): string {
  return `${PINNED_BANK_KEY_PREFIX}${leagueId}`;
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
const bankCache = new Map<string, CacheEntry<Record<string, Briefing>>>();

const EMPTY_FEED: Briefing[] = [];
const EMPTY_PINNED: string[] = [];
const EMPTY_BANK: Record<string, Briefing> = {};

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

export function readPinnedBank(leagueId: string): Record<string, Briefing> {
  if (typeof window === "undefined") return EMPTY_BANK;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(pinnedBankKey(leagueId));
  } catch {
    return EMPTY_BANK;
  }
  const cached = bankCache.get(leagueId);
  if (cached && cached.raw === raw) return cached.parsed;
  const parsed = safeParse<Record<string, Briefing>>(raw) ?? EMPTY_BANK;
  bankCache.set(leagueId, { raw, parsed });
  return parsed;
}

function writePinnedBank(
  leagueId: string,
  bank: Record<string, Briefing>,
): void {
  if (typeof window === "undefined") return;
  try {
    // Soft-cap by entry count. Drop oldest by pinned_at proxy
    // (insertion order is not preserved across JSON, so we sort by
    // generated_at which the briefing carries).
    const entries = Object.entries(bank);
    let trimmed = bank;
    if (entries.length > BANK_RETENTION) {
      const sorted = entries.sort(
        (a, b) =>
          Date.parse(b[1].generated_at ?? "") -
          Date.parse(a[1].generated_at ?? ""),
      );
      trimmed = Object.fromEntries(sorted.slice(0, BANK_RETENTION));
    }
    window.localStorage.setItem(
      pinnedBankKey(leagueId),
      JSON.stringify(trimmed),
    );
    window.dispatchEvent(
      new StorageEvent("storage", { key: pinnedBankKey(leagueId) }),
    );
  } catch {
    // ignore
  }
}

export function depositInBank(
  leagueId: string,
  briefings: Briefing[],
): void {
  if (briefings.length === 0) return;
  const bank = { ...readPinnedBank(leagueId) };
  for (const b of briefings) {
    bank[b.id] = b;
  }
  writePinnedBank(leagueId, bank);
}

export function removeFromBank(leagueId: string, briefingId: string): void {
  const bank = { ...readPinnedBank(leagueId) };
  if (briefingId in bank) {
    delete bank[briefingId];
    writePinnedBank(leagueId, bank);
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

export function pinBriefing(
  leagueId: string,
  briefingId: string,
  briefing?: Briefing,
): void {
  const ids = new Set(readPinned(leagueId));
  ids.add(briefingId);
  writePinned(leagueId, [...ids]);
  // Bank the full payload so we can render the pin even after the
  // feed rolls over or gets cleared.
  if (briefing) {
    depositInBank(leagueId, [briefing]);
  }
}

export function unpinBriefing(leagueId: string, briefingId: string): void {
  const ids = readPinned(leagueId).filter((id) => id !== briefingId);
  writePinned(leagueId, ids);
  // Keep the bank entry around briefly; the next call to
  // depositInBank or a server hydrate will refresh it. Removing here
  // would lose the briefing if the user undoes the unpin without
  // re-running analysis.
}

export function clearFeed(leagueId: string): void {
  writeFeed(leagueId, []);
}

// Subscribe helper for useSyncExternalStore. Watches all three keys
// (feed + pinned + bank) so pin/unpin, feed-append, and bank
// hydration all trigger re-render.
export function subscribeBriefings(
  leagueId: string,
  callback: () => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const watched = new Set([
    feedKey(leagueId),
    pinnedKey(leagueId),
    pinnedBankKey(leagueId),
  ]);
  const handler = (e: StorageEvent) => {
    if (e.key && watched.has(e.key)) {
      callback();
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
