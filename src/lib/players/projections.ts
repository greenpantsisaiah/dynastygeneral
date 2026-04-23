/**
 * Sleeper projections cache. Provides per-player ADP across all
 * dynasty/redraft variants. Server-only.
 *
 * Data source: api.sleeper.com/projections/nfl/{season}?season_type=regular.
 * This is the same endpoint that powers the ADP column in Sleeper's
 * draft UI. Format-aware variants returned per player:
 *   adp_dynasty            generic dynasty
 *   adp_dynasty_2qb        superflex / 2QB dynasty
 *   adp_dynasty_ppr        PPR dynasty
 *   adp_dynasty_half_ppr   half-PPR dynasty
 *   adp_dynasty_std        standard-scoring dynasty
 *   adp_2qb / adp_ppr / adp_std / adp_half_ppr   redraft variants
 *   adp_rookie             rookie-only drafts
 *
 * We pick the right ADP variant at request time based on the league
 * snapshot's format + scoring; consumers see one number that matches
 * what their Sleeper draft UI shows.
 *
 * Endpoint is unofficial but stable; we cache 6h to avoid hammering it.
 */

import { z } from "zod";

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const SLEEPER_BASE = "https://api.sleeper.com";

const projectionEntrySchema = z
  .object({
    player_id: z.string().nullable().optional(),
    stats: z
      .object({
        adp_dynasty: z.number().nullable().optional(),
        adp_dynasty_2qb: z.number().nullable().optional(),
        adp_dynasty_ppr: z.number().nullable().optional(),
        adp_dynasty_half_ppr: z.number().nullable().optional(),
        adp_dynasty_std: z.number().nullable().optional(),
        adp_2qb: z.number().nullable().optional(),
        adp_ppr: z.number().nullable().optional(),
        adp_half_ppr: z.number().nullable().optional(),
        adp_std: z.number().nullable().optional(),
        adp_rookie: z.number().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

const projectionsResponseSchema = z.array(projectionEntrySchema);

// Per-player record we expose. `all` is the raw map so callers can
// pick a custom variant; `dynasty` is the most common dynasty value.
export type PlayerAdp = {
  player_id: string;
  // Variant scores (lower = drafted earlier = more valuable). Any can
  // be missing if Sleeper hasn't tagged that variant for this player.
  adp_dynasty: number | null;
  adp_dynasty_2qb: number | null;
  adp_dynasty_ppr: number | null;
  adp_dynasty_half_ppr: number | null;
  adp_dynasty_std: number | null;
  adp_2qb: number | null;
  adp_ppr: number | null;
  adp_half_ppr: number | null;
  adp_std: number | null;
  adp_rookie: number | null;
};

type CacheEntry = {
  byPlayerId: Map<string, PlayerAdp>;
  fetchedAt: number;
};

const cache = new Map<string, CacheEntry>(); // keyed by season
const inflight: Map<string, Promise<CacheEntry>> = new Map();

async function fetchProjections(season: string): Promise<CacheEntry> {
  // Pull QB/RB/WR/TE in one URL via multi-value query params.
  const params = new URLSearchParams();
  params.set("season_type", "regular");
  params.set("order_by", "adp");
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    params.append("position[]", pos);
  }
  const url = `${SLEEPER_BASE}/projections/nfl/${encodeURIComponent(
    season,
  )}?${params.toString()}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Sleeper projections ${season} failed: ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  const parsed = projectionsResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Sleeper projections ${season} did not match schema: ${parsed.error.message}`,
    );
  }
  const byPlayerId = new Map<string, PlayerAdp>();
  for (const entry of parsed.data) {
    const id = entry.player_id;
    if (!id) continue;
    const stats = entry.stats ?? {};
    byPlayerId.set(id, {
      player_id: id,
      adp_dynasty: stats.adp_dynasty ?? null,
      adp_dynasty_2qb: stats.adp_dynasty_2qb ?? null,
      adp_dynasty_ppr: stats.adp_dynasty_ppr ?? null,
      adp_dynasty_half_ppr: stats.adp_dynasty_half_ppr ?? null,
      adp_dynasty_std: stats.adp_dynasty_std ?? null,
      adp_2qb: stats.adp_2qb ?? null,
      adp_ppr: stats.adp_ppr ?? null,
      adp_half_ppr: stats.adp_half_ppr ?? null,
      adp_std: stats.adp_std ?? null,
      adp_rookie: stats.adp_rookie ?? null,
    });
  }
  return { byPlayerId, fetchedAt: Date.now() };
}

export async function getProjections(season: string): Promise<CacheEntry> {
  const cached = cache.get(season);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;
  const existing = inflight.get(season);
  if (existing) return existing;
  const promise = fetchProjections(season)
    .then((entry) => {
      cache.set(season, entry);
      return entry;
    })
    .finally(() => {
      inflight.delete(season);
    });
  inflight.set(season, promise);
  return promise;
}

// Pick the right ADP variant for a given league format + scoring set.
// Falls back through plausible defaults so we always return SOME number
// when one exists for the player.
export type AdpFormatKey = {
  isSuperflex: boolean;
  isPpr: boolean;
  isHalfPpr: boolean;
  isTePremium: boolean;
  // Rookies (years_exp === 0) get adp_rookie preference. Sleeper's
  // dynasty variants are sparse for unsigned rookies pre-NFL-draft;
  // adp_rookie is the only field consistently populated for them.
  isRookie?: boolean;
};

export function pickAdpFromVariants(
  adp: PlayerAdp | undefined,
  fmt: AdpFormatKey,
): { value: number | null; variant: string } {
  if (!adp) return { value: null, variant: "none" };

  // Preference order: most specific dynasty variant matching format,
  // then any dynasty variant, then redraft as last resort.
  const candidates: Array<[number | null, string]> = [];

  // Rookies: prefer rookie-draft ADP first. It's the most informative
  // signal for someone yet to play an NFL snap.
  if (fmt.isRookie) {
    candidates.push([adp.adp_rookie, "rookie"]);
  }

  if (fmt.isSuperflex) {
    candidates.push([adp.adp_dynasty_2qb, "dynasty_2qb"]);
  }
  if (fmt.isPpr) {
    candidates.push([adp.adp_dynasty_ppr, "dynasty_ppr"]);
  } else if (fmt.isHalfPpr) {
    candidates.push([adp.adp_dynasty_half_ppr, "dynasty_half_ppr"]);
  } else {
    candidates.push([adp.adp_dynasty_std, "dynasty_std"]);
  }
  candidates.push([adp.adp_dynasty, "dynasty"]);
  // Redraft fallbacks
  if (fmt.isSuperflex) candidates.push([adp.adp_2qb, "2qb"]);
  if (fmt.isPpr) candidates.push([adp.adp_ppr, "ppr"]);
  else if (fmt.isHalfPpr) candidates.push([adp.adp_half_ppr, "half_ppr"]);
  else candidates.push([adp.adp_std, "std"]);

  for (const [v, variant] of candidates) {
    // Skip Sleeper's "999" sentinel and null/undefined
    if (v != null && Number.isFinite(v) && v < 999) {
      return { value: v, variant };
    }
  }
  return { value: null, variant: "none" };
}
