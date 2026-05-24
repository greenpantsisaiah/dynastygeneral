/**
 * Sleeper season-stats cache. Returns per-player season totals for a
 * given NFL year. Used as the production half of the starter_talent
 * signal: a player's last-season PPG is a strong baseline for their
 * 2026 expected production when their role is stable.
 *
 * Endpoint: api.sleeper.com/stats/nfl/{season}?season_type=regular
 * Returns an array of player-stat entries with the season-aggregated
 * fields we care about (pts_ppr / pts_half_ppr / pts_std / gp).
 *
 * Cached for 24 hours: completed-season totals don't change.
 *
 * Best-effort: when the fetch fails, we return an empty map. The
 * caller (snapshot builder) falls back to rank-only talent scoring
 * gracefully.
 */

import { z } from "zod";

const TTL_MS = 24 * 60 * 60 * 1000;
const SLEEPER_BASE = "https://api.sleeper.com";

const statsEntrySchema = z
  .object({
    player_id: z.string().nullable().optional(),
    stats: z
      .object({
        pts_ppr: z.number().nullable().optional(),
        pts_half_ppr: z.number().nullable().optional(),
        pts_std: z.number().nullable().optional(),
        gp: z.number().nullable().optional(),
        gms_active: z.number().nullable().optional(),
        // Usage. The same free Sleeper endpoint already returns rushing
        // carries (rush_att) and targets (rec_tgt) per player; parsing
        // them feeds the inflection model's prior-season workload-trend
        // signal (career-mileage stays a separate multi-season sum).
        rush_att: z.number().nullable().optional(),
        rec_tgt: z.number().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

const statsResponseSchema = z.array(statsEntrySchema);

export type PlayerSeasonStats = {
  player_id: string;
  pts_ppr: number | null;
  pts_half_ppr: number | null;
  pts_std: number | null;
  games_played: number | null;
  /** Rushing carries this season (Sleeper rush_att). Null when absent. */
  carries: number | null;
  /** Receiving targets this season (Sleeper rec_tgt). Null when absent. */
  targets: number | null;
};

type CacheEntry = {
  byPlayerId: Map<string, PlayerSeasonStats>;
  fetchedAt: number;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

async function fetchSeasonStats(season: string): Promise<CacheEntry> {
  const url = `${SLEEPER_BASE}/stats/nfl/${encodeURIComponent(
    season,
  )}?season_type=regular`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  } catch (err) {
    console.error(
      `[season-stats] fetch failed for ${season}:`,
      err instanceof Error ? err.message : String(err),
    );
    return { byPlayerId: new Map(), fetchedAt: Date.now() };
  }
  if (!res.ok) {
    console.error(`[season-stats] ${season} returned ${res.status}`);
    return { byPlayerId: new Map(), fetchedAt: Date.now() };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    console.error(
      `[season-stats] ${season} JSON parse failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return { byPlayerId: new Map(), fetchedAt: Date.now() };
  }
  const parsed = statsResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error(
      `[season-stats] ${season} schema mismatch:`,
      parsed.error.issues[0]?.message ?? "unknown",
    );
    return { byPlayerId: new Map(), fetchedAt: Date.now() };
  }
  const byPlayerId = new Map<string, PlayerSeasonStats>();
  for (const entry of parsed.data) {
    if (!entry.player_id) continue;
    const s = entry.stats ?? {};
    byPlayerId.set(entry.player_id, {
      player_id: entry.player_id,
      pts_ppr: s.pts_ppr ?? null,
      pts_half_ppr: s.pts_half_ppr ?? null,
      pts_std: s.pts_std ?? null,
      games_played: s.gp ?? s.gms_active ?? null,
      carries: s.rush_att ?? null,
      targets: s.rec_tgt ?? null,
    });
  }
  return { byPlayerId, fetchedAt: Date.now() };
}

export async function getSeasonStats(
  season: string,
): Promise<Map<string, PlayerSeasonStats>> {
  const existing = cache.get(season);
  if (existing && Date.now() - existing.fetchedAt < TTL_MS) {
    return existing.byPlayerId;
  }
  const pending = inflight.get(season);
  if (pending) {
    const entry = await pending;
    return entry.byPlayerId;
  }
  const promise = fetchSeasonStats(season);
  inflight.set(season, promise);
  try {
    const entry = await promise;
    cache.set(season, entry);
    return entry.byPlayerId;
  } finally {
    inflight.delete(season);
  }
}

/**
 * Career usage totals (carries + targets) summed across a bounded
 * window of completed seasons, keyed by Sleeper player_id. Feeds the
 * inflection model's RB career-mileage signal and the >=1500-carry
 * aging-cliff trigger.
 *
 * Window rationale: a workhorse RB accumulates ~250-300 carries/yr, so
 * six completed seasons covers the 1500 / 2000 mileage thresholds AND
 * the full career of any RB young enough to be near the cliff (entered
 * the league by age 22, reaches 28 in season six). RBs older than the
 * window already trigger the cliff on age, so the undercount is
 * immaterial. This is a runtime stopgap; the Phase 3 ingestion
 * (DATA_ACQUISITION_PHASE3.md) supersedes it with stored
 * player_signals.career_carries computed from nflverse.
 *
 * Cost: reuses the per-season getSeasonStats cache, so each season is
 * fetched at most once per instance per 24h. Callers should gate on
 * roster relevance (see rosterHasAgingRb) to skip the fetch when no
 * aging RB is present.
 */
export async function getCareerUsage(
  throughSeason: string,
  seasonsBack: number = 6,
): Promise<Map<string, { carries: number; targets: number }>> {
  const through = Number(throughSeason);
  const out = new Map<string, { carries: number; targets: number }>();
  if (!Number.isFinite(through)) return out;
  const seasons: string[] = [];
  for (let i = 1; i <= seasonsBack; i++) seasons.push(String(through - i));
  const maps = await Promise.all(
    seasons.map((s) =>
      getSeasonStats(s).catch(() => new Map<string, PlayerSeasonStats>()),
    ),
  );
  for (const m of maps) {
    for (const [id, stat] of m) {
      const acc = out.get(id) ?? { carries: 0, targets: 0 };
      acc.carries += stat.carries ?? 0;
      acc.targets += stat.targets ?? 0;
      out.set(id, acc);
    }
  }
  return out;
}

/**
 * Per-position PPG threshold for "elite tier" production. Used to
 * normalize last-season PPG to a 0-1 talent score. Top-tier producers
 * peg at 1.0; bottom-tier at 0. Reflects 2024-2025 elite-tier PPR
 * production: QB Allen/Lamar 22-26 ppg, RB CMC/Saquon 20-25, WR
 * Jefferson/Chase 18-22, TE Kelce/Andrews 14-18.
 */
const POSITION_PPG_ELITE: Record<string, number> = {
  QB: 24,
  RB: 22,
  WR: 20,
  TE: 16,
};

export function ppgScoreForPosition(
  ppg: number | null,
  position: string | null,
): number | null {
  if (ppg == null) return null;
  const elite = POSITION_PPG_ELITE[position ?? ""] ?? 18;
  return Math.max(0, Math.min(1, ppg / elite));
}

/**
 * Compute production-derived talent score for a player given their
 * last-season stats AND position. Returns null when no usable stats
 * exist (no history, or fewer than the games_played floor).
 *
 * Why a games_played floor: a player who appeared in 1-2 games last
 * season has a noisy PPG estimate. The floor (default 4) treats a
 * thin sample as no-data, which lets the caller fall back to
 * rank-based talent rather than trusting noise.
 *
 * Returns the score on a 0-1 scale aligned with the rank-based
 * normalization in the snapshot builder.
 */
export function productionScore(
  stats: PlayerSeasonStats | undefined,
  position: string | null,
  scoringVariant: "ppr" | "half_ppr" | "std" = "ppr",
  gpFloor: number = 4,
): number | null {
  if (!stats) return null;
  const games = stats.games_played ?? 0;
  if (games < gpFloor) return null;
  const totalPts =
    scoringVariant === "ppr"
      ? stats.pts_ppr
      : scoringVariant === "half_ppr"
        ? stats.pts_half_ppr
        : stats.pts_std;
  if (totalPts == null) return null;
  const ppg = totalPts / games;
  return ppgScoreForPosition(ppg, position);
}
