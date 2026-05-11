/**
 * Build a reference-roster cohort for lane-identity calibration.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/build-cohort.ts
 *
 * For each league_id in LEAGUE_IDS:
 *   1. Resolve the draft state + roster + user lookups via Sleeper.
 *   2. Build a LeagueSnapshot with mySleeperUserId = null (no user lens).
 *   3. Resolve FantasyCalc values for every rostered player.
 *   4. For every roster_id, run aggregateRosterIdentity.
 *   5. Capture lane memberships + standings (wins/losses) so the
 *      calibration analysis can use standings as a partial label.
 *
 * Outputs:
 *   cohort.json (raw data; gitignored. See privacy note below.)
 *
 * Privacy note: rosters belong to real users. Owner names and roster
 * compositions are stored in the cohort file. Do NOT commit cohort.json
 * to the repo or share externally. Aggregated reports (distribution
 * histograms, IN-rates) are safe to share; per-roster data is not.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveDraftState } from "../src/lib/sleeper/draft-state";
import {
  getLeague,
  getRosters,
  getLeagueUsers,
} from "../src/lib/sleeper/client";
import { buildLeagueSnapshot } from "../src/lib/strategy/league-state/snapshot";
import { __dumpAllPlayers, humanize } from "../src/lib/players/cache";
import { resolvePlayerValues } from "../src/lib/players/values";
import { aggregateRosterIdentity } from "../src/lib/strategy/lane-identity";
import type { PlayerMeta } from "../src/lib/strategy/lane-identity";

const LEAGUE_IDS = [
  "1344495382889000960",
  "1350550831975403520",
  "1315790476086878208",
  "1312779032584032256",
  "1251372208689778688",
  "1257244822792581120",
  "1311586805769859072",
];

type CohortRoster = {
  league_id: string;
  league_name: string;
  league_format: string;
  league_scoring: string[];
  league_type: "redraft" | "keeper" | "dynasty";
  total_teams: number;
  roster_id: number;
  owner_id: string | null;
  owner_name: string | null;
  wins: number | null;
  losses: number | null;
  starter_talent_score: number | null;
  player_count: number;
  ktc_total_top8: number;
  ktc_total_all: number;
  memberships: Array<{
    lane_id: string;
    label: string;
    axis: string;
    state: "in" | "close" | "not_in";
    aggregate_score: number;
    in_threshold: number;
    close_threshold: number;
    is_derived: boolean;
  }>;
};

async function buildForLeague(leagueId: string): Promise<CohortRoster[]> {
  console.log(`\nbuilding cohort for league ${leagueId}`);
  const draftState = await resolveDraftState(leagueId, null);
  const [league, rosters, users] = await Promise.all([
    getLeague(leagueId),
    getRosters(leagueId),
    getLeagueUsers(leagueId),
  ]);
  const snap = await buildLeagueSnapshot({
    league,
    rosters,
    users,
    draftState,
    mySleeperUserId: null,
  });
  console.log(
    `  league: ${league.name} . ${snap.format} . ${snap.scoring.join("+")} . ${snap.total_teams} teams`,
  );

  const valueIds: string[] = [];
  for (const r of snap.rosters) {
    for (const id of r.player_ids) valueIds.push(id);
  }
  const valueMap = await resolvePlayerValues({
    ids: valueIds,
    isSuperflex: snap.format === "superflex" || snap.format === "2qb",
    isPpr: snap.scoring.includes("PPR"),
    isHalfPpr: snap.scoring.includes("half-PPR"),
    isTePremium: snap.scoring.includes("TE-premium"),
  });

  const allPlayers = await __dumpAllPlayers();
  const playerMetaById = new Map<string, PlayerMeta>();
  for (const p of allPlayers) {
    const h = humanize(p);
    playerMetaById.set(p.player_id, {
      name: h.name,
      position: h.position,
      team: h.team,
      age: h.age,
      years_exp: h.yearsExp,
      is_rookie: p.years_exp === 0,
      search_rank: p.search_rank ?? 9999,
    });
  }
  const lookup = (id: string) => playerMetaById.get(id) ?? null;

  const out: CohortRoster[] = [];
  for (const r of snap.rosters) {
    const memberships = aggregateRosterIdentity({
      playerIds: r.player_ids,
      playerLookup: lookup,
      playerValueMap: valueMap,
      snap,
    });
    const ktcValues = r.player_ids
      .map((id) => valueMap.get(id)?.value ?? 0)
      .filter((v) => v > 0)
      .sort((a, b) => b - a);
    const ktc_total_top8 = ktcValues.slice(0, 8).reduce((s, v) => s + v, 0);
    const ktc_total_all = ktcValues.reduce((s, v) => s + v, 0);
    out.push({
      league_id: leagueId,
      league_name: league.name ?? "(unknown)",
      league_format: snap.format,
      league_scoring: snap.scoring,
      league_type: snap.league_type,
      total_teams: snap.total_teams,
      roster_id: r.roster_id,
      owner_id: r.owner_id,
      owner_name: r.owner_name,
      wins: r.wins ?? null,
      losses: r.losses ?? null,
      starter_talent_score: r.starter_talent_score,
      player_count: r.player_ids.length,
      ktc_total_top8,
      ktc_total_all,
      memberships: memberships.map((m) => ({
        lane_id: m.lane_id,
        label: m.label,
        axis: m.axis,
        state: m.state,
        aggregate_score: m.aggregate_score,
        in_threshold: m.in_threshold,
        close_threshold: m.close_threshold,
        is_derived: m.is_derived,
      })),
    });
  }
  console.log(`  emitted ${out.length} rosters`);
  return out;
}

async function main() {
  const all: CohortRoster[] = [];
  for (const id of LEAGUE_IDS) {
    try {
      const rosters = await buildForLeague(id);
      all.push(...rosters);
    } catch (err) {
      console.error(`  FAILED ${id}:`, (err as Error).message);
    }
  }
  const outPath = resolve(process.cwd(), "cohort.json");
  writeFileSync(outPath, JSON.stringify(all, null, 2));
  console.log(
    `\ndone. ${all.length} total rosters across ${LEAGUE_IDS.length} leagues -> ${outPath}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
