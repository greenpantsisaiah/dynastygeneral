/**
 * Build a LeagueRead directly from a LeagueSnapshot.
 *
 * Used by the league hub server component to render the trade-strategy
 * panel without going through the full assembleContext (which is
 * designed for LLM context assembly and re-fetches Sleeper data).
 *
 * v1: simplified per-team labeling derived directly from
 * position_counts vs starter requirements. The Coach context goes
 * through assembleContext + buildLeagueProfile (the richer labeling
 * with strengths / pain_points / etc.); the hub panel only needs
 * the leverage-opportunity synthesis, which works fine off the
 * lightweight labels.
 */

import type { LeagueSnapshot, RosterSnapshot } from "@/lib/strategy/league-state/snapshot";
import type { Position } from "@/lib/strategy/archetypes/schema";
import type { LeagueProfile, TeamProfile } from "@/lib/engine/opponent";
import { buildFormatRulesFromSnapshot } from "@/lib/engine/llm-contract";
import { analyzeLeagueRead, type OpponentRosterSnapshot } from "./analyze";
import { analyzeOpponentPickQuality } from "./pick-quality";
import type { LeagueRead } from "./types";

export function buildLeagueReadFromSnapshot(args: {
  snap: LeagueSnapshot;
  // Optional: per-player-id KTC value (FantasyCalc-normalized 0-100).
  // When provided, the league-read can name specific opponent assets.
  // When omitted, falls back to generic "their best RB" prose.
  // overall_rank (when present) enables pick-quality / sophistication
  // analysis (took at pick N vs consensus rank R = delta).
  playerValueMap?: Map<string, { value: number; overall_rank?: number | null }>;
  // Optional: name lookup for player_id. When provided alongside
  // playerValueMap, opponent rosters can be enumerated with named
  // KTC-valued assets.
  playerNameLookup?: (id: string) => { name: string; position: string | null } | null;
}): LeagueRead {
  const { snap, playerValueMap, playerNameLookup } = args;

  const formatRules = buildFormatRulesFromSnapshot(snap);
  const starterReqs: Record<Position, number> = {
    QB: formatRules.qb_starters_max,
    RB: formatRules.rb_starters_max,
    WR: formatRules.wr_starters_max,
    TE: formatRules.te_starters_max,
    K: 0,
    DST: 0,
  };

  // Lightweight team profile: classify each team from position_counts
  // alone. Mirrors the labeling decisions in
  // buildLeagueProfile/labelTeam without re-running the full
  // strengths/pain-points analysis (which the hub panel does not need).
  const teams: TeamProfile[] = snap.rosters.map((r) =>
    lightweightTeamProfile(r, starterReqs, formatRules.is_superflex),
  );
  const profile: LeagueProfile = {
    teams,
    dynamics: {
      trade_counterparties: teams
        .filter(
          (t) =>
            t.label === "desperation" ||
            t.label === "qb_needy" ||
            t.label === "tilted_buyer",
        )
        .map((t) => t.roster_id),
      non_buyers: teams
        .filter((t) => t.label === "qb_stable" || t.label === "balanced")
        .map((t) => t.roster_id),
      tilted_buyers: teams.filter((t) => t.label === "tilted_buyer").map((t) => t.roster_id),
    },
  };

  // User position counts straight from the snapshot.
  const myRoster = snap.rosters.find((r) => r.is_me);
  const userPositionCounts: Record<Position, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0,
  };
  const userPlayerValuesByPosition: Record<
    Position,
    Array<{ player_id: string; player_name: string; value: number }>
  > = { QB: [], RB: [], WR: [], TE: [], K: [], DST: [] };
  if (myRoster) {
    for (const pos of ["QB", "RB", "WR", "TE", "K", "DST"] as Position[]) {
      userPositionCounts[pos] = myRoster.position_counts[pos] ?? 0;
    }
    if (playerValueMap && playerNameLookup) {
      for (const id of myRoster.player_ids ?? []) {
        const meta = playerNameLookup(id);
        if (!meta) continue;
        const pos = (meta.position ?? "").toUpperCase() as Position;
        if (pos !== "QB" && pos !== "RB" && pos !== "WR" && pos !== "TE") continue;
        const v = playerValueMap.get(id);
        if (v && typeof v.value === "number") {
          userPlayerValuesByPosition[pos].push({
            player_id: id,
            player_name: meta.name,
            value: v.value,
          });
        }
      }
    }
  }

  // Opponent rosters with values, when both maps are provided.
  const opponentRosters = new Map<number, OpponentRosterSnapshot>();
  if (playerValueMap && playerNameLookup) {
    for (const r of snap.rosters) {
      if (r.is_me) continue;
      const byPos: Record<
        Position,
        Array<{ player_id: string; player_name: string; value: number }>
      > = { QB: [], RB: [], WR: [], TE: [], K: [], DST: [] };
      for (const id of r.player_ids ?? []) {
        const meta = playerNameLookup(id);
        if (!meta) continue;
        const pos = (meta.position ?? "").toUpperCase() as Position;
        if (pos !== "QB" && pos !== "RB" && pos !== "WR" && pos !== "TE") continue;
        const v = playerValueMap.get(id);
        if (v && typeof v.value === "number") {
          byPos[pos].push({
            player_id: id,
            player_name: meta.name,
            value: v.value,
          });
        }
      }
      for (const pos of ["QB", "RB", "WR", "TE", "K", "DST"] as Position[]) {
        byPos[pos].sort((a, b) => b.value - a.value);
      }
      opponentRosters.set(r.roster_id, {
        roster_id: r.roster_id,
        player_values_by_position: byPos,
      });
    }
  }

  // Pick-quality signals: per-opponent value-vs-consensus analysis on
  // each pick they've made. Surfaces "joeboch took Mendoza in r5,
  // 35 picks before consensus" style reads automatically. Requires
  // playerValueMap (for overall_rank consensus baseline) plus
  // playerNameLookup (for narrative output).
  let pickQuality: ReturnType<typeof analyzeOpponentPickQuality> | undefined;
  if (
    playerValueMap &&
    playerNameLookup &&
    snap.draft.picks_made.length > 0
  ) {
    // playerValueMap shape from caller is { value }; pick-quality
    // also needs overall_rank. Build a wider map view.
    const pickQualityValueMap = new Map<
      string,
      { value: number; overall_rank: number | null }
    >();
    for (const [id, v] of playerValueMap.entries()) {
      pickQualityValueMap.set(id, {
        value: v.value,
        overall_rank: (v as { overall_rank?: number | null }).overall_rank ?? null,
      });
    }
    pickQuality = analyzeOpponentPickQuality({
      picksMade: snap.draft.picks_made,
      playerValueMap: pickQualityValueMap,
      playerNameLookup,
    });
  }

  return analyzeLeagueRead({
    profile,
    formatRules,
    userState: {
      position_counts: userPositionCounts,
      player_values_by_position: userPlayerValuesByPosition,
    },
    myRosterId: myRoster?.roster_id ?? null,
    opponentRosters,
    pickQuality,
    currentPickNo: snap.draft.next_pick_no,
    totalRosters: snap.total_teams,
    rounds: snap.draft.rounds,
  });
}

