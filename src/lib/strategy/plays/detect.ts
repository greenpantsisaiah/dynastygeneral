/**
 * Play detection. Given the current winner candidate and the
 * available pool, identify which plays from the library the pick
 * enables.
 *
 * Detection is intentionally hardcoded per archetype for Phase 1.
 * No LLM in the loop here; the engine surfaces structured plays the
 * UI can render, commit, and discipline against deterministically.
 * Coach will eventually be primed on the play library and able to
 * discuss custom plays, but that's Phase 2+.
 */

import type { LeagueSnapshot } from "../league-state/snapshot";
import type { AvailablePlayer } from "@/lib/players/available";
import type { Position } from "../archetypes/schema";
import type { Play, PlayPlayerRef } from "./types";

const STARTING_QB_KTC_RANK_CAP = 24;
const ELITE_RB_KTC_RANK_CAP = 12;
const STACK_FOLLOWTHROUGH_PICKS = 4;
const HANDCUFF_FOLLOWTHROUGH_PICKS = 4;
const BRIDGE_QB_FOLLOWTHROUGH_PICKS = 6;
const STACK_PARTNER_CANDIDATES = 3;
const HANDCUFF_CANDIDATES = 2;
const BRIDGE_DEV_QB_CANDIDATES = 3;

function toPlayPlayerRef(p: AvailablePlayer): PlayPlayerRef | null {
  const pos = (p.position ?? "").toUpperCase() as Position;
  if (!["QB", "RB", "WR", "TE"].includes(pos)) return null;
  return {
    player_id: p.id,
    name: p.name,
    position: pos,
    team: p.team,
  };
}

function sortByKtcValue(
  players: AvailablePlayer[],
  ktcValues: Record<string, number>,
): AvailablePlayer[] {
  return [...players].sort((a, b) => {
    const va = ktcValues[a.id] ?? 0;
    const vb = ktcValues[b.id] ?? 0;
    return vb - va;
  });
}

/**
 * QB-WR Stack. Triggered by a starting-tier QB pick. Looks for the
 * QB's team's top skill players (WR / TE) in the available pool.
 *
 * Why this is the dynasty meta: QB TD share correlates with WR/TE
 * TD share. Stacking the offense banks correlated upside in the
 * weeks the QB hits (matchup, weather, defense) AND insulates
 * across multi-year coaching changes (offensive coordinator carries
 * QB-stack thinking).
 */
function detectQbWrStack(args: {
  winner: AvailablePlayer;
  winnerPos: Position;
  available: AvailablePlayer[];
  ktcValues: Record<string, number>;
  winnerKtcRank: number;
}): Play | null {
  if (args.winnerPos !== "QB") return null;
  if (!args.winner.team) return null;
  if (args.winnerKtcRank > STARTING_QB_KTC_RANK_CAP) return null;

  const sameTeamSkill = args.available.filter((p) => {
    if (p.id === args.winner.id) return false;
    if (p.team !== args.winner.team) return false;
    const pos = (p.position ?? "").toUpperCase();
    return pos === "WR" || pos === "TE";
  });
  if (sameTeamSkill.length === 0) return null;

  const sortedPartners = sortByKtcValue(sameTeamSkill, args.ktcValues).slice(
    0,
    STACK_PARTNER_CANDIDATES,
  );
  const partnerRefs = sortedPartners
    .map(toPlayPlayerRef)
    .filter((r): r is PlayPlayerRef => r !== null);
  if (partnerRefs.length === 0) return null;

  const partnerNames = partnerRefs.map((r) => r.name);
  const playName = `${args.winner.name} + ${args.winner.team} Stack`;

  return {
    archetype: "qb_wr_stack",
    name: playName,
    primary_player: toPlayPlayerRef(args.winner)!,
    upside_thesis: `${args.winner.name}'s TD share runs through ${args.winner.team}'s pass-catchers. Stacking the offense banks correlated upside across the weeks ${args.winner.name} hits.`,
    followthrough: {
      description: `Take a ${args.winner.team} skill player in the next ${STACK_FOLLOWTHROUGH_PICKS} of your picks. Best partner${partnerNames.length === 1 ? "" : "s"}: ${partnerNames.join(", ")}.`,
      target_candidates: partnerRefs,
      picks_window: STACK_FOLLOWTHROUGH_PICKS,
    },
    genius_vs_average_line: `Genius if you stack a ${args.winner.team} pass-catcher in the next ${STACK_FOLLOWTHROUGH_PICKS} picks. Average QB2 otherwise.`,
  };
}

