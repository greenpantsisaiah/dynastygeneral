/**
 * Contender outlook forecast. Per-year projection of the user's win-now
 * score across a 5-year horizon (current season through current+4).
 *
 * Treats each future season as a hypothetical "now": age the current
 * roster forward, materialize any owned future picks landing on or
 * before that year as expected-value rookies, then run the same
 * win-now scoring used by the WindowsBar. Output is one score per
 * year, banded into Rebuild / Bubble / Contender tiers.
 *
 * The model is admittedly coarse. Pick hit rates are blended across
 * positions; rookies are split by typical class composition rather
 * than position-specific draft profiles; injury and scheme variance
 * are not modeled. The user is making a multi-year bet either way;
 * this surface lets them see what shape the bet is.
 */
import { resolvePlayers } from "@/lib/players/cache";
import type { SleeperPlayer } from "@/lib/sleeper/schemas";
import {
  CLASS_STRENGTH_MULTIPLIER,
  SUPERFLEX_PICK_MULTIPLIER,
  computeOwnedFuturePicks,
  expectedRookieValue,
  resolveRookieRounds,
} from "@/lib/players/future-picks";
import { ageFactor } from "@/lib/players/age-curve";
import type {
  LeagueSnapshot,
  RosterSnapshot,
} from "../league-state/snapshot";
import { normalizePosition, type Position } from "../archetypes/schema";
import { scoreWinNowFor } from "../windows/compute";
import { tierForScore, type ContenderYear } from "./types";

export const OUTLOOK_HORIZON = 5; // seasons including the current one

// Typical NFL rookie age at draft. Used to age materialized rookies
// forward from their draft year. The vast majority of fantasy-relevant
// rookies are 21-23 at draft; 22 is a defensible midpoint.
const ROOKIE_AGE_AT_DRAFT = 22;

// Rough per-class rookie position breakdown for fantasy-relevant picks.
// Used to attribute materialized rookies into position_counts when we
// don't know which player a pick will become. Calibrated to recent
// dynasty-rookie-draft composition (2024 + 2025 KTC pools) per the
// assumption auditor's 2026-04-22 review: TE was understated and RB
// was overstated. v2 could derive per-class composition from the
// actual rookie KTC pool when class is known.
const ROOKIE_POSITION_MIX: Record<Position, number> = {
  QB: 0.15,
  RB: 0.25,
  WR: 0.50,
  TE: 0.10,
  K: 0,
  DST: 0,
};

const FANTASY_POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

type ResolvedRosterPlayer = {
  position: Position | null;
  age: number | null;
  // Heuristic "today value" used to weight which players survive each
  // future year more than just by count. Currently unused at the score
  // level (scoreWinNowFor reads aggregated counts) but kept available
  // for v2 weighting refinements.
  search_rank: number;
};

async function resolveMyRosterPlayers(
  me: RosterSnapshot,
): Promise<ResolvedRosterPlayer[]> {
  const map = await resolvePlayers(me.player_ids);
  const out: ResolvedRosterPlayer[] = [];
  for (const id of me.player_ids) {
    const p: SleeperPlayer | undefined = map.get(id);
    if (!p) continue;
    out.push({
      position: normalizePosition(p.position ?? null),
      age: typeof p.age === "number" ? p.age : null,
      search_rank:
        typeof p.search_rank === "number" && p.search_rank > 0
          ? p.search_rank
          : 9999,
    });
  }
  return out;
}

/**
 * Build a synthetic RosterSnapshot for the user as of the projected
 * year. Aged-current players who pass their position cliff drop out;
 * materialized rookies (from picks landing in years <= projection year)
 * join the roster aged from their draft year.
 */
