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
import {
  ageFactor,
  positionFactor,
  positionAgeCutoff,
} from "./age-curve";
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
  // True when the player is an incoming rookie (years_exp === 0). UI
  // surfaces a ROOKIE tag; coach knows to acknowledge unknown landing
  // spot + speculative dynasty value for pre-NFL-draft rookies.
  is_rookie: boolean;
};

function adpFormatFromSnapshot(snap: LeagueSnapshot): AdpFormatKey {
  return {
    isSuperflex: snap.format === "superflex" || snap.format === "2qb",
    isPpr: snap.scoring.includes("PPR"),
    isHalfPpr: snap.scoring.includes("half-PPR"),
    isTePremium: snap.scoring.includes("TE-premium"),
  };
}

function computeDynastyRank(
  searchRank: number,
  age: number | null,
  position: string | null,
  isSuperflex: boolean,
): number {
  // Position-specific age curve + tier-aware SF QB premium live in
  // `./age-curve.ts` (single source of truth across scout + available
  // surfaces). See that module for citations.
  return (
    searchRank *
    ageFactor(position, age) *
    positionFactor(position, isSuperflex, searchRank)
  );
}

export async function getAvailablePlayers(
  snap: LeagueSnapshot,
  opts: { limit?: number } = {},
): Promise<AvailablePlayer[]> {
  const limit = opts.limit ?? 200;
  // "Unavailable" depends on whether a draft is actively running.
  //
  // Active draft (drafting / paused): the only authoritative source of
  // "this player has been claimed" is `snap.draft.picks_made`. Sleeper's
  // `roster.players` field can carry stale player_ids from prior seasons
  // or converted leagues (keeper holdovers, league-conversion data); if
  // we union that into the exclusion set during a live draft we silently
  // kill real undrafted players. This bit Sam LaPorta on 2026-04-25:
  // top-100 TE, undrafted in the active draft, but present in some
  // roster's `roster.players` from prior-season state, so the pool
  // dropped him entirely. Coach couldn't reason about him because he
  // wasn't in the snapshot.
  //
  // Pre-draft / complete / no-draft: keep the roster union. Without it,
  // every veteran in an established post-draft league surfaces as
  // "available" (Bijan Robinson appearing as draftable in a year-old
  // league). After a draft completes, `roster.players` IS the source
  // of truth for who's claimed.
  const isActiveDraft =
    snap.draft.status === "drafting" || snap.draft.status === "paused";
  const drafted = new Set<string>();
  for (const pick of snap.draft.picks_made) {
    if (pick.player_id) drafted.add(pick.player_id);
  }
  if (!isActiveDraft) {
    for (const r of snap.rosters) {
      for (const id of r.player_ids) drafted.add(id);
    }
  }
  const all = await __dumpAllPlayers();
  const ranked = all
    .filter((p) => !drafted.has(p.player_id))
    .filter((p) => {
      const pos = (p.position ?? "").toUpperCase();
      return DYNASTY_POSITIONS.has(pos);
    })
    .filter((p) => typeof p.search_rank === "number" && p.search_rank > 0)
    // Filter to plausibly-current NFL players. Layered rules:
    //   1. Declared rookies (years_exp === 0) ALWAYS pass. Even with
    //      no team assigned yet (pre-NFL-draft), no age, no ADP. Their
    //      existence in Sleeper's DB means they're drafted-for-dynasty
    //      targets. Cards tag them ROOKIE so the UI is honest about
    //      the speculative value.
    //   2. Position-specific age cap (RB 32, WR 33, TE 34, QB 38). Kills
    //      retirees (Brady, Brees, Roethlisberger) with stale active
    //      status while preserving legitimate aging-vet picks at QB
    //      (Rodgers, Stafford). The prior flat ≤35 cutoff amputated
    //      those entirely. See `age-curve.ts` for cutoff sources.
    //   3. Team required UNLESS sophomore (age ≤ 23, years_exp ≤ 1).
    //      Cuts Ruggs (22, 2 yrs, no team) while keeping 2nd-year
    //      unsigned prospects.
    .filter((p) => {
      if (p.years_exp === 0) return true;
      if (typeof p.age !== "number") return false;
      if (p.age > positionAgeCutoff(p.position ?? null)) return false;
      const team = (p.team ?? "").trim();
      if (team) return true;
      const isSophomorePlus =
        p.age <= 23 &&
        typeof p.years_exp === "number" &&
        p.years_exp <= 1;
      return isSophomorePlus;
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
    const is_rookie = p.years_exp === 0;
    const adpRaw = projections?.byPlayerId.get(p.player_id);
    const { value: adp, variant: adp_variant } = pickAdpFromVariants(
      adpRaw,
      { ...fmtKey, isRookie: is_rookie, position: human.position },
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
      is_rookie,
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
