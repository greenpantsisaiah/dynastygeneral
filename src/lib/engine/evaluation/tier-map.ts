/**
 * Server-side helper: build per-position tier maps from an available
 * player pool. For each position, runs evaluate() against the engine
 * (with whatever signals are coded), sorts by point estimate descending,
 * and computes tiers via variance-band overlap.
 *
 * Used by the league hub during active drafts to surface scarcity and
 * "last in tier" cliff signals across positions simultaneously.
 *
 * Performance note: evaluate() is pure math on already-fetched data;
 * the bottleneck is the signals table lookups (one each per call).
 * Caller should batch-load player_signals and team_signals once and
 * pass them in.
 */

import { evaluate } from "./index";
import { computeTiers, type TierResult } from "./tiers";
import type {
  PlayerSignalsRow,
  TeamSignalsRow,
} from "@/lib/signals/schema";

const POSITIONS_TRACKED = ["RB", "WR", "TE", "QB"] as const;
export type TrackedPosition = (typeof POSITIONS_TRACKED)[number];

export const TIER_MAP_POSITIONS = POSITIONS_TRACKED;

const PER_POSITION_POOL_LIMIT = 60;

export type TierMapInputPlayer = {
  player_id: string;
  name: string;
  team: string | null;
  position: string | null;
  age: number | null;
  years_exp: number | null;
  search_rank: number | null;
  ktc_value: number | null; // normalized 0-100 from FantasyCalc
  adp: number | null;
};

export type TierMapPlayerRow = {
  player_id: string;
  name: string;
  team: string | null;
  point_estimate: number;
  variance_band: { lo: number; hi: number };
  is_last_in_tier: boolean;
  is_first_in_tier: boolean;
  tier: number;
};

export type TierMapPositionData = {
  position: TrackedPosition;
  total_players: number;
  tiers: TierResult["tiers"];
  // First N players from each of the top 3 tiers, for hover/details.
  top_tier_players: TierMapPlayerRow[];
};

export type TierMap = {
  positions: TierMapPositionData[];
  generated_at: string;
};

/**
 * Build the multi-position tier map. Each position runs through
 * evaluate() against any coded signals; players that don't get a
 * meaningful evaluation (no FC value, no ADP, no search_rank) are
 * dropped.
 */
export function buildTierMap(input: {
  players: readonly TierMapInputPlayer[];
  playerSignalsById: ReadonlyMap<string, Partial<PlayerSignalsRow>>;
  teamSignalsByTeam: ReadonlyMap<string, Partial<TeamSignalsRow>>;
}): TierMap {
  const positions: TierMapPositionData[] = [];

  for (const pos of POSITIONS_TRACKED) {
    const candidates = input.players
      .filter(
        (p) =>
          (p.position ?? "").toUpperCase() === pos &&
          // Drop players with NO market signal at all. If FC, ADP,
          // and search_rank are all null, the engine has nothing
          // meaningful to say about them.
          (p.ktc_value != null ||
            p.adp != null ||
            p.search_rank != null),
      )
      .slice(0, PER_POSITION_POOL_LIMIT);

    if (candidates.length === 0) {
      positions.push({
        position: pos,
        total_players: 0,
        tiers: [],
        top_tier_players: [],
      });
      continue;
    }

    const evaluated = candidates.map((p) => {
      const playerSignals = input.playerSignalsById.get(p.player_id);
      const teamSignals = p.team
        ? input.teamSignalsByTeam.get(p.team)
        : undefined;
      const result = evaluate({
        player: (playerSignals as PlayerSignalsRow | undefined) ?? null,
        team: (teamSignals as TeamSignalsRow | undefined) ?? null,
        ktc_value: p.ktc_value,
        adp: p.adp,
        search_rank: p.search_rank,
        position: p.position,
        age: p.age,
        years_exp: p.years_exp,
        is_rookie: p.years_exp === 0,
      });
      return {
        player: p,
        result,
      };
    });

    evaluated.sort(
      (a, b) => b.result.point_estimate - a.result.point_estimate,
    );

    const tierResult = computeTiers(
      evaluated.map((e) => ({
        player_id: e.player.player_id,
        point_estimate: e.result.point_estimate,
        variance_band: e.result.variance_band,
      })),
    );

    // Top 3 tiers worth of player detail. Anything past tier 3 is
    // generally "deep" and not decision-relevant for the next pick.
    const topTierIds = new Set<string>(
      tierResult.tiers
        .filter((t) => t.tier <= 3)
        .flatMap((t) => t.player_ids),
    );

    const top_tier_players: TierMapPlayerRow[] = evaluated
      .filter((e) => topTierIds.has(e.player.player_id))
      .map((e) => {
        const a = tierResult.assignments.get(e.player.player_id);
        return {
          player_id: e.player.player_id,
          name: e.player.name,
          team: e.player.team,
          point_estimate: e.result.point_estimate,
          variance_band: e.result.variance_band,
          is_last_in_tier: a?.isLastInTier ?? false,
          is_first_in_tier: a?.isFirstInTier ?? false,
          tier: a?.tier ?? 0,
        };
      });

    positions.push({
      position: pos,
      total_players: evaluated.length,
      tiers: tierResult.tiers,
      top_tier_players,
    });
  }

  return {
    positions,
    generated_at: new Date().toISOString(),
  };
}
