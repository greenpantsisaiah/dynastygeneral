/**
 * Player-suggestion enrichment. Walks ranked archetypes, picker
 * predictions, and the user's pick approach, and bolts on the named
 * players that fit each context.
 *
 * Three flavors of suggestion:
 *
 *   - Per archetype (Live Strategy Board): top 2-3 available players
 *     at the path's primary position. Reason is roster-fit framed.
 *
 *   - Per upcoming picker (Pick Approach): top 1-2 available players
 *     at each predicted position. No reason needed; the picker's own
 *     reasons explain WHY that position.
 *
 *   - For the user at their pick (Pick Approach): top 3-5 best
 *     available players, prioritized by roster need + age fit to the
 *     user's working-toward archetype if any. Reason is a 1-liner.
 *
 * Source of player ordering: Sleeper search_rank. Coarse but free.
 * Replace with KTC/dynasty-specific rankings when the data lands.
 */

import type {
  ArchetypeCandidate,
  Position,
  RankedArchetype,
} from "../archetypes/schema";
import type { LeagueSnapshot } from "../league-state/snapshot";
import type {
  LikelyPlayer,
  PickApproach,
  PickerPrediction,
  PlayerSuggestion,
} from "../pick-approach/types";
import {
  getAvailablePlayers,
  topAvailableAtPosition,
  type AvailablePlayer,
} from "@/lib/players/available";

// Map an archetype id/category → primary position(s) it leans on.
// This is the same logic predict.ts uses for surviving targets,
// extracted so both consumers stay in sync.
function inferPrimaryPosition(
  archetypeId: string,
  category: string,
): Position | null {
  if (archetypeId.startsWith("qb-") || category === "Positional Leverage")
    return "QB";
  if (archetypeId.startsWith("wr-") || category === "WR Strategy") return "WR";
  if (archetypeId.startsWith("rb-") || category === "RB Strategy") return "RB";
  if (archetypeId.startsWith("te-") || category === "TE Strategy") return "TE";
  return null;
}

function reasonForArchetype(
  player: AvailablePlayer,
  archetype: RankedArchetype["archetype"],
): string {
  const horizon = archetype.horizon;
  if (player.age == null) {
    return `Best available ${player.position} (rank ${player.search_rank})`;
  }
  if (horizon >= 40 && player.age >= 28) {
    return `Age ${player.age}, fits this win-now build`;
  }
  if (horizon <= -40 && player.age <= 24) {
    return `Age ${player.age}, fits this rebuild window`;
  }
  if (horizon >= 40 && player.age <= 23) {
    return `Age ${player.age}, young; safer if your other win-now bets land`;
  }
  if (horizon <= -40 && player.age >= 28) {
    return `Age ${player.age}, ages out before the rebuild matures`;
  }
  return `Age ${player.age}, ${player.team ?? "FA"}`;
}

export async function getAvailableForRequest(
  snap: LeagueSnapshot,
): Promise<AvailablePlayer[]> {
  // Single fetch per request. Callers pass this into both enrichment
  // helpers below to avoid hitting the player cache twice.
  return getAvailablePlayers(snap, { limit: 200 });
}

export function enrichRankedWithCandidates(
  ranked: RankedArchetype[],
  available: AvailablePlayer[],
  perCard = 3,
): RankedArchetype[] {
  return ranked.map((r) => {
    const pos = inferPrimaryPosition(r.archetype.id, r.archetype.category);
    if (!pos) return r;
    const players = topAvailableAtPosition(available, pos, perCard);
    if (players.length === 0) return r;
    const top_candidates: ArchetypeCandidate[] = players.map((p) => ({
      player_id: p.id,
      name: p.name,
      position: p.position,
      team: p.team,
      age: p.age,
      search_rank: p.search_rank,
      adp: p.adp,
      is_rookie: p.is_rookie,
      reason: reasonForArchetype(p, r.archetype),
    }));
    return { ...r, top_candidates };
  });
}

function suggestionReason(args: {
  player: AvailablePlayer;
  myShortages: Position[];
  workingTowardHorizon: number | null;
}): string {
  const { player, myShortages, workingTowardHorizon: horizon } = args;
  const pos = (player.position ?? "").toUpperCase();
  if (myShortages.includes(pos as Position)) {
    return `Fills your ${pos} shortage. best available at the position.`;
  }
  if (horizon != null) {
    if (horizon >= 40 && player.age != null && player.age >= 27) {
      return `Aging vet (${player.age}). fits your win-now lean.`;
    }
    if (horizon <= -40 && player.age != null && player.age <= 23) {
      return `Young (${player.age}). fits your rebuild window.`;
    }
  }
  if (player.age != null && player.age <= 23) {
    return `Young upside, ${pos}-${player.team ?? "FA"} (age ${player.age}).`;
  }
  return `Best available, ${pos}-${player.team ?? "FA"} (rank ${player.search_rank}).`;
}