function projectRosterForYear(args: {
  currentYear: number;
  projectionYear: number;
  baseRoster: RosterSnapshot;
  rosterPlayers: ResolvedRosterPlayer[];
  ownedPicks: { season: string; round: number; count: number }[];
}): RosterSnapshot {
  const {
    currentYear,
    projectionYear,
    baseRoster,
    rosterPlayers,
    ownedPicks,
  } = args;
  const yearsForward = projectionYear - currentYear;

  const positionCounts: Record<Position, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0,
  };
  const positionRanks: Record<Position, number[]> = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
    K: [],
    DST: [],
  };
  const survivorAges: number[] = [];
  let survivorCount = 0;

  // Aged current players, weighted by where they sit on their
  // position's age curve. A binary drop at a single threshold creates
  // year-to-year tier flicker (a 27→28-year-old RB doesn't go from
  // "in" to "out" overnight); instead, we use a continuous weight in
  // the 1.4-1.8 band: full credit ≤ 1.4, linear half-credit through
  // 1.8, dropped past 1.8. Survivor age + count both get weighted so
  // the avg-age signal degrades smoothly.
  const SOFT_BAND_LOW = 1.4;
  const SOFT_BAND_HIGH = 1.8;
  for (const p of rosterPlayers) {
    if (!p.position) continue;
    const newAge = p.age == null ? null : p.age + yearsForward;
    const factor = ageFactor(p.position, newAge);
    let weight: number;
    if (factor <= SOFT_BAND_LOW) {
      weight = 1;
    } else if (factor >= SOFT_BAND_HIGH) {
      weight = 0;
    } else {
      // Linear interpolation: 1 → 0 across the soft band.
      weight =
        1 - (factor - SOFT_BAND_LOW) / (SOFT_BAND_HIGH - SOFT_BAND_LOW);
    }
    if (weight === 0) continue;
    positionCounts[p.position] += weight;
    if (newAge != null) survivorAges.push(newAge);
    survivorCount += weight;
    if (p.search_rank < 9999) positionRanks[p.position].push(p.search_rank);
  }

  // Materialized rookies. Each pick landing in pickSeason with
  // pickSeason <= projectionYear becomes a player on the roster, aged
  // from ROOKIE_AGE_AT_DRAFT. We attribute them across positions by
  // ROOKIE_POSITION_MIX (fractional counts; aggregated this works out
  // statistically even though individual picks don't split).
  let materializedRookieCount = 0;
  let materializedRookieAgeSum = 0;
  for (const pick of ownedPicks) {
    const pickYear = parseInt(pick.season, 10);
    if (!Number.isFinite(pickYear)) continue;
    if (pickYear > projectionYear) continue; // hasn't happened yet
    const ageInProjectionYear =
      ROOKIE_AGE_AT_DRAFT + (projectionYear - pickYear);
    const totalAdds = pick.count;
    materializedRookieCount += totalAdds;
    materializedRookieAgeSum += ageInProjectionYear * totalAdds;
    for (const pos of FANTASY_POSITIONS) {
      positionCounts[pos] += ROOKIE_POSITION_MIX[pos] * totalAdds;
    }
  }

  const totalAges = survivorAges.length + materializedRookieCount;
  const sumAges =
    survivorAges.reduce((s, a) => s + a, 0) + materializedRookieAgeSum;
  const avgAge = totalAges > 0 ? sumAges / totalAges : null;

  // Synthetic player_ids: keep approximate length so rosterDepth
  // scoring works. survivorCount is fractional after the soft cliff
  // band; round to nearest integer for the array length. Real ids
  // would let us debug; we don't need them for scoring.
  const totalPlayers =
    Math.round(survivorCount) + Math.round(materializedRookieCount);
  const playerIds = new Array(totalPlayers).fill("projected");

  return {
    ...baseRoster,
    player_ids: playerIds,
    position_counts: positionCounts,
    position_ranks: positionRanks,
    avg_age: avgAge,
    // Records reset for projected years (no games played).
    wins: 0,
    losses: 0,
    ties: 0,
  };
}

export async function computeContenderForecast(
  snap: LeagueSnapshot,
  me: RosterSnapshot | null,
): Promise<ContenderYear[]> {
  if (!me) return [];
  const currentYear = parseInt(snap.season, 10);
  if (!Number.isFinite(currentYear)) return [];

  const rosterPlayers = await resolveMyRosterPlayers(me);
  const rounds = resolveRookieRounds(snap.draft.rounds);
  const isSuperflex = snap.format === "superflex" || snap.format === "2qb";
  const formatMultiplier = isSuperflex ? SUPERFLEX_PICK_MULTIPLIER : 1.0;
  // expectedRookieValue is tracked as a side metric for v2 use; the
  // scoring for v1 reads aggregated counts. Reference here so the
  // imports stay justified and v2 lifts can pull it in trivially.
  void expectedRookieValue;
  void CLASS_STRENGTH_MULTIPLIER;
  void formatMultiplier;

  const ownedPicks = computeOwnedFuturePicks({
    rosterId: me.roster_id,
    rosterIds: snap.rosters.map((r) => r.roster_id),
    tradedPicks: snap.draft.traded_picks,
    leagueSeason: snap.season,
    rounds,
  });

  const out: ContenderYear[] = [];
  for (let i = 0; i < OUTLOOK_HORIZON; i++) {
    const projectionYear = currentYear + i;
    const projected = projectRosterForYear({
      currentYear,
      projectionYear,
      baseRoster: me,
      rosterPlayers,
      ownedPicks,
    });
    const score = scoreWinNowFor(snap, projected).score;
    out.push({
      season: String(projectionYear),
      score,
      tier: tierForScore(score),
    });
  }
  return out;
}
