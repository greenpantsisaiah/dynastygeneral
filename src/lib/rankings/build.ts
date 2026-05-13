/**
 * Server-side data builder for the public /rankings page.
 *
 * Pulls the top dynasty pool from FantasyCalc (KTC-equivalent
 * consensus market), computes per-player component scores for the
 * three dials, and ships the pool to the client for slider-driven
 * reranking. Pre-bake everything that doesn't depend on dial state so
 * the client can reorder hundreds of rows on every drag without an
 * RTT.
 *
 * Component scores are all centered at 0 (range -1 to +1) so a dial
 * at the default 0.5 has zero net effect on the baseline ranking.
 * Move the dial toward 1 and the component starts pulling players up
 * or down based on whether they score above or below the cohort
 * baseline.
 */

import { __dumpAllPlayers } from "@/lib/players/cache";
import { getPlayerValues } from "@/lib/players/values";

export const RANKINGS_FORMAT_DEFAULT = {
  numQbs: 1 as 1 | 2,
  ppr: 1 as number,
};

export const RANKINGS_POOL_PUBLIC = 25;
export const RANKINGS_POOL_SIGNED_IN = 100;

export type RankedPlayer = {
  player_id: string;
  name: string;
  position: "QB" | "RB" | "WR" | "TE" | "OTHER";
  team: string | null;
  age: number | null;
  is_rookie: boolean;
  /** FantasyCalc-derived value, 0-100 normalized. */
  baseline_value: number;
  /** Rank within the same FantasyCalc pool (1-indexed). */
  market_rank: number;
  components: {
    /** -1 to +1. Positive = on the young side of the position's peak. */
    youth: number;
    /** -1 to +1. Meaningful only for RBs; 0 elsewhere. */
    bellcow: number;
    /** -1 to +1. Positive = OC tenure stable; negative = first-year OC. */
    continuity: number;
  };
};

export type RankedPool = {
  generated_at: string;
  /**
   * Format the pool was generated for. v1 ships a single 1QB-PPR pool
   * for the marketing surface; future iterations will let the visitor
   * pick their league shape.
   */
  format: { numQbs: 1 | 2; ppr: number };
  players: RankedPlayer[];
  /** Provenance for the source FantasyCalc values. */
  source: "fantasycalc";
};

const SUPPORTED_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

function normalizePosition(pos: string | null): RankedPlayer["position"] {
  const p = (pos ?? "").toUpperCase();
  if (SUPPORTED_POSITIONS.has(p)) return p as RankedPlayer["position"];
  return "OTHER";
}

/**
 * Position-aware age curve, centered at 0. Returns roughly -1 to +1
 * with +1 at the youngest end of the position's peak band and -1
 * past the cliff. Differs from `positionAgeMult` in `lane-identity`
 * (which returns 0..1 multipliers); we want a SIGNED score so the
 * Youth dial can both promote and demote.
 */
function youthScore(position: RankedPlayer["position"], age: number | null): number {
  if (age == null || Number.isNaN(age)) return 0;
  switch (position) {
    case "RB":
      if (age <= 22) return 1;
      if (age <= 24) return 0.7;
      if (age <= 26) return 0.3;
      if (age <= 28) return -0.2;
      if (age <= 30) return -0.7;
      return -1;
    case "WR":
      if (age <= 23) return 1;
      if (age <= 25) return 0.7;
      if (age <= 28) return 0.2;
      if (age <= 30) return -0.2;
      if (age <= 32) return -0.7;
      return -1;
    case "TE":
      if (age <= 24) return 1;
      if (age <= 26) return 0.5;
      if (age <= 29) return 0.1;
      if (age <= 31) return -0.4;
      return -1;
    case "QB":
      if (age <= 24) return 1;
      if (age <= 27) return 0.6;
      if (age <= 31) return 0.2;
      if (age <= 34) return -0.3;
      return -1;
    default:
      return 0;
  }
}

/**
 * Bellcow score. v1 heuristic: 0 for non-RBs; for RBs, scale by their
 * relative position rank inside the FantasyCalc RB pool. Top-12 RBs
 * score positive (clear bellcows in market terms); RB30+ score negative
 * (committee / passdown / handcuff shapes). Future iteration plugs in
 * the `rb_role_tier` field from `player_signals` for ground truth.
 */
function bellcowScore(
  position: RankedPlayer["position"],
  positionRank: number | null,
): number {
  if (position !== "RB") return 0;
  if (positionRank == null) return 0;
  if (positionRank <= 6) return 1;
  if (positionRank <= 12) return 0.5;
  if (positionRank <= 18) return 0.1;
  if (positionRank <= 24) return -0.3;
  return -1;
}

/**
 * Continuity score. v1 stub returns 0 (neutral) for every player. The
 * dial label is honest about this: when `team_signals.oc_tenure_yrs`
 * is populated for all 32 teams we'll wire real values in. Until then
 * the dial is rendered as "Coaching continuity (calibration in
 * progress)" and has no effect on the live ranking.
 */
function continuityScore(): number {
  return 0;
}

export async function buildRankedPool(args: {
  format?: { numQbs: 1 | 2; ppr: number };
  limit?: number;
}): Promise<RankedPool> {
  const format = args.format ?? RANKINGS_FORMAT_DEFAULT;
  const limit = Math.max(1, Math.min(args.limit ?? RANKINGS_POOL_SIGNED_IN, 300));

  const pool = await getPlayerValues({
    numQbs: format.numQbs,
    ppr: format.ppr,
  });

  const allSleeper = await __dumpAllPlayers();
  const sleeperById = new Map<string, (typeof allSleeper)[number]>();
  for (const p of allSleeper) sleeperById.set(p.player_id, p);

  const sorted = [...pool.byPlayerId.values()]
    .filter((v) => Number.isFinite(v.value))
    .sort((a, b) => b.value - a.value);

  const players: RankedPlayer[] = [];
  let marketRank = 0;
  for (const v of sorted) {
    marketRank += 1;
    if (players.length >= limit) break;
    const sp = sleeperById.get(v.player_id);
    const position = normalizePosition(v.position ?? sp?.position ?? null);
    if (position === "OTHER") continue;
    const age = typeof sp?.age === "number" ? sp.age : null;
    const isRookie = sp?.years_exp === 0;
    const name = sp?.full_name ?? v.name;
    const team = sp?.team ?? v.team ?? null;
    players.push({
      player_id: v.player_id,
      name,
      position,
      team,
      age,
      is_rookie: isRookie,
      baseline_value: Math.round(v.value * 10) / 10,
      market_rank: marketRank,
      components: {
        youth: youthScore(position, age),
        bellcow: bellcowScore(position, v.position_rank ?? null),
        continuity: continuityScore(),
      },
    });
  }

  return {
    generated_at: new Date().toISOString(),
    format,
    players,
    source: "fantasycalc",
  };
}