/**
 * Anchor RB + Handcuff. Triggered by an elite RB pick. Looks for the
 * same team's backup RB in the available pool. The handcuff converts
 * to a starter on injury and historically saves seasons.
 */
function detectAnchorHandcuff(args: {
  winner: AvailablePlayer;
  winnerPos: Position;
  available: AvailablePlayer[];
  ktcValues: Record<string, number>;
  winnerKtcRank: number;
}): Play | null {
  if (args.winnerPos !== "RB") return null;
  if (!args.winner.team) return null;
  if (args.winnerKtcRank > ELITE_RB_KTC_RANK_CAP) return null;

  const sameTeamRBs = args.available.filter((p) => {
    if (p.id === args.winner.id) return false;
    if (p.team !== args.winner.team) return false;
    const pos = (p.position ?? "").toUpperCase();
    return pos === "RB";
  });
  if (sameTeamRBs.length === 0) return null;

  const sortedHandcuffs = sortByKtcValue(sameTeamRBs, args.ktcValues).slice(
    0,
    HANDCUFF_CANDIDATES,
  );
  const handcuffRefs = sortedHandcuffs
    .map(toPlayPlayerRef)
    .filter((r): r is PlayPlayerRef => r !== null);
  if (handcuffRefs.length === 0) return null;

  const handcuffNames = handcuffRefs.map((r) => r.name);
  return {
    archetype: "anchor_handcuff",
    name: `${args.winner.name} + Handcuff`,
    primary_player: toPlayPlayerRef(args.winner)!,
    upside_thesis: `Top RBs go down. ${args.winner.team}'s backup converts to a startable RB on injury. Without the handcuff, you eat zero on that injury week and your season hinges on waivers.`,
    followthrough: {
      description: `Take ${handcuffNames.join(" or ")} in the next ${HANDCUFF_FOLLOWTHROUGH_PICKS} of your picks. If they all leave the board first, grab via FA immediately.`,
      target_candidates: handcuffRefs,
      picks_window: HANDCUFF_FOLLOWTHROUGH_PICKS,
    },
    genius_vs_average_line: `Genius if you lockdown ${handcuffNames[0]} in the next ${HANDCUFF_FOLLOWTHROUGH_PICKS} picks. One injury away from a season tank otherwise.`,
  };
}

/**
 * Bridge QB → Developmental QB. Triggered in SF / 2QB when the user
 * takes an aging starter. The play is the 2-year succession: bridge
 * gives you weeks now; the dev QB is the long-term QB1.
 */
function detectBridgeQb(args: {
  winner: AvailablePlayer;
  winnerPos: Position;
  available: AvailablePlayer[];
  ktcValues: Record<string, number>;
  isSuperflex: boolean;
}): Play | null {
  if (args.winnerPos !== "QB") return null;
  if (!args.isSuperflex) return null;
  const age = args.winner.age ?? 0;
  if (age < 30) return null;

  const devQbs = args.available.filter((p) => {
    if (p.id === args.winner.id) return false;
    const pos = (p.position ?? "").toUpperCase();
    if (pos !== "QB") return false;
    const pAge = p.age ?? 99;
    const yearsExp = p.yearsExp ?? 99;
    return p.is_rookie || pAge <= 24 || yearsExp <= 2;
  });
  if (devQbs.length === 0) return null;

  const sortedDevs = sortByKtcValue(devQbs, args.ktcValues).slice(
    0,
    BRIDGE_DEV_QB_CANDIDATES,
  );
  const devRefs = sortedDevs
    .map(toPlayPlayerRef)
    .filter((r): r is PlayPlayerRef => r !== null);
  if (devRefs.length === 0) return null;

  const devNames = devRefs.map((r) => r.name);
  return {
    archetype: "bridge_qb",
    name: `${args.winner.name} Bridge + Dev QB`,
    primary_player: toPlayPlayerRef(args.winner)!,
    upside_thesis: `${args.winner.name} starts now (age ${age}) but the runway is short. Pair him with a young developmental QB to inherit the SF QB1 slot when ${args.winner.name} retires or declines.`,
    followthrough: {
      description: `Take ${devNames.join(" or ")} in the next ${BRIDGE_QB_FOLLOWTHROUGH_PICKS} of your picks. Build the QB succession; do not get caught reaching for a rookie QB next offseason.`,
      target_candidates: devRefs,
      picks_window: BRIDGE_QB_FOLLOWTHROUGH_PICKS,
    },
    genius_vs_average_line: `Genius if you pair ${args.winner.name} with a young dev QB (${devNames[0]} is the top option). Bridge to nowhere otherwise.`,
  };
}

