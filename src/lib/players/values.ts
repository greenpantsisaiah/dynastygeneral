/**
 * Dynasty player VALUES cache (KTC-equivalent, FantasyCalc-sourced).
 * Server-only.
 *
 * Why this exists: per dynasty-trade-realism-tester audit 2026-04-24,
 * Coach was freelancing player-for-player trade math because no value
 * scale was plumbed (only pick values were). Result: confident-but-
 * wrong trade asks that destroy user trust faster than any other
 * failure mode. Player KTC values bind the LLM's trade reasoning to
 * real numbers; receiving side must stay within ±15% of sending side
 * (the trade-realism rule in `system-prompt.ts`).
 *
 * Data source: FantasyCalc public API
 *   https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=N&numTeams=12&ppr=N
 *
 * Free, no auth, no scrape required. KTC and FantasyCalc agree to
 * within ~5-10% on top-200 players (consensus dynasty market). The
 * 0-100 scale is normalized so it composes arithmetically with the
 * pick-value scale (`startupPickValue` / `valueForFuturePick`).
 *
 * Mapping FantasyCalc players to Sleeper player_ids: by normalized
 * name + position, with team as a tiebreaker. The dataset is small
 * enough (~500 players) that a single linear pass per request is fine.
 *
 * TTL: 24h. Dynasty values move slowly; the engine doesn't need
 * intra-day freshness here. Re-pull triggers on cache miss or expiry.
 */

import { z } from "zod";
import { __dumpAllPlayers } from "./cache";

const TTL_MS = 24 * 60 * 60 * 1000;
const FANTASYCALC_BASE = "https://api.fantasycalc.com";

// Format variants we'll cache. Keyed by `${numQbs}:${ppr}` so that a
// 1QB-PPR league and a SF-half-PPR league have separate caches.
type FormatKey = string; // e.g. "1:1", "2:1", "1:0.5"

const fantasyCalcEntrySchema = z
  .object({
    player: z
      .object({
        name: z.string(),
        position: z.string().nullable().optional(),
        maybeTeam: z.string().nullable().optional(),
        sleeperId: z.string().nullable().optional(),
      })
      .passthrough(),
    value: z.number(),
    overallRank: z.number().nullable().optional(),
    positionRank: z.number().nullable().optional(),
  })
  .passthrough();

const fantasyCalcResponseSchema = z.array(fantasyCalcEntrySchema);

export type PlayerValue = {
  player_id: string; // Sleeper player_id
  name: string;
  position: string | null;
  team: string | null;
  // 0-100 normalized value. Top dynasty player ≈ 100.
  value: number;
  // Original FantasyCalc value for debugging / re-anchoring.
  raw_value: number;
  overall_rank: number | null;
  position_rank: number | null;
};

type CacheEntry = {
  byPlayerId: Map<string, PlayerValue>;
  byNamePosKey: Map<string, PlayerValue>;
  fetchedAt: number;
  // Top-of-dataset value used to scale to 0-100. Surfaced so consumers
  // can re-anchor or debug if FantasyCalc shifts their internal scale.
  scale_max: number;
};

const cache = new Map<FormatKey, CacheEntry>();
const inflight = new Map<FormatKey, Promise<CacheEntry>>();

function formatKey(numQbs: 1 | 2, ppr: number): FormatKey {
  return `${numQbs}:${ppr}`;
}

/**
 * Normalized name + position key. FantasyCalc and Sleeper sometimes
 * disagree on suffixes ("Jr.", "II"), apostrophes, or accented chars.
 * Strip non-letters, lowercase, suffix the position so "Mike Williams"
 * (WR) and "Mike Williams" (DE) don't collide.
 */
function nameKey(name: string, position: string | null): string {
  const cleanName = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z]/g, "");
  const cleanPos = (position ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  return `${cleanName}|${cleanPos}`;
}

