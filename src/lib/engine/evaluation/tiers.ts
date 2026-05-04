/**
 * Tier computation for a ranked list of evaluated players. Tiers
 * emerge from the engine's own variance bands rather than arbitrary
 * cluster boundaries: two players are in the same tier when their
 * confidence intervals meaningfully overlap.
 *
 * Framework: tier-based drafting (FantasyPros), Value Over Replacement
 * (Joe Bryant), Value Over Next Available (VONA). Standard fantasy
 * analytics literature treats tier breaks as the load-bearing decision
 * signal: pick decisions optimize for the player whose remaining
 * availability decays fastest, not the highest-ranked player on the
 * board.
 *
 * Why variance-band overlap over fixed-gap or k-means:
 * - Honest: tiers reflect what the model actually knows
 * - Self-tuning: as variance bands tighten via Phase 2 calibration,
 *   tiers automatically refine
 * - No arbitrary k or threshold to defend
 *
 * Input is a list of evaluated players ALREADY sorted by point estimate
 * descending. Caller is responsible for that sort.
 */

export type TieredPlayerInput = {
  player_id: string;
  point_estimate: number;
  variance_band: { lo: number; hi: number };
};

export type TierAssignment = {
  player_id: string;
  tier: number;
  isFirstInTier: boolean;
  isLastInTier: boolean;
};

export type TierMetadata = {
  tier: number;
  count: number;
  rangeLo: number;
  rangeHi: number;
  player_ids: string[];
};

export type TierResult = {
  assignments: Map<string, TierAssignment>;
  tiers: TierMetadata[];
};

/**
 * Compute tiers using single-linkage variance-band overlap on a
 * point-descending sorted list. A tier breaks when a player's
 * variance_band.hi falls below the running minimum of variance_band.lo
 * across the current tier (no chain of overlap reaches them).
 */
export function computeTiers(
  rankedPlayers: readonly TieredPlayerInput[],
): TierResult {
  const assignments = new Map<string, TierAssignment>();
  const tiers: TierMetadata[] = [];

  if (rankedPlayers.length === 0) {
    return { assignments, tiers };
  }

  let currentTier = 1;
  let currentTierStart = 0;
  let currentTierBandLo = rankedPlayers[0].variance_band.lo;

  // First player starts tier 1
  assignments.set(rankedPlayers[0].player_id, {
    player_id: rankedPlayers[0].player_id,
    tier: 1,
    isFirstInTier: true,
    isLastInTier: false,
  });

  for (let i = 1; i < rankedPlayers.length; i++) {
    const player = rankedPlayers[i];
    const sameTier = player.variance_band.hi >= currentTierBandLo;

    if (sameTier) {
      currentTierBandLo = Math.min(currentTierBandLo, player.variance_band.lo);
      assignments.set(player.player_id, {
        player_id: player.player_id,
        tier: currentTier,
        isFirstInTier: false,
        isLastInTier: false,
      });
    } else {
      // Tier break. Mark previous player as last-in-tier and finalize
      // tier metadata, then open a new tier.
      const prev = rankedPlayers[i - 1];
      const prevAssignment = assignments.get(prev.player_id);
      if (prevAssignment) {
        prevAssignment.isLastInTier = true;
      }
      const tierPlayers = rankedPlayers.slice(currentTierStart, i);
      tiers.push({
        tier: currentTier,
        count: tierPlayers.length,
        rangeLo: Math.min(...tierPlayers.map((p) => p.point_estimate)),
        rangeHi: Math.max(...tierPlayers.map((p) => p.point_estimate)),
        player_ids: tierPlayers.map((p) => p.player_id),
      });

      currentTier += 1;
      currentTierStart = i;
      currentTierBandLo = player.variance_band.lo;
      assignments.set(player.player_id, {
        player_id: player.player_id,
        tier: currentTier,
        isFirstInTier: true,
        isLastInTier: false,
      });
    }
  }

  // Finalize the trailing tier
  const lastIdx = rankedPlayers.length - 1;
  const lastAssignment = assignments.get(rankedPlayers[lastIdx].player_id);
  if (lastAssignment) {
    lastAssignment.isLastInTier = true;
  }
  const tailPlayers = rankedPlayers.slice(currentTierStart);
  tiers.push({
    tier: currentTier,
    count: tailPlayers.length,
    rangeLo: Math.min(...tailPlayers.map((p) => p.point_estimate)),
    rangeHi: Math.max(...tailPlayers.map((p) => p.point_estimate)),
    player_ids: tailPlayers.map((p) => p.player_id),
  });

  return { assignments, tiers };
}

/**
 * Scarcity classification for a tier based on remaining count. Used
 * by the Tier Map UI to flag positions where the user should act.
 */
export type TierScarcity = "critical" | "scarce" | "moderate" | "deep";

export function classifyTierScarcity(count: number): TierScarcity {
  if (count <= 1) return "critical"; // 0-1 left = grab now
  if (count <= 3) return "scarce"; // 2-3 left = thin tier
  if (count <= 6) return "moderate";
  return "deep";
}