export type OwnedRosterPlayer = {
  id: string;
  name: string;
  position: Position;
  team: string | null;
  age: number | null;
  is_rookie: boolean;
  yearsExp: number;
};

/**
 * Suggest plays the engine sees as possible based on the user's
 * CURRENT roster (already-drafted players + active-draft picks).
 * Distinct from detectPlaysEnabledBy which only fires for the
 * immediate pick decision; this surface answers "what plays could /
 * should I be running right now given who I already have?"
 *
 * Founder direction 2026-05-20: "Identify what they could/should be,
 * help me commit to them."
 *
 * Filtering rules:
 *   - A suggestion fires for each owned player that, treated as the
 *     "trigger pick," activates a library archetype.
 *   - Suggestions whose follow-through targets are already on the
 *     user's roster get filtered out (play implicitly executed).
 *   - Dedupe by (archetype, primary_player_id) so the same play
 *     doesn't appear twice.
 */
export function suggestPlaysFromRoster(args: {
  snap: LeagueSnapshot;
  available: AvailablePlayer[];
  ktcValues: Record<string, number>;
  ownedPlayers: OwnedRosterPlayer[];
}): Play[] {
  if (args.ownedPlayers.length === 0) return [];

  const ownedIds = new Set(args.ownedPlayers.map((p) => p.id));
  const suggestions: Play[] = [];

  for (const player of args.ownedPlayers) {
    const winnerLike = {
      id: player.id,
      name: player.name,
      position: player.position,
      team: player.team,
      age: player.age,
      yearsExp: player.yearsExp,
      is_rookie: player.is_rookie,
      adp: null,
      adp_variant: null,
      search_rank: 100,
      dynasty_rank: 100,
    } as unknown as AvailablePlayer;
    const plays = detectPlaysEnabledBy({
      winner: winnerLike,
      snap: args.snap,
      available: [winnerLike, ...args.available],
      ktcValues: args.ktcValues,
    });
    suggestions.push(...plays);
  }

  // Dedupe by archetype + primary player.
  const seen = new Set<string>();
  const deduped: Play[] = [];
  for (const p of suggestions) {
    const key = `${p.archetype}:${p.primary_player.player_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
  }

  // Filter out plays whose follow-through is already on the roster.
  // If user owns Mayfield + Evans, "Mayfield + TB Stack" is already
  // executed and doesn't need to be surfaced.
  return deduped.filter(
    (p) =>
      !p.followthrough.target_candidates.some((t) => ownedIds.has(t.player_id)),
  );
}

/**
 * Detect all plays the winner candidate enables. Returns an empty
 * array when no plays apply. Order matters: the most-conditional play
 * (stack / handcuff) is listed before the more situational (bridge).
 */
export function detectPlaysEnabledBy(args: {
  winner: AvailablePlayer;
  snap: LeagueSnapshot;
  available: AvailablePlayer[];
  ktcValues: Record<string, number>;
}): Play[] {
  const winnerPos = (args.winner.position ?? "").toUpperCase() as Position;
  if (!["QB", "RB", "WR", "TE"].includes(winnerPos)) return [];

  // Compute winner's KTC rank in their position. Used as a gate for
  // "elite" / "starting-tier" thresholds.
  const samePosPool = args.available.filter(
    (p) =>
      (p.position ?? "").toUpperCase() === winnerPos &&
      typeof args.ktcValues[p.id] === "number",
  );
  const sortedByValue = sortByKtcValue(samePosPool, args.ktcValues);
  const winnerKtcRank = sortedByValue.findIndex((p) => p.id === args.winner.id);
  const effectiveRank = winnerKtcRank >= 0 ? winnerKtcRank + 1 : 999;

  const isSuperflex =
    args.snap.format === "superflex" || args.snap.format === "2qb";

  const plays: Play[] = [];
  const stack = detectQbWrStack({
    winner: args.winner,
    winnerPos,
    available: args.available,
    ktcValues: args.ktcValues,
    winnerKtcRank: effectiveRank,
  });
  if (stack) plays.push(stack);

  const handcuff = detectAnchorHandcuff({
    winner: args.winner,
    winnerPos,
    available: args.available,
    ktcValues: args.ktcValues,
    winnerKtcRank: effectiveRank,
  });
  if (handcuff) plays.push(handcuff);

  const bridge = detectBridgeQb({
    winner: args.winner,
    winnerPos,
    available: args.available,
    ktcValues: args.ktcValues,
    isSuperflex,
  });
  if (bridge) plays.push(bridge);

  return plays;
}
