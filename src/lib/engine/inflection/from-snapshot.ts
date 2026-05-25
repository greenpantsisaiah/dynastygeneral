/**
 * Build a list of InflectionContexts for the user's roster players
 * directly from a LeagueSnapshot. Used by the hub server component
 * to surface bifurcations without going through assembleContext
 * (which is designed for LLM context assembly and re-fetches).
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type { Position } from "@/lib/strategy/archetypes/schema";
import { humanize, type HumanPlayer } from "@/lib/players/cache";
import type { SleeperPlayer } from "@/lib/sleeper/schemas";
import {
  buildOpportunityProfile,
  type PlayerSeasonStats,
} from "@/lib/players/season-stats";
import { resolveInflections } from "./index";
import { buildInflectionInputsFromHumanPlayer } from "./build-inputs";
import type { InflectionContext } from "./types";

export function buildInflectionsFromSnapshot(args: {
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
}): InflectionContext[] {
  const { snap, playersMap, prevSeasonStats, prevPrevSeasonStats, careerUsage } =
    args;
  const myRoster = snap.rosters.find((r) => r.is_me);
  if (!myRoster) return [];

  // Group all rostered players (across the league) by team+position so
  // the successor / position-room saturation signals fire correctly:
  // a rookie RB on the same NFL team but on another fantasy roster is
  // still a successor signal.
  const allHumans: HumanPlayer[] = [];
  for (const r of snap.rosters) {
    for (const id of r.player_ids ?? []) {
      const sp = playersMap.get(id);
      if (sp) allHumans.push(humanize(sp));
    }
  }
  const teamPosIndex = new Map<string, HumanPlayer[]>();
  for (const p of allHumans) {
    if (!p.team || !p.position) continue;
    const key = `${p.team}:${p.position.toUpperCase()}`;
    const arr = teamPosIndex.get(key) ?? [];
    arr.push(p);
    teamPosIndex.set(key, arr);
  }

  const out: InflectionContext[] = [];
  for (const id of myRoster.player_ids ?? []) {
    const sp = playersMap.get(id);
    if (!sp) continue;
    const player = humanize(sp);
    if (!player.team || !player.position) continue;
    const positionRaw = (player.position ?? "").toUpperCase() as Position;
    if (
      positionRaw !== "QB" &&
      positionRaw !== "RB" &&
      positionRaw !== "WR" &&
      positionRaw !== "TE"
    ) {
      continue;
    }
    const key = `${player.team}:${positionRaw}`;
    const sameTeamSamePosition = (teamPosIndex.get(key) ?? []).filter(
      (p) => p.id !== player.id,
    );
    const prevStat = prevSeasonStats?.get(player.id);
    const prevPrevStat = prevPrevSeasonStats?.get(player.id);
    const career = careerUsage?.get(player.id);
    // Canonical opportunity read from the SAME stats maps (no extra
    // fetch). Null when the player had no row that season so the
    // opportunity signal degrades to data_missing gracefully.
    const inputs = buildInflectionInputsFromHumanPlayer({
      player,
      sameTeamSamePosition,
      prevSeasonCarries: prevStat?.carries ?? null,
      prevSeasonTargets: prevStat?.targets ?? null,
      prevPrevSeasonCarries: prevPrevStat?.carries ?? null,
      prevPrevSeasonTargets: prevPrevStat?.targets ?? null,
      prevSeasonOpportunity: prevStat ? buildOpportunityProfile(prevStat) : null,
      prevPrevSeasonOpportunity: prevPrevStat
        ? buildOpportunityProfile(prevPrevStat)
        : null,
      careerCarries: career?.carries ?? null,
      careerTargets: career?.targets ?? null,
    });
    if (!inputs) continue;
    const resolved = resolveInflections(inputs);
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
