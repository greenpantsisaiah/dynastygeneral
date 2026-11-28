/**
 * Cached data for the signed-out /home preview.
 *
 * Why (2026-11-28, before paid traffic): the preview cookie lasts 24h and
 * can be replayed, and every render rebuilds every league (season
 * simulations, lineup panel). Signed-out renders of the same username in
 * the same NFL week share one build for PREVIEW_CACHE_TTL_MS; concurrent
 * renders share one in-flight build. Per-IP limits live in ratelimit.ts
 * (`home-preview`, `home-preview-daily`).
 *
 * Per server instance (memory), so a cold instance rebuilds once. Signed-in
 * renders never read it: they carry account data (emailed trades, tier).
 */

export const PREVIEW_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 200;

type Entry = { at: number; value: Promise<unknown> };
const cache = new Map<string, Entry>();

export function previewCacheKey(username: string, season: string, week: number): string {
  return `${username.toLowerCase()}:${season}:${week}`;
}

/**
 * The cached value for `key`, or `build()` run once and shared. A failed
 * build is not cached, so the next render retries.
 */
export function cachedPreview<T>(key: string, build: () => Promise<T>, now = Date.now()): Promise<T> {
  const hit = cache.get(key);
  if (hit && now - hit.at < PREVIEW_CACHE_TTL_MS) return hit.value as Promise<T>;
  if (cache.size >= MAX_ENTRIES) {
    for (const [k, e] of cache) if (now - e.at >= PREVIEW_CACHE_TTL_MS) cache.delete(k);
    while (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  }
  const value = build();
  cache.set(key, { at: now, value });
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

/** Voice A line for a rate-limited preview: the cap, its window, when it resets. */
export function previewLimitLine(limit: number, window: "10 minutes" | "day", resetMs: number): string {
  const mins = Math.max(1, Math.ceil(resetMs / 60000));
  const wait = mins >= 120 ? `${Math.ceil(mins / 60)} hours` : `${mins} min`;
  return `Preview limit reached on this network: ${limit} views per ${window}. Sign in to keep going, or retry in ${wait}.`;
}

/** Test seam. */
export function clearPreviewCache(): void {
  cache.clear();
}
