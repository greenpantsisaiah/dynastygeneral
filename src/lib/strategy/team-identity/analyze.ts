/**
 * Build the Team Identity synthesis from a snapshot, ranked
 * archetypes, inflection contexts, and per-player FantasyCalc values.
 *
 * Composes the existing engine outputs into a single identity
 * readout. The hub passes everything it already has; this module
 * doesn't re-fetch.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type { Position, RankedArchetype } from "../archetypes/schema";
import type { InflectionContext } from "@/lib/engine/inflection";
import { getHardStarterReqs } from "@/lib/engine/roster-fit";
import type {
  BuildArchetypeReadout,
  ForwardProjection,
  PositionRoomFingerprint,
  RiskFingerprint,
  TeamIdentity,
} from "./types";

const SCORING_POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

export function analyzeTeamIdentity(args: {
  snap: LeagueSnapshot;
  rankedArchetypes: RankedArchetype[];
  inflections: InflectionContext[];
  // FantasyCalc-normalized per-player value (0-100). Same map used
  // by trade pricing.
  playerValueMap: Map<string, { value: number }>;
  // player_id -> { name, position }
  playerNameLookup: (id: string) => {
    name: string;
    position: string | null;
  } | null;
}): TeamIdentity | null {
  const { snap, rankedArchetypes, inflections, playerValueMap, playerNameLookup } = args;
  const myRoster = snap.rosters.find((r) => r.is_me);
  if (!myRoster) return null;

  // ─── Build archetype readout ────────────────────────────────────
  const top = rankedArchetypes[0] ?? null;
  const second = rankedArchetypes[1] ?? null;
  let build: BuildArchetypeReadout;
  if (!top) {
    build = {
      primary_name: "Forming",
      secondary_name: null,
      primary_confidence: 0,
      description: "Build pattern still forming. More picks needed for the engine to read your direction.",
      phase: null,
    };
  } else {
    // Treat the secondary as a real hybrid only when its score is
    // within 0.10 of the primary. Otherwise it's noise.
    const isHybrid =
      second != null &&
      top.total_score - second.total_score <= 0.1 &&
      second.total_score >= 0.4;
    build = {
      primary_name: top.archetype.name,
      secondary_name: isHybrid ? second.archetype.name : null,
      primary_confidence: top.total_score,
      description: top.archetype.tagline ?? "",
      phase: top.phase ?? null,
    };
  }

  // ─── Position room fingerprint ──────────────────────────────────
  // Per position: sum of values across each roster's player_ids,
  // then rank user's roster against league. Identify strongest and
  // weakest positions. "Strongest" = the position where the user
  // ranks BEST (lowest rank number) across the league. "Weakest" =
  // the position where the user ranks WORST.
  const reqs = getHardStarterReqs(snap);
  const positionValuesByRoster = new Map<number, Record<Position, number>>();
  const positionAnchorsByRoster = new Map<number, Record<Position, string[]>>();
  for (const r of snap.rosters) {
    const valuesByPos: Record<Position, number> = {
      QB: 0,
      RB: 0,
      WR: 0,
      TE: 0,
      K: 0,
      DST: 0,
    };
    const anchorsByPos: Record<Position, Array<{ name: string; value: number }>> = {
      QB: [],
      RB: [],
      WR: [],
      TE: [],
      K: [],
      DST: [],
    };
    for (const id of r.player_ids ?? []) {
      const meta = playerNameLookup(id);
      if (!meta) continue;
      const pos = (meta.position ?? "").toUpperCase() as Position;
      if (
        pos !== "QB" &&
        pos !== "RB" &&
        pos !== "WR" &&
        pos !== "TE"
      ) {
        continue;
      }
      const v = playerValueMap.get(id);
      if (!v || typeof v.value !== "number") continue;
      valuesByPos[pos] += v.value;
      anchorsByPos[pos].push({ name: meta.name, value: v.value });
    }
    for (const pos of SCORING_POSITIONS) {
      anchorsByPos[pos].sort((a, b) => b.value - a.value);
    }
    positionValuesByRoster.set(r.roster_id, valuesByPos);
    positionAnchorsByRoster.set(
      r.roster_id,
      Object.fromEntries(
        SCORING_POSITIONS.map((p) => [p, anchorsByPos[p].map((a) => a.name)]),
      ) as Record<Position, string[]>,
    );
  }

  // Per-position rank for the user.
  const myPosRanks: Record<Position, { rank: number; total: number; value: number }> = {
    QB: { rank: 0, total: snap.total_teams, value: 0 },
    RB: { rank: 0, total: snap.total_teams, value: 0 },
    WR: { rank: 0, total: snap.total_teams, value: 0 },
    TE: { rank: 0, total: snap.total_teams, value: 0 },
    K: { rank: 0, total: snap.total_teams, value: 0 },
    DST: { rank: 0, total: snap.total_teams, value: 0 },
  };
  for (const pos of SCORING_POSITIONS) {
    const sorted = [...positionValuesByRoster.entries()].sort(
      (a, b) => (b[1][pos] ?? 0) - (a[1][pos] ?? 0),
    );
    const myEntry = sorted.findIndex(
      ([rid]) => rid === myRoster.roster_id,
    );
    myPosRanks[pos] = {
      rank: myEntry >= 0 ? myEntry + 1 : snap.total_teams,
      total: snap.total_teams,
      value: positionValuesByRoster.get(myRoster.roster_id)?.[pos] ?? 0,
    };
  }

  // Strongest = lowest rank number (best in league)
  const strongestPos = SCORING_POSITIONS.reduce((best, pos) =>
    myPosRanks[pos].rank < myPosRanks[best].rank ? pos : best,
  );
  // Weakest = highest rank number, with required-starter focus
  // (only flag positions where the user has a starter requirement)
  const candidates = SCORING_POSITIONS.filter((p) => (reqs[p] ?? 0) > 0);
  const weakestPos = candidates.reduce((worst, pos) =>
    myPosRanks[pos].rank > myPosRanks[worst].rank ? pos : worst,
  );

  const myAnchors = positionAnchorsByRoster.get(myRoster.roster_id);
  const position_room: PositionRoomFingerprint = {
    strongest:
      myPosRanks[strongestPos].rank > 0
        ? {
            position: strongestPos,
            rank: myPosRanks[strongestPos].rank,
            total: myPosRanks[strongestPos].total,
            anchors: (myAnchors?.[strongestPos] ?? []).slice(0, 2),
            value: myPosRanks[strongestPos].value,
          }
        : null,
    weakest:
      myPosRanks[weakestPos].rank > 0 && weakestPos !== strongestPos
        ? {
            position: weakestPos,
            rank: myPosRanks[weakestPos].rank,
            total: myPosRanks[weakestPos].total,
            count: myRoster.position_counts[weakestPos] ?? 0,
            required: reqs[weakestPos] ?? 0,
          }
        : null,
  };

  // ─── Risk fingerprint ───────────────────────────────────────────
  let aging_cliff_count = 0;
  let post_injury_count = 0;
  let rookie_debut_count = 0;
  const namedPlayers: string[] = [];
  for (const ctx of inflections) {
    for (const r of ctx.resolutions) {
      if (
        r.window === "aging_cliff_rb" ||
        r.window === "aging_cliff_wr" ||
        r.window === "aging_cliff_te" ||
        r.window === "aging_cliff_qb"
      ) {
        aging_cliff_count++;
      } else if (r.window === "post_major_injury") {
        post_injury_count++;
      } else if (r.window === "rookie_debut") {
        rookie_debut_count++;
      }
    }
    if (namedPlayers.length < 3) namedPlayers.push(ctx.player_name);
  }
  const total_inflection_windows =
    aging_cliff_count + post_injury_count + rookie_debut_count;
  let riskTier: "low" | "moderate" | "high";
  if (total_inflection_windows <= 1) riskTier = "low";
  else if (total_inflection_windows <= 3) riskTier = "moderate";
  else riskTier = "high";
  const riskParts: string[] = [];
  if (aging_cliff_count > 0) riskParts.push(`${aging_cliff_count} aging cliff${aging_cliff_count === 1 ? "" : "s"}`);
  if (post_injury_count > 0) riskParts.push(`${post_injury_count} post-injury return${post_injury_count === 1 ? "" : "s"}`);
  if (rookie_debut_count > 0) riskParts.push(`${rookie_debut_count} rookie debut${rookie_debut_count === 1 ? "" : "s"}`);
  const risk: RiskFingerprint = {
    aging_cliff_count,
    post_injury_count,
    rookie_debut_count,
    total_inflection_windows,
    tier: riskTier,
    summary:
      riskParts.length === 0
        ? "Low variance: 0 roster players in inflection windows."
        : `${riskTier.charAt(0).toUpperCase() + riskTier.slice(1)} variance: ${riskParts.join(", ")}.`,
    named_players: namedPlayers,
  };

  // ─── Forward projection ─────────────────────────────────────────
  // Lineup talent: top-N at each position by value, sum, rank
  // across rosters by the same metric. Use canonical reqs.
  const lineupTalentByRoster = new Map<number, number>();
  for (const r of snap.rosters) {
    const anchors = positionAnchorsByRoster.get(r.roster_id);
    let sum = 0;
    if (anchors) {
      for (const pos of SCORING_POSITIONS) {
        const need = reqs[pos] ?? 0;
        const top = (anchors[pos] ?? []).slice(0, need);
        for (const name of top) {
          // Look up value for this named player by re-finding via the
          // position list. Cleaner alternative: store {name, value}
          // pairs in anchorsByPos and reuse them. Here we re-compute.
          const valuesEntry = positionValuesByRoster.get(r.roster_id);
          // The anchorsByPos was already sorted by value desc above,
          // so the top N are correctly selected; we just need their
          // values. Re-derive by iterating rostered players matching
          // these names.
          // For simplicity: assume avg value of position pool
          // approximates for this rough calc. We'll do a more
          // accurate per-player sum below.
          void valuesEntry;
          void name;
        }
      }
    }
    // Accurate version: iterate player_ids, group by position, sort
    // by value, sum top N where N = reqs[pos].
    const byPos: Record<Position, number[]> = {
      QB: [],
      RB: [],
      WR: [],
      TE: [],
      K: [],
      DST: [],
    };
    for (const id of r.player_ids ?? []) {
      const meta = playerNameLookup(id);
      if (!meta) continue;
      const pos = (meta.position ?? "").toUpperCase() as Position;
      if (pos !== "QB" && pos !== "RB" && pos !== "WR" && pos !== "TE") continue;
      const v = playerValueMap.get(id);
      if (!v || typeof v.value !== "number") continue;
      byPos[pos].push(v.value);
    }
    sum = 0;
    for (const pos of SCORING_POSITIONS) {
      const need = reqs[pos] ?? 0;
      byPos[pos].sort((a, b) => b - a);
      for (let i = 0; i < need && i < byPos[pos].length; i++) {
        sum += byPos[pos][i];
      }
    }
    lineupTalentByRoster.set(r.roster_id, sum);
  }
  const rankedTalent = [...lineupTalentByRoster.entries()].sort(
    (a, b) => b[1] - a[1],
  );
  const myTalentEntry = rankedTalent.findIndex(
    ([rid]) => rid === myRoster.roster_id,
  );
  const lineupTalentRank =
    myTalentEntry >= 0 ? myTalentEntry + 1 : snap.total_teams;
  const lineupTalentValue = lineupTalentByRoster.get(myRoster.roster_id) ?? 0;

  // Keeper slate: only when the league is a keeper format.
  let keeperSlate: ForwardProjection["keeper_slate"] = null;
  let maxKeepers: number | null = null;
  if (snap.league_type === "keeper" && snap.max_keepers != null && snap.max_keepers > 0) {
    maxKeepers = snap.max_keepers;
    const allRosterValues: Array<{ id: string; name: string; value: number }> = [];
    for (const id of myRoster.player_ids ?? []) {
      const meta = playerNameLookup(id);
      if (!meta) continue;
      const v = playerValueMap.get(id);
      if (!v || typeof v.value !== "number") continue;
      allRosterValues.push({ id, name: meta.name, value: v.value });
    }
    allRosterValues.sort((a, b) => b.value - a.value);
    keeperSlate = allRosterValues.slice(0, maxKeepers).map((p) => ({
      player_id: p.id,
      player_name: p.name,
      value: p.value,
    }));
  }

  const forward: ForwardProjection = {
    lineup_talent_value: lineupTalentValue,
    lineup_talent_rank: lineupTalentRank,
    total_teams: snap.total_teams,
    keeper_slate: keeperSlate,
    max_keepers: maxKeepers,
  };

  // ─── Headline narrative ─────────────────────────────────────────
  // One-line composition. Includes archetype name + position
  // strength + risk + forward projection rank if useful.
  const headlineParts: string[] = [];
  const buildLabel =
    build.secondary_name != null
      ? `${build.primary_name} + ${build.secondary_name}`
      : build.primary_name;
  if (build.primary_name !== "Forming") {
    headlineParts.push(buildLabel);
  }
  if (forward.lineup_talent_rank > 0) {
    headlineParts.push(`lineup rank ${forward.lineup_talent_rank}/${forward.total_teams}`);
  }
  if (position_room.strongest && position_room.strongest.rank === 1) {
    headlineParts.push(`league's best ${position_room.strongest.position}`);
  }
  if (risk.tier === "low" && total_inflection_windows === 0) {
    headlineParts.push("zero inflection risk");
  } else if (risk.tier === "high") {
    headlineParts.push(`${risk.total_inflection_windows} inflection windows to manage`);
  }

  const headline =
    headlineParts.length > 0
      ? `${headlineParts.join(" · ")}.`
      : "Identity is forming. Take a few more picks and the engine will name your build.";

  return { headline, build, position_room, risk, forward };
}
