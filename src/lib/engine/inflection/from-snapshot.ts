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
import { resolveInflections } from "./index";
import { buildInflectionInputsFromHumanPlayer } from "./build-inputs";
import type { InflectionContext } from "./types";

export function buildInflectionsFromSnapshot(args: {
  snap: LeagueSnapshot;
  playersMap: Map<string, SleeperPlayer>;
}): InflectionContext[] {
  const { snap, playersMap } = args;
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
    const inputs = buildInflectionInputsFromHumanPlayer({
      player,
      sameTeamSamePosition,
    });
    if (!inputs) continue;
    const resolved = resolveInflections(inputs);
    if (resolved) out.push(resolved);
  }
  return out;
}