function lightweightTeamProfile(
  r: RosterSnapshot,
  starterReqs: Record<Position, number>,
  isSuperflex: boolean,
): TeamProfile {
  // Count holes vs surpluses on the four scoring positions.
  let qbCount = r.position_counts.QB ?? 0;
  let rbCount = r.position_counts.RB ?? 0;
  let wrCount = r.position_counts.WR ?? 0;
  let teCount = r.position_counts.TE ?? 0;
  const qbReq = starterReqs.QB;
  const rbReq = starterReqs.RB;
  const wrReq = starterReqs.WR;
  const teReq = starterReqs.TE;

  let qbHole = qbCount < qbReq;
  let rbHole = rbCount < rbReq;
  let wrHole = wrCount < wrReq;
  let teHole = teCount < teReq;
  let holeCount = (qbHole ? 1 : 0) + (rbHole ? 1 : 0) + (wrHole ? 1 : 0) + (teHole ? 1 : 0);

  // Light label heuristic. Mirrors labelTeam intent without strengths/
  // pain-points analysis that requires player rankings.
  let label: TeamProfile["label"] = "balanced";
  if (holeCount >= 3) label = "desperation";
  else if (qbHole && isSuperflex) label = "qb_needy";
  else if (qbCount >= 3 && isSuperflex) label = "qb_banker";
  else if (qbCount >= 2 && !isSuperflex) label = "qb_banker";
  else if (qbCount >= qbReq && !rbHole && !wrHole && !teHole) label = "qb_stable";

  // Pain points read straight off the holes.
  const pain_points: string[] = [];
  if (qbHole) pain_points.push(`${qbCount}/${qbReq} at QB`);
  if (rbHole) pain_points.push(`${rbCount}/${rbReq} at RB`);
  if (wrHole) pain_points.push(`${wrCount}/${wrReq} at WR`);
  if (teHole) pain_points.push(`${teCount}/${teReq} at TE`);

  return {
    roster_id: r.roster_id,
    owner_name: r.owner_name ?? `Team ${r.roster_id}`,
    record: {
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      fpts: 0,
    },
    standing_rank: null,
    counts: {
      QB: qbCount,
      RB: rbCount,
      WR: wrCount,
      TE: teCount,
      other: 0,
    },
    starter_quality: { QB: "unknown", RB: "unknown", WR: "unknown", TE: "unknown" },
    age_buckets: { young: 0, peak: 0, aging: 0, old: 0 },
    avg_age: r.avg_age,
    headline_players: [],
    strengths: [],
    pain_points,
    label,
  };
}
