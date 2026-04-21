/**
 * Available players. The undrafted pool, ranked by a dynasty-aware
 * heuristic that combines Sleeper search_rank with age and position.
 * Server-only.
 *
 * Why not raw search_rank? Sleeper's rank is biased toward NFL relevance,
 * not dynasty value. It will rank a 27-yo journeyman backup (Mac Jones)
 * higher than a 23-yo starter-with-trade-catalyst (J.J. McCarthy). For
 * dynasty draft suggestions that's exactly the wrong ordering.
 *
 * Heuristic: dynasty_rank = search_rank × age_factor × position_factor.
 *   - age_factor: 0.7 if ≤ 23 (long career runway), 1.0 if 24-26,
 *                 1.3 if 27-29, 1.7 if 30+ (assets depreciate fast).
 *   - position_factor: 0.9 for QB in superflex (premium), else 1.0.
 *
 * Lower dynasty_rank = better player for a dynasty roster. KTC or a
 * dynasty-specific data feed would be sharper; this gets us 80% of the
 * way without a paid API.
 */

import { __dumpAllPlayers, humanize, type HumanPlayer } from "./cache";
import {
  getProjections,
  pickAdpFromVariants,
  type AdpFormatKey,
} from "./projections";
import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";

const DYNASTY_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

export type AvailablePlayer = HumanPlayer & {
  search_rank: number;
  // Dynasty-adjusted ranking. Lower = more valuable. Used for sort
  // order in suggestion contexts. search_rank is preserved for the UI
  // to show alongside ("rank #N (Sleeper)") if needed.
  dynasty_rank: number;
  // Sleeper ADP for the league's format/scoring. Number = the avg pick
  // position this player goes at (lower = drafted earlier = higher value).
  // null when Sleeper has no data for this player at the chosen variant.
  adp: number | null;
  // Which ADP variant we resolved to (e.g., "dynasty_2qb" for superflex).
  // Useful for the UI to label "ADP (dynasty SF)" vs just "ADP."
  adp_variant: string;
};

function adpFormatFromSnapshot(snap: LeagueSnapshot): AdpFormatKey {
  return {
    isSuperflex: snap.format === "superflex" || snap.format === "2qb",
    isPpr: snap.scoring.includes("PPR"),
    isHalfPpr: snap.scoring.includes("half-PPR"),
    isTePremium: snap.scoring.includes("TE-premium"),
  };
}

function ageFactor(age: number | null): number {
  if (age == null) return 1.2; // unknown age treated as mildly negative
  if (age <= 23) return 0.7;
  if (age <= 26) return 1.0;
  if (age <= 29) return 1.3;
  return 1.7;
}

function positionFactor(
  position: string | null,
  isSuperflex: boolean,
): number {
  if (!position) return 1.0;
  // QB in superflex is genuinely scarcer; demote it less aggressively.
  if (position === "QB" && isSuperflex) return 0.9;
  return 1.0;
}

function computeDynastyRank(
  searchRank: number,
  age: number | null,
  position: string | null,
  isSuperflex: boolean,
): number {
  return searchRank * ageFactor(age) * positionFactor(position, isSuperflex);
}

export async function getAvailablePlayers(
  snap: LeagueSnapshot,
  opts: { limit?: number } = {},
): Promise<AvailablePlayer[]> {
  const limit = opts.limit ?? 200;
  const drafted = new Set(
    snap.draft.picks_made.map((p) => p.player_id).filter(Boolean),
  );
  const all = await __dumpAllPlayers();
  const ranked = all
    .filter((p) => !drafted.has(p.player_id))
    .filter((p) => {
      const pos = (p.position ?? "").toUpperCase();
      return DYNASTY_POSITIONS.has(pos);
    })
    .filter((p) => typeof p.search_rank === "number" && p.search_rank > 0)
    // Filter to plausibly-current NFL players. Sleeper's player dump
    // is dirty: it lists retired veterans (Brady, Brees, Roethlisberger)
    // and stale young players (Henry Ruggs) with `status: Active` and
    // old search_rank. Two-layer filter:
    //   1. Hard age cap: ≤35. kills Brady (45), Brees (42), Big Ben (39).
    //      Misses tiny edge cases (older starting QB, ageing TE) but
    //      those rarely show up in dynasty draft suggestions anyway.
    //   2. Roster check: must have a team UNLESS clearly a fresh rookie
    //      (age ≤ 23 AND years_exp ≤ 1). Cuts Ruggs (22, 2 yrs, no team).
    .filter((p) => {
      if (typeof p.age !== "number" || p.age > 35) return false;
      const team = (p.team ?? "").trim();
      if (team) return true;
      const isFreshRookie =
        p.age <= 23 &&
        typeof p.years_exp === "number" &&
        p.years_exp <= 1;
      return isFreshRookie;
    })
    .sort((a, b) => (a.search_rank ?? 9999) - (b.search_rank ?? 9999))
    // Pull a wider window before dynasty re-sort. The dynasty heuristic
    // can lift a #150 search_rank rookie above a #100 search_rank vet,
    // so we need enough of the long tail to actually re-order.
    .slice(0, Math.max(limit * 2, 400));

  const isSuperflex =
    snap.format === "superflex" || snap.format === "2qb";

  // Best-effort: pull Sleeper projections so we can attach format-aware
  // ADP. Failures (network, schema drift) shouldn't break the suggestions
  // surface; degrade to ADP = null per player.
  let projections: Awaited<ReturnType<typeof getProjections>> | null = null;
  try {
    projections = await getProjections(snap.season);
  } catch (err) {
    console.error("[available:projections]", err);
  }
  const fmtKey = adpFormatFromSnapshot(snap);

  const enriched: AvailablePlayer[] = ranked.map((p) => {
    const search_rank = p.search_rank ?? 9999;
    const human = humanize(p);
    const adpRaw = projections?.byPlayerId.get(p.player_id);
    const { value: adp, variant: adp_variant } = pickAdpFromVariants(
      adpRaw,
      fmtKey,
    );
    return {
      ...human,
      search_rank,
      dynasty_rank: computeDynastyRank(
        search_rank,
        human.age,
        human.position,
        isSuperflex,
      ),
      adp,
      adp_variant,
    };
  });

  // Final sort by dynasty_rank, then trim to requested limit.
  enriched.sort((a, b) => a.dynasty_rank - b.dynasty_rank);
  return enriched.slice(0, limit);
}

export function topAvailableAtPosition(
  available: AvailablePlayer[],
  position: string,
  n = 3,
): AvailablePlayer[] {
  return available
    .filter((p) => (p.position ?? "").toUpperCase() === position.toUpperCase())
    .slice(0, n);
}
