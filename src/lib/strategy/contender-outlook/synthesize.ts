/**
 * Contender outlook synthesizer. Takes the per-year forecast + the
 * snapshot and produces the TAKE paragraph + protect-the-window
 * bullets the card renders. Pure derivation; no LLM, no async work.
 *
 * The TAKE pattern depends on trajectory shape:
 *   all-rebuild      no contender window in horizon, framing is honest
 *   rising-to-peak   the killer dynasty bet (e.g. user's case)
 *   all-contender    sustained contention, depth/aging risk framing
 *   bubble-plateau   single-trade-decides-it framing
 *
 * Protect bullets pull from owned picks (named opponent sources where
 * possible) and the projected roster shape (age band, position gaps).
 */

import {
  CLASS_STRENGTH_MULTIPLIER,
  DEFAULT_ROOKIE_ROUNDS,
  SUPERFLEX_PICK_MULTIPLIER,
  computeOwnedFuturePicks,
  totalFuturePickValue,
  type OwnedPick,
} from "@/lib/players/future-picks";
import type {
  LeagueSnapshot,
  RosterSnapshot,
} from "../league-state/snapshot";
import type { ContenderOutlook, ContenderYear } from "./types";

type TrajectoryShape =
  | "all-rebuild"
  | "rising-to-peak"
  | "all-contender"
  | "bubble-plateau"
  | "declining";

function classifyTrajectory(years: ContenderYear[]): TrajectoryShape {
  if (years.length === 0) return "all-rebuild";
  const tiers = years.map((y) => y.tier);
  const allRebuild = tiers.every((t) => t === "rebuild");
  if (allRebuild) return "all-rebuild";
  const allContender = tiers.every((t) => t === "contender");
  if (allContender) return "all-contender";
  const firstScore = years[0].score;
  const peakScore = Math.max(...years.map((y) => y.score));
  const lastScore = years[years.length - 1].score;
  if (peakScore - firstScore > 15 && peakScore >= 70) return "rising-to-peak";
  if (firstScore - lastScore > 15) return "declining";
  return "bubble-plateau";
}

function contenderRange(years: ContenderYear[]): {
  first: string | null;
  last: string | null;
} {
  const contenders = years.filter((y) => y.tier === "contender");
  if (contenders.length === 0) return { first: null, last: null };
  return {
    first: contenders[0].season,
    last: contenders[contenders.length - 1].season,
  };
}

function buildTake(
  shape: TrajectoryShape,
  years: ContenderYear[],
  picks: OwnedPick[],
  me: RosterSnapshot | null,
): string {
  const r1Count = picks
    .filter((p) => p.round === 1)
    .reduce((s, p) => s + p.count, 0);
  const earliestR1Year =
    picks
      .filter((p) => p.round === 1)
      .map((p) => p.season)
      .sort()[0] ?? null;
  const avgAge = me?.avg_age ?? null;
  const range = contenderRange(years);

  switch (shape) {
    case "all-rebuild":
      return `No contender window in the next ${years.length} seasons on this trajectory. The build needs more pick capital or younger talent acquired now to surface a peak by ${years[years.length - 1]?.season ?? ""}.`;
    case "rising-to-peak": {
      const lever =
        r1Count >= 3 && earliestR1Year
          ? `${r1Count}× ${earliestR1Year} R1s landing into a young roster${avgAge ? ` (avg age ${avgAge.toFixed(1)})` : ""}`
          : "your young roster aging into prime";
      const yearsClause =
        range.first && range.last && range.first !== range.last
          ? `${range.first} through ${range.last}`
          : range.first ?? "the back half of the horizon";
      return `Your contender window is ${yearsClause}. The lever: ${lever} sets up a multi-year peak. ${years[0].season} is not a contender year and you should not trade your way into trying.`;
    }
    case "all-contender": {
      return `Active contender across the ${years.length}-year horizon. Risk: depth and aging key starters. Plan now for the year ${years[years.length - 1]?.season ?? ""} drop-off when current core ages into decline.`;
    }
    case "declining": {
      return `Contender now, declining through ${years[years.length - 1]?.season ?? ""}. The roster's prime window is closing. Either push hard for ${years[0].season}, or pivot capital toward future picks before the drop hits.`;
    }
    case "bubble-plateau":
    default:
      return `Bubble team across the horizon. One trade lifts you (acquire a vet starter age 25-28); one trade sinks you (sell rookie picks for marginal current production). The window is in your hands.`;
  }
}

function uniqueSorted(strings: string[]): string[] {
  return Array.from(new Set(strings)).sort();
}

