import { z } from "zod";
import { sleeperPlayerSchema, type SleeperPlayer } from "@/lib/sleeper/schemas";

/**
 * Player metadata cache.
 *
 * Sleeper's /players/nfl dump is ~5MB and should be pulled at most once per
 * day (per Sleeper's guidance). This module fetches lazily on first use,
 * stores in memory, and refreshes after TTL.
 *
 * TTL is configurable via the PLAYERS_CACHE_TTL_MINUTES env var. Default
 * is 60 minutes (down from the original 24h) so the NFL Draft window
 * (rookies flipping team:null -> drafted state hourly) doesn't show
 * day-stale data. During a serverless cold start the cache is empty
 * regardless, so the actual upstream call rate is bounded by warm-instance
 * lifetime rather than TTL.
 *
 * For immediate refresh (e.g. between draft rounds), call
 * `forceRefreshPlayers()` from the admin endpoint instead of waiting for
 * TTL.
 *
 * Never ship this map to the client. It is server-only. Use the lookup
 * helpers to resolve a small number of player_ids per request.
 */

const DEFAULT_TTL_MINUTES = 60;
const TTL_MINUTES = (() => {
  const raw = process.env.PLAYERS_CACHE_TTL_MINUTES;
  if (!raw) return DEFAULT_TTL_MINUTES;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_MINUTES;
})();
const TTL_MS = TTL_MINUTES * 60 * 1000;
const BASE = "https://api.sleeper.app/v1";
const playersResponseSchema = z.record(z.string(), sleeperPlayerSchema);

type CacheEntry = {
  players: Map<string, SleeperPlayer>;
  fetchedAt: number;
};

let cache: CacheEntry | null = null;
let inflight: Promise<CacheEntry> | null = null;

async function fetchPlayers(): Promise<CacheEntry> {
  const res = await fetch(`${BASE}/players/nfl`, {
    // Prevent Next.js from baking this into a static cache; our in-memory
    // TTL is the source of truth.
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Sleeper /players/nfl failed: ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  const parsed = playersResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Sleeper /players/nfl did not match schema: ${parsed.error.message}`,
    );
  }
  const players = new Map<string, SleeperPlayer>();
  for (const [id, p] of Object.entries(parsed.data)) {
    players.set(id, p);
  }
  return { players, fetchedAt: Date.now() };
}

async function getCache(): Promise<CacheEntry> {
  const fresh = cache && Date.now() - cache.fetchedAt < TTL_MS;
  if (fresh && cache) return cache;
  if (inflight) return inflight;
  inflight = fetchPlayers()
    .then((entry) => {
      cache = entry;
      return entry;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function resolvePlayers(
  ids: readonly string[],
): Promise<Map<string, SleeperPlayer>> {
  if (ids.length === 0) return new Map();
  const { players } = await getCache();
  const out = new Map<string, SleeperPlayer>();
  for (const id of ids) {
    const p = players.get(id);
    if (p) out.set(id, p);
  }
  return out;
}

export async function resolvePlayer(
  id: string,
): Promise<SleeperPlayer | null> {
  const { players } = await getCache();
  return players.get(id) ?? null;
}

/**
 * Internal: dump the full cached player pool as an array. Server-only.
 * Consumers should filter/rank before returning to the client. The full
 * pool is thousands of entries.
 */
export async function __dumpAllPlayers(): Promise<SleeperPlayer[]> {
  const { players } = await getCache();
  return [...players.values()];
}

/**
 * Force a fresh pull from Sleeper, bypassing TTL. Used by the admin
 * refresh endpoint during the NFL Draft window when rookies flip from
 * team:null to drafted state and we don't want to wait on TTL.
 *
 * Reuses the `inflight` lock so two concurrent admin POSTs don't
 * issue two concurrent ~5MB Sleeper pulls. Per security-audit
 * 2026-04-24 LOW: moot with one admin email today, but harden now
 * before the allow-list grows.
 *
 * Returns the number of players in the new cache and the elapsed ms so
 * callers can surface the result to the admin.
 */
export async function forceRefreshPlayers(): Promise<{
  count: number;
  elapsed_ms: number;
  fetched_at: string;
}> {
  const start = Date.now();
  // Piggyback on an already-running fetch if one is in flight; else
  // start a fresh one and replace the cache atomically.
  const promise =
    inflight ??
    fetchPlayers()
      .then((entry) => {
        cache = entry;
        return entry;
      })
      .finally(() => {
        inflight = null;
      });
  if (!inflight) inflight = promise;
  const entry = await promise;
  return {
    count: entry.players.size,
    elapsed_ms: Date.now() - start,
    fetched_at: new Date(entry.fetchedAt).toISOString(),
  };
}

/**
 * Cache state for diagnostics. Returns null when nothing is cached yet.
 */
export function getCacheStatus(): {
  player_count: number;
  fetched_at: string;
  age_ms: number;
  ttl_minutes: number;
} | null {
  if (!cache) return null;
  return {
    player_count: cache.players.size,
    fetched_at: new Date(cache.fetchedAt).toISOString(),
    age_ms: Date.now() - cache.fetchedAt,
    ttl_minutes: TTL_MINUTES,
  };
}

export type HumanPlayer = {
  id: string;
  name: string;
  position: string | null;
  team: string | null;
  age: number | null;
  yearsExp: number | null;
};

export function humanize(p: SleeperPlayer): HumanPlayer {
  const combined = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  const name = p.full_name ?? (combined || p.player_id);
  return {
    id: p.player_id,
    name: name || p.player_id,
    position: p.position ?? null,
    team: p.team ?? null,
    age: typeof p.age === "number" ? p.age : null,
    yearsExp: typeof p.years_exp === "number" ? p.years_exp : null,
  };
}

export function formatPlayerShort(p: HumanPlayer): string {
  const parts: string[] = [p.name];
  const tail: string[] = [];
  if (p.position) tail.push(p.position);
  if (p.team) tail.push(p.team);
  if (p.age != null) tail.push(`age ${p.age}`);
  if (tail.length) parts.push(`(${tail.join(", ")})`);
  return parts.join(" ");
}
