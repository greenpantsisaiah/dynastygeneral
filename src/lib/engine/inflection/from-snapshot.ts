/**
 * Build a list of InflectionContexts for the user's roster players
 * directly from a LeagueSnapshot. Used by the hub server component
 * to surface bifurcations without going through assembleContext
 * (which is designed for LLM context assembly and re-fetches).
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import { humanize, type HumanPlayer } from "@/lib/players/cache";
import type { SleeperPlayer } from "@/lib/sleeper/schemas";
import type { PlayerSeasonStats } from "@/lib/players/season-stats";
import { resolveInflections } from "./index";
import {
  resolveEnrichedPlayers,
  type EnrichedPlayerOptions,
} from "@/lib/players/enriched-player";
import type { InflectionContext } from "./types";

export async function buildInflectionsFromSnapshot(args: {
  snap: LeagueSnapshot;
  playersMap: Map<string, SleeperPlayer>;
  // Prior-season + season-before usage maps (Sleeper /stats, keyed by
  // Sleeper player_id). When supplied, the inflection model's
  // workload-trend signal fires off real carries/targets instead of
  // rendering data_missing. Optional so callers without stats (or the
  // deferred decision pipeline) degrade gracefully.
  prevSeasonStats?: Map<string, PlayerSeasonStats>;
  prevPrevSeasonStats?: Map<string, PlayerSeasonStats>;
  // Career carries + targets per Sleeper player_id (getCareerUsage).
  // Feeds the RB mileage signal + the >=1500-carry cliff trigger. When
  // absent, the mileage signal renders data_missing (graceful).
  careerUsage?: Map<string, { carries: number; targets: number }>;
  // NFL overall draft pick per Sleeper player_id, from
  // `player_signals.draft_pick_no` via the canonical `getDraftPickMap`.
  // Lights up the rookie-debut card's "Draft capital" signal (Phase 3b);
  // null entries degrade gracefully to data_missing.
  draftPickByPlayerId?: Map<string, number>;
  // Optional pre-fetched canonical maps. The resolver itself short-
  // circuits to the 24h cache in production; tests pass empty Maps
  // to avoid the Supabase env-var requirement.
  playerSignalsMap?: EnrichedPlayerOptions["playerSignalsMap"];
  teamSignalsMap?: EnrichedPlayerOptions["teamSignalsMap"];
  playerHealthMap?: EnrichedPlayerOptions["playerHealthMap"];
}): Promise<InflectionContext[]> {
  const {
    snap,
    playersMap,
    prevSeasonStats,
    prevPrevSeasonStats,
    careerUsage,
    draftPickByPlayerId,
    playerSignalsMap,
    teamSignalsMap,
    playerHealthMap,
  } = args;
  const myRoster = snap.rosters.find((r) => r.is_me);
  if (!myRoster) return [];

  // League-wide rostered humans become the resolver's roster context
  // (drives same-team-same-position for successor / position-room
  // signals: a rookie RB on the same NFL team but on another fantasy
  // roster is still a successor signal).
  const allHumans: HumanPlayer[] = [];
  for (const r of snap.rosters) {
    for (const id of r.player_ids ?? []) {
      const sp = playersMap.get(id);
      if (sp) allHumans.push(humanize(sp));
    }
  }

  // Resolve the user's roster through the canonical EnrichedPlayer
  // pipeline. The resolver builds inflection_inputs with the full
  // 10-arg payload (prev-season usage + opportunity + career mileage +
  // draft capital + compounding-news), closing the audit's Leak 4.
  // When the caller did not provide a draftPickByPlayerId, default to
  // an empty map so the resolver does not fetch a second copy of the
  // canonical (the hub passes its own; tests pass empty).
  const myIds = myRoster.player_ids ?? [];
  if (myIds.length === 0) return [];
  const enrichedByPlayerId = await resolveEnrichedPlayers({
    playerIds: myIds,
    playersMap,
    prevSeasonStats,
    prevPrevSeasonStats,
    careerUsage,
    draftPickByPlayerId: draftPickByPlayerId ?? new Map(),
    rosterContext: allHumans,
    playerSignalsMap,
    teamSignalsMap,
    playerHealthMap,
  });

  const out: InflectionContext[] = [];
  for (const id of myIds) {
    const enriched = enrichedByPlayerId.get(id);
    if (!enriched?.inflection_inputs) continue;
    const resolved = resolveInflections(enriched.inflection_inputs);
    if (resolved) out.push(resolved);
  }
  return out;
}

/**
 * True when the user's roster holds an RB old enough for career mileage
 * to matter (the 28+ aging cliff, plus 26-27 bellcows who can hit the
 * secondary >=1500-carry trigger). Callers use this to gate the
 * getCareerUsage multi-season fetch: skip it entirely when no aging RB
 * is present, so non-RB-heavy rosters never pay the cold-start cost.
 */
export function rosterHasAgingRb(
  snap: LeagueSnapshot,
  playersMap: Map<string, SleeperPlayer>,
): boolean {
  const me = snap.rosters.find((r) => r.is_me);
  if (!me) return false;
  for (const id of me.player_ids ?? []) {
    const sp = playersMap.get(id);
    if (!sp) continue;
    if ((sp.position ?? "").toUpperCase() !== "RB") continue;
    if (typeof sp.age === "number" && sp.age >= 26) return true;
  }
  return false;
}