// Reorder candidate players by posture lean. Adds a small dynasty-
// rank bonus (-15) to age-aligned players so they outrank slightly
// higher-ranked names that don't fit the posture. Magnitude is
// modest: a clearly better player still wins. This is a tiebreaker
// dressed up as a sort.
function reorderByPosture(
  players: AvailablePlayer[],
  lean: "young" | "veteran" | "balanced",
): AvailablePlayer[] {
  if (lean === "balanced") return players;
  return [...players].sort((a, b) => {
    const aBonus = postureBonus(a, lean);
    const bBonus = postureBonus(b, lean);
    return a.dynasty_rank + aBonus - (b.dynasty_rank + bBonus);
  });
}

function postureBonus(
  p: AvailablePlayer,
  lean: "young" | "veteran",
): number {
  if (p.age == null) return 0;
  if (lean === "young" && p.age <= 23) return -15;
  if (lean === "young" && p.age >= 28) return 5;
  if (lean === "veteran" && p.age >= 27) return -15;
  if (lean === "veteran" && p.age <= 23) return 5;
  return 0;
}

export function enrichPickApproachWithCandidates(
  approach: PickApproach,
  available: AvailablePlayer[],
  snap: LeagueSnapshot,
  ranked: RankedArchetype[],
): PickApproach {
  // Enrich each upcoming picker with top players at their predicted
  // position. The picker's posture (young vs veteran lean) shapes
  // WHICH names surface within the position. A youth-leaning rebuild
  // team gets young-skewing options; a vet-leaning win-now team gets
  // aging-but-productive options. Falls back to pure search_rank for
  // balanced postures.
  const upcoming_pickers: PickerPrediction[] = approach.upcoming_pickers.map(
    (picker) => ({
      ...picker,
      candidates: picker.candidates.map((c) => {
        // Pull a wider window (5) and re-sort by posture lean before
        // taking top 2. Wider initial window prevents the lean from
        // surfacing a clearly-worse player just to match age vibe.
        const wide = topAvailableAtPosition(available, c.position, 5);
        if (wide.length === 0) return c;
        const reordered = reorderByPosture(wide, picker.posture.lean);
        const likely_players: LikelyPlayer[] = reordered
          .slice(0, 2)
          .map((p) => ({
            player_id: p.id,
            name: p.name,
            position: p.position,
            team: p.team,
            age: p.age,
            search_rank: p.search_rank,
            adp: p.adp,
            is_rookie: p.is_rookie,
          }));
        return { ...c, likely_players };
      }),
    }),
  );

  // Build top_suggestions for the user.
  const me = snap.rosters.find((r) => r.is_me);
  const myShortages: Position[] = [];
  if (me) {
    // Source of truth: snapshot.starter_slots.hard (parsed from the
    // league's roster_positions). Kills the "WR 2/3 phantom need"
    // bug in formats that use hard WR=2 + FLEX slots.
    const reqs = snap.starter_slots.hard;
    for (const pos of ["QB", "RB", "WR", "TE"] as Position[]) {
      if (reqs[pos] > 0 && me.position_counts[pos] < reqs[pos]) {
        myShortages.push(pos);
      }
    }
  }
  // Working-toward horizon: leading ranked archetype is the best proxy
  // for "what the user is building toward right now."
  const workingTowardHorizon = ranked[0]?.archetype.horizon ?? null;

  // Suggestion ordering: shortage-fillers first (they get a -200 boost
  // in effective rank), then dynasty_rank. Keeps "you have 0 RB"
  // visually above "best WR" even if the WR has a better dynasty rank.
  const scored = available.slice(0, 60).map((p) => {
    const pos = (p.position ?? "").toUpperCase();
    const shortageBoost = myShortages.includes(pos as Position) ? -200 : 0;
    return { p, score: p.dynasty_rank + shortageBoost };
  });
  scored.sort((a, b) => a.score - b.score);
  const top_suggestions: PlayerSuggestion[] = scored
    .slice(0, 5)
    .map(({ p }) => ({
      player_id: p.id,
      name: p.name,
      position: p.position,
      team: p.team,
      age: p.age,
      search_rank: p.search_rank,
      adp: p.adp,
      is_rookie: p.is_rookie,
      reason: suggestionReason({
        player: p,
        myShortages,
        workingTowardHorizon,
      }),
    }));

  return {
    ...approach,
    upcoming_pickers,
    top_suggestions,
  };
}
