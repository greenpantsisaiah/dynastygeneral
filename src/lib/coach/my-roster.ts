/**
 * Coach my_roster builder. Pure function over the LeagueSnapshot's
 * `me` RosterSnapshot + the FormatRules + resolved player metadata +
 * priced player values + prior-season stats. Returns the named-roster
 * array that ships in the Coach context as `me.players`.
 *
 * Lives here (not inline in the Coach route) for two reasons:
 *   1. The taxi-eligibility flag must read `formatRules.has_taxi` and
 *      `formatRules.taxi_years`. When this logic lived inline in the
 *      route, the `.map()` callback referenced `formatRules` before
 *      its declaration, hit a temporal dead zone, threw, was caught
 *      silently, and the user's named roster shipped empty. Extracting
 *      the helper makes the dependency explicit at the call site.
 *   2. The route has no synthetic-data test path; this helper does.
 *      `evals/coach-my-roster.test.ts` builds a synthetic snapshot +
 *      resolved-player map and asserts the named roster is non-empty
 *      with correct taxi flags. Any future refactor that drops the
 *      named roster or breaks taxi eligibility fails CI.
 */

import type { FormatRules } from "@/lib/engine/llm-contract";
import { humanize } from "@/lib/players/cache";
import {
  buildOpportunityProfile,
  type OpportunityProfile,
  type PlayerSeasonStats,
} from "@/lib/players/season-stats";
import type { SleeperPlayer } from "@/lib/sleeper/schemas";
import type { RosterSnapshot } from "@/lib/strategy/league-state/snapshot";

/**
 * Resolved player value entry. Mirrors the shape Coach reads off the
 * priced pool's player_values map: KTC-equivalent value plus optional
 * overall and position ranks.
 */
export type ResolvedPlayerValue = {
  value: number;
  overall_rank: number | null;
  position_rank: number | null;
};

export type CoachMyRosterPlayer = {
  player_id: string;
  name: string;
  pos: string | null;
  team: string | null;
  age: number | null;
  /** NFL years of experience. 0 = rookie. Drives taxi eligibility. */
  years_exp: number | null;
  rank: number | null;
  /**
   * Prior-season earned-role read (snap share, targets/game, aDOT, RZ
   * role, drop rate) via the canonical buildOpportunityProfile. Null
   * when the player had no /stats row last season.
   */
  opportunity: OpportunityProfile | null;
  /**
   * Currently parked on this roster's taxi (developmental) squad.
   * Coach must not suggest moving a player here who is already here.
   */
  currently_on_taxi: boolean;
  /**
   * Currently on IR / reserve. A reserve player does not start; the
   * room is for injured players, not developmental.
   */
  currently_on_reserve: boolean;
  /**
   * Conservative taxi-eligibility flag. True iff the league has taxi
   * AND the player's NFL experience is within the league's taxi_years
   * cutoff AND the player is not already on taxi / reserve. Sleeper's
   * full rule ALSO requires the player to have never been activated
   * to the main roster; we cannot verify the second clause from the
   * snapshot.
   */
  taxi_eligible: boolean;
  /** FantasyCalc-equivalent value (0-100). Null when unpriced. */
  value: number | null;
  /** Overall rank in the priced pool. Null when unpriced. */
  overall_rank: number | null;
  /** Position rank in the priced pool. Null when unpriced. */
  position_rank: number | null;
};

/**
 * Build the named-roster array Coach reads as `me.players`. Pure:
 * takes the already-resolved player map (not the cache), so the
 * function is unit-testable without network or filesystem.
 *
 * Returns an empty array when `me.player_ids` is empty. Returns a
 * partially-populated array when some IDs do not resolve in the
 * player map (an unresolvable ID is dropped, not faked).
 *
 * Sort: by Sleeper search_rank ascending (best ranks first), with
 * un-ranked players bucketed to the end. Mirrors the prior inline
 * Coach-route behavior.
 */
export function buildMyRosterForCoach(args: {
  me: RosterSnapshot;
  formatRules: FormatRules;
  resolvedPlayers: Map<string, SleeperPlayer>;
  prevSeasonStats: Map<string, PlayerSeasonStats>;
  playerValueMap: Map<string, ResolvedPlayerValue>;
}): CoachMyRosterPlayer[] {
  const { me, formatRules, resolvedPlayers, prevSeasonStats, playerValueMap } =
    args;
  if (me.player_ids.length === 0) return [];

  const taxiSet = new Set(me.taxi_player_ids ?? []);
  const reserveSet = new Set(me.reserve_player_ids ?? []);

  const out: CoachMyRosterPlayer[] = [];
  for (const id of me.player_ids) {
    const p = resolvedPlayers.get(id);
    if (!p) continue;
    const human = humanize(p);
    const opp = buildOpportunityProfile(prevSeasonStats.get(id));
    const hasOpp = opp.snap_share != null || opp.targets_per_game != null;
    const onTaxi = taxiSet.has(id);
    const onReserve = reserveSet.has(id);
    const taxiEligible =
      formatRules.has_taxi &&
      !onTaxi &&
      !onReserve &&
      typeof human.yearsExp === "number" &&
      formatRules.taxi_years != null &&
      human.yearsExp <= formatRules.taxi_years;
    const v = playerValueMap.get(id);
    out.push({
      player_id: id,
      name: human.name,
      pos: human.position,
      team: human.team,
      age: human.age,
      years_exp: human.yearsExp,
      rank: typeof p.search_rank === "number" ? p.search_rank : null,
      opportunity: hasOpp ? opp : null,
      currently_on_taxi: onTaxi,
      currently_on_reserve: onReserve,
      taxi_eligible: taxiEligible,
      value: v ? v.value : null,
      overall_rank: v ? v.overall_rank : null,
      position_rank: v ? v.position_rank : null,
    });
  }
  return out.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
}
