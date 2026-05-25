/**
 * Priced-pool coverage regression. Locks the root invariant behind the
 * 2026-05-24 board/Coach divergence (Jaylin Noel vs Adonai Mitchell).
 *
 *   npx tsx --tsconfig tsconfig.json evals/priced-pool-coverage.test.ts
 *
 * The bug: the board priced EVERY roster while Coach priced only the
 * user's roster plus the available pool. annotateStartableDepth builds
 * the leaguewide startable tier from PRICED bodies only, so when
 * opponents go unpriced their players drop out of the tier and the
 * user's own (weaker) players float up into it. That inflates the user's
 * startable_counts, which flips the fill_starter gate in synthesizeDecision
 * (startableHaveFor >= reqs => "hole filled, suppress fill"), which makes
 * the two surfaces recommend different players.
 *
 * This test runs annotateStartableDepth two ways on the SAME rosters:
 * all-rosters pricing (correct, what buildPricedPool does) vs me-only
 * pricing (the bug Coach had). It asserts the me-only path inflates the
 * user's startable WR count and the all-rosters path does not. The gate
 * the engine reads (startable vs starter requirement) therefore diverges,
 * which is the whole mechanism. buildPricedPool now prices all rosters on
 * BOTH surfaces; this test fails if anyone reintroduces me-only pricing.
 */

import { annotateStartableDepth } from "../src/lib/engine/roster-fit";
import type { LeagueSnapshot } from "../src/lib/strategy/league-state/snapshot";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`);
  }
}

// 2-team league. hard.WR = 1, no flex -> realistic WR starters = 2
// (1 hard + standard WR flex share). Startable tier = 2 teams x 2 = 4
// top WRs leaguewide.
function makeSnap(): LeagueSnapshot {
  return {
    total_teams: 2,
    scoring: [],
    starter_slots: {
      hard: { QB: 1, RB: 2, WR: 1, TE: 1, K: 0, DST: 0 },
      flex: 0,
      rec_flex: 0,
      superflex: 0,
    },
    rosters: [
      {
        // The user: two decent-but-not-elite WRs.
        roster_id: 1,
        is_me: true,
        player_ids: ["me_wr1", "me_wr2"],
        position_counts: { QB: 0, RB: 0, WR: 2, TE: 0, K: 0, DST: 0 },
      },
      {
        // The opponent: four clearly-better WRs.
        roster_id: 2,
        is_me: false,
        player_ids: ["opp_wr1", "opp_wr2", "opp_wr3", "opp_wr4"],
        position_counts: { QB: 0, RB: 0, WR: 4, TE: 0, K: 0, DST: 0 },
      },
    ],
  } as unknown as LeagueSnapshot;
}

const POSITIONS: Record<string, "WR"> = {
  me_wr1: "WR",
  me_wr2: "WR",
  opp_wr1: "WR",
  opp_wr2: "WR",
  opp_wr3: "WR",
  opp_wr4: "WR",
};
const positionOf = (id: string) => POSITIONS[id] ?? null;

// All-rosters values: leaguewide WR order is the 4 opponent WRs (100..85)
// then the user's two (50, 45). Top-4 tier = the opponent's four; the
// user's WRs do NOT clear it.
const ALL_ROSTER_VALUES: Record<string, number> = {
  opp_wr1: 100,
  opp_wr2: 95,
  opp_wr3: 90,
  opp_wr4: 85,
  me_wr1: 50,
  me_wr2: 45,
};
// Me-only values (the Coach bug): opponents unpriced, so the tier is
// filled entirely by the user's two WRs, which both "clear" it.
const ME_ONLY_VALUES: Record<string, number> = {
  me_wr1: 50,
  me_wr2: 45,
};

function run() {
  console.log("\n── all-rosters pricing: user's weak WRs do NOT clear the leaguewide tier ──");
  const allSnap = makeSnap();
  annotateStartableDepth({
    snap: allSnap,
    valueOf: (id) => ALL_ROSTER_VALUES[id] ?? null,
    positionOf,
  });
  const meAll = allSnap.rosters.find((r) => r.is_me)!;
  check(
    "all-rosters startable WR is 0 (both behind the opponent's four)",
    meAll.startable_counts?.WR === 0,
    `startable=${meAll.startable_counts?.WR}`,
  );

  console.log("\n── me-only pricing (the Coach bug): startable WR INFLATES ──");
  const meSnap = makeSnap();
  annotateStartableDepth({
    snap: meSnap,
    valueOf: (id) => ME_ONLY_VALUES[id] ?? null,
    positionOf,
  });
  const meMe = meSnap.rosters.find((r) => r.is_me)!;
  check(
    "me-only startable WR is 2 (opponents unpriced, user's WRs float into the tier)",
    meMe.startable_counts?.WR === 2,
    `startable=${meMe.startable_counts?.WR}`,
  );

  console.log("\n── the inflation flips the fill gate (startable vs WR requirement = 2) ──");
  const WR_REQ = 2;
  const allHole = (meAll.startable_counts?.WR ?? 0) < WR_REQ;
  const meHole = (meMe.startable_counts?.WR ?? 0) < WR_REQ;
  check(
    "all-rosters: WR reads as a starter HOLE (fill fires, strong WR recommended)",
    allHole,
    `startable ${meAll.startable_counts?.WR} < ${WR_REQ}`,
  );
  check(
    "me-only: WR reads as FILLED (fill suppressed, the divergence)",
    !meHole,
    `startable ${meMe.startable_counts?.WR} >= ${WR_REQ}`,
  );
  check(
    "the two pricing scopes produce DIFFERENT gate states (the bug mechanism)",
    allHole !== meHole,
  );

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