async function fetchValues(
  numQbs: 1 | 2,
  ppr: number,
): Promise<CacheEntry> {
  const url = `${FANTASYCALC_BASE}/values/current?isDynasty=true&numQbs=${numQbs}&numTeams=12&ppr=${ppr}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      `FantasyCalc values (${numQbs}QB, ppr=${ppr}) failed: ${res.status}`,
    );
  }
  const json = (await res.json()) as unknown;
  const parsed = fantasyCalcResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `FantasyCalc values did not match schema: ${parsed.error.message}`,
    );
  }

  // Build a Sleeper-name lookup so we can fall back when FantasyCalc's
  // sleeperId field is missing (it often is for older entries). Single
  // pass over the player cache; ~10k entries.
  const allSleeper = await __dumpAllPlayers();
  const sleeperByNameKey = new Map<string, { id: string; team: string | null }>();
  for (const p of allSleeper) {
    const fullName =
      `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
      p.full_name ||
      "";
    if (!fullName) continue;
    const key = nameKey(fullName, p.position ?? null);
    // First occurrence wins; Sleeper often has duplicate name+pos
    // (different team across years). The active-NFL-player filter
    // upstream usually already trimmed retirees.
    if (!sleeperByNameKey.has(key)) {
      sleeperByNameKey.set(key, { id: p.player_id, team: p.team ?? null });
    }
  }

  // Find the top value to normalize to 0-100. Use top-3 average so a
  // single outlier (rookie with anomalous early value) doesn't
  // compress everyone else.
  const sorted = [...parsed.data].sort((a, b) => b.value - a.value);
  const topThree = sorted.slice(0, 3);
  const scaleMax =
    topThree.length > 0
      ? topThree.reduce((s, e) => s + e.value, 0) / topThree.length
      : 1;

  const byPlayerId = new Map<string, PlayerValue>();
  const byNamePosKey = new Map<string, PlayerValue>();
  for (const entry of parsed.data) {
    const fcName = entry.player.name;
    const fcPos = entry.player.position ?? null;
    const fcTeam = entry.player.maybeTeam ?? null;
    const key = nameKey(fcName, fcPos);
    let sleeperId: string | null = entry.player.sleeperId ?? null;
    let resolvedTeam = fcTeam;
    if (!sleeperId) {
      const match = sleeperByNameKey.get(key);
      if (match) {
        sleeperId = match.id;
        resolvedTeam = resolvedTeam ?? match.team;
      }
    }
    if (!sleeperId) continue;
    const normalized = Math.round((entry.value / scaleMax) * 100);
    const pv: PlayerValue = {
      player_id: sleeperId,
      name: fcName,
      position: fcPos,
      team: resolvedTeam,
      value: Math.max(0, Math.min(100, normalized)),
      raw_value: entry.value,
      overall_rank: entry.overallRank ?? null,
      position_rank: entry.positionRank ?? null,
    };
    byPlayerId.set(sleeperId, pv);
    byNamePosKey.set(key, pv);
  }

  return {
    byPlayerId,
    byNamePosKey,
    fetchedAt: Date.now(),
    scale_max: scaleMax,
  };
}

export async function getPlayerValues(args: {
  numQbs: 1 | 2;
  ppr: number;
}): Promise<CacheEntry> {
  const key = formatKey(args.numQbs, args.ppr);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = fetchValues(args.numQbs, args.ppr)
    .then((entry) => {
      cache.set(key, entry);
      return entry;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

/**
 * Resolve a list of Sleeper player_ids to player values, keyed by id.
 * Missing entries are simply absent from the returned map; callers
 * decide whether to fall back to ADP-based proxy or skip entirely.
 *
 * Format args derived from the league snapshot:
 *   isSuperflex → numQbs = 2 (else 1)
 *   isPpr       → ppr = 1
 *   isHalfPpr   → ppr = 0.5
 *   else        → ppr = 0 (standard)
 */
// TE-premium multiplier applied to TE values when the league has
// TE-premium scoring. FantasyCalc's API doesn't expose a TE-premium
// parameter (cache key is numQbs:ppr only), so the values returned
// are standard-PPR baseline. Without this multiplier, the Coach's
// trade-math systematically undervalues TEs in TE-premium leagues:
// Tucker Kraft at value 58 in standard is worth meaningfully more
// in TE-premium, and a Coach proposal that asks 0.6× of his
// standard value would have looked "fair" without the bump.
//
// 1.18 reflects the rough KTC-vs-Sleeper-ADP delta dynasty
// communities observe in moderate TE-premium (1.5 PPR for TEs vs 1
// for WR/RB). Heavy TE-prem (2.0 PPR for TE) trends higher; this is
// a conservative single multiplier rather than a tier-of-bonus
// scheme. Per dynasty-trade-realism-tester 2026-04-25.
const TE_PREMIUM_MULTIPLIER = 1.18;

export async function resolvePlayerValues(args: {
  ids: readonly string[];
  isSuperflex: boolean;
  isPpr: boolean;
  isHalfPpr: boolean;
  isTePremium?: boolean;
}): Promise<Map<string, PlayerValue>> {
  const numQbs = args.isSuperflex ? 2 : 1;
  const ppr = args.isPpr ? 1 : args.isHalfPpr ? 0.5 : 0;
  const out = new Map<string, PlayerValue>();
  if (args.ids.length === 0) return out;
  try {
    const entry = await getPlayerValues({ numQbs, ppr });
    for (const id of args.ids) {
      const v = entry.byPlayerId.get(id);
      if (!v) continue;
      if (
        args.isTePremium &&
        typeof v.position === "string" &&
        v.position.toUpperCase() === "TE"
      ) {
        out.set(id, {
          ...v,
          value: v.value * TE_PREMIUM_MULTIPLIER,
          raw_value: v.raw_value * TE_PREMIUM_MULTIPLIER,
        });
      } else {
        out.set(id, v);
      }
    }
  } catch {
    // Non-fatal: callers degrade gracefully if values aren't available.
  }
  return out;
}