function buildProtectBullets(
  shape: TrajectoryShape,
  years: ContenderYear[],
  picks: OwnedPick[],
  ownerNamesByPickKey: Map<string, string[]>,
  me: RosterSnapshot | null,
): string[] {
  const out: string[] = [];
  const range = contenderRange(years);
  const peakYear = years.reduce(
    (best, y) => (y.score > best.score ? y : best),
    years[0] ?? { score: 0, season: "", tier: "rebuild" as const },
  );

  // Bullet 1: future R1s the user owns (with named sources where we have them)
  const r1Picks = picks.filter((p) => p.round === 1);
  if (r1Picks.length > 0) {
    const earliestR1Year = r1Picks.map((p) => p.season).sort()[0];
    const sources: string[] = [];
    for (const p of r1Picks) {
      const owners =
        ownerNamesByPickKey.get(`${p.season}:${p.round}`) ?? [];
      sources.push(...owners);
    }
    const uniqueSources = uniqueSorted(sources).slice(0, 3);
    const sourceClause =
      uniqueSources.length > 0 ? ` (${uniqueSources.join(", ")})` : "";
    out.push(
      `Hold the ${earliestR1Year} R1s${sourceClause}; they fund the ${range.first ?? peakYear.season} window`,
    );
  }

  // Bullet 2: avoid old vet acquisitions if the peak is 2+ years out
  if (range.first) {
    const peakYearNum = parseInt(range.first, 10);
    const currentYearNum = parseInt(years[0]?.season ?? "0", 10);
    if (
      Number.isFinite(peakYearNum) &&
      Number.isFinite(currentYearNum) &&
      peakYearNum - currentYearNum >= 2
    ) {
      out.push(
        `Avoid age-30+ acquisitions; they won't be on the field in ${range.first}`,
      );
    }
  }

  // Bullet 3: bridge starter recommendation if there's a multi-year window
  if (range.first && range.last && range.first !== range.last) {
    out.push(
      `One vet starter age 23-25 plays through the entire ${range.first}-${range.last} window`,
    );
  }

  // Bullet 4 (rebuild only): need more capital
  if (shape === "all-rebuild" && r1Picks.length < 3) {
    out.push(
      `Acquire more future R1s; the projected roster lacks the talent base to peak in this horizon`,
    );
  }

  // Bullet 5 (declining): pivot to picks
  if (shape === "declining") {
    out.push(
      `Sell aging starters into the window before their value collapses`,
    );
  }

  // Bullet 6 (bubble): the lever framing
  if (shape === "bubble-plateau" && me) {
    out.push(
      `One vet WR1/RB1 trade decides whether the bubble breaks toward contender`,
    );
  }

  return out.slice(0, 3);
}

/**
 * Build a `(season, round) -> ownerName[]` map for picks the user
 * acquired via trade. Lets the protect-bullets cite the original pick
 * holders by name (e.g., "the 2027 R1 from Sweat91"). Picks the user
 * holds via default ownership are NOT in this map.
 */
function buildOwnerNameLookup(snap: LeagueSnapshot): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const myRosterId = snap.my_roster_id;
  if (myRosterId == null) return out;
  const nameByRosterId = new Map<number, string>();
  for (const r of snap.rosters) {
    if (r.owner_name) nameByRosterId.set(r.roster_id, r.owner_name);
  }
  for (const t of snap.draft.traded_picks) {
    if (t.current_owner !== myRosterId) continue;
    if (t.original_owner === myRosterId) continue;
    const key = `${t.season}:${t.round}`;
    const name = nameByRosterId.get(t.original_owner);
    if (!name) continue;
    const existing = out.get(key) ?? [];
    existing.push(name);
    out.set(key, existing);
  }
  return out;
}

export function synthesizeContenderOutlook(args: {
  years: ContenderYear[];
  snap: LeagueSnapshot;
  me: RosterSnapshot | null;
}): ContenderOutlook {
  const { years, snap, me } = args;
  const rounds =
    snap.draft.rounds > 0 ? snap.draft.rounds : DEFAULT_ROOKIE_ROUNDS;
  const isSuperflex = snap.format === "superflex" || snap.format === "2qb";
  const formatMultiplier = isSuperflex ? SUPERFLEX_PICK_MULTIPLIER : 1.0;
  void totalFuturePickValue;
  void CLASS_STRENGTH_MULTIPLIER;
  void formatMultiplier;

  const picks = me
    ? computeOwnedFuturePicks({
        rosterId: me.roster_id,
        rosterIds: snap.rosters.map((r) => r.roster_id),
        tradedPicks: snap.draft.traded_picks,
        leagueSeason: snap.season,
        rounds,
      })
    : [];
  const ownerNames = buildOwnerNameLookup(snap);
  const shape = classifyTrajectory(years);
  const take = buildTake(shape, years, picks, me);
  const protect_bullets = buildProtectBullets(
    shape,
    years,
    picks,
    ownerNames,
    me,
  );

  return { years, take, protect_bullets };
}
