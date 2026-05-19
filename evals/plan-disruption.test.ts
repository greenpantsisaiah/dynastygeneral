/**
 * Plan-disruption regression. Locks the snipe-detection logic and
 * Voice A acknowledgment text.
 *
 *   npx tsx --tsconfig tsconfig.json evals/plan-disruption.test.ts
 */

import {
  buildPlanPlayerIds,
  detectPlanDisruption,
} from "../src/lib/last-visit/plan-disruption";
import type { LastVisitFingerprint } from "../src/lib/last-visit/cookie";
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

const EM_DASH_CHAR = String.fromCharCode(0x2014);

function makeSnap(opts: {
  myRosterId: number;
  myNextPickNo: number | null;
  totalPicksMade: number;
  picks: Array<{ pick_no: number; roster_id: number; player_id: string }>;
  rosterNames: Record<number, string>;
}): LeagueSnapshot {
  return {
    league_id: "test",
    season: "2026",
    total_teams: Object.keys(opts.rosterNames).length,
    format: "1qb",
    league_type: "dynasty",
    max_keepers: null,
    scoring: ["PPR"],
    starter_slots: {
      hard: { QB: 1, RB: 2, WR: 2, TE: 1, K: 0, DST: 0 },
      flex: 1,
      superflex: 0,
      rec_flex: 0,
      bench: 5,
    },
    rosters: Object.entries(opts.rosterNames).map(([rid, name]) => ({
      roster_id: Number(rid),
      owner_id: `u${rid}`,
      owner_name: name,
      is_me: Number(rid) === opts.myRosterId,
      position_counts: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 },
      position_ranks: { QB: [], RB: [], WR: [], TE: [], K: [], DST: [] },
      player_ids: [],
      avg_age: 26,
      starter_avg_age: 26,
      starter_talent_score: 0.5,
      wins: 0,
      losses: 0,
      ties: 0,
    })),
    my_roster_id: opts.myRosterId,
    draft: {
      status: "drafting",
      type: "snake",
      rounds: 20,
      reversal_round: null,
      slot_to_roster_id: {},
      my_slot: 1,
      next_pick_no: null,
      picks_made: opts.picks.map((p) => ({
        pick_no: p.pick_no,
        round: Math.ceil(p.pick_no / Object.keys(opts.rosterNames).length),
        roster_id: p.roster_id,
        player_id: p.player_id,
        position: "RB",
        age: 25,
        years_exp: 3,
      })),
      traded_picks: [],
      my_pick_schedule:
        opts.myNextPickNo != null
          ? [
              {
                pick_no: opts.myNextPickNo,
                round: Math.ceil(
                  opts.myNextPickNo / Object.keys(opts.rosterNames).length,
                ),
                pick_label: `${Math.ceil(opts.myNextPickNo / Object.keys(opts.rosterNames).length)}.X`,
                gap_to_prev: 0,
                gap_to_next: 12,
                density_kind: "normal",
              },
            ]
          : [],
    },
    agg: {
      teams_without_position_after_round: () => 0,
      avg_position_count: () => 0,
    },
  } as unknown as LeagueSnapshot;
}

function makeNameLookup(map: Record<string, string>) {
  return (id: string) =>
    map[id] ? { name: map[id], position: "RB" } : null;
}

const ELEVEN_MIN_AGO_ISO = "2026-05-08T16:49:00Z";

function run() {
  console.log("\n── 1. buildPlanPlayerIds dedupes + caps ──");
  {
    const ids = buildPlanPlayerIds({
      recommendation_id: "p1",
      top_candidate_ids: ["p1", "p2", "p3"],
      next_picks_plan_target_ids: ["p2", "p4", "p5"],
    });
    check("dedupes overlap", ids.length === 5, `actual: ${ids.length}`);
    check("recommendation first", ids[0] === "p1");
    check("includes p2 once", ids.filter((id) => id === "p2").length === 1);
  }

  console.log("\n── 2. No prior plan: graceful empty ──");
  {
    const result = detectPlanDisruption({
      prior: null,
      snap: makeSnap({
        myRosterId: 1,
        myNextPickNo: 80,
        totalPicksMade: 75,
        picks: [],
        rosterNames: { 1: "Me", 2: "Opp" },
      }),
      playerNameLookup: makeNameLookup({}),
    });
    check("no snipes", result.snipes.length === 0);
    check("no acknowledgment", result.acknowledgment === null);
  }

  console.log("\n── 3. Single snipe by named opponent two picks before mine ──");
  {
    const prior: LastVisitFingerprint = {
      v: 1,
      ts: ELEVEN_MIN_AGO_ISO,
      total_picks_made: 53,
      standing_call_id: "judkins",
      ev_bank_total: 2.0,
      my_roster_size: 5,
      plan_player_ids: ["judkins", "warren", "tate"],
    };
    const snap = makeSnap({
      myRosterId: 1,
      myNextPickNo: 56,
      totalPicksMade: 55,
      picks: [
        { pick_no: 50, roster_id: 2, player_id: "earlier" }, // before last visit
        { pick_no: 54, roster_id: 2, player_id: "judkins" }, // SNIPE between visits
      ],
      rosterNames: { 1: "Me", 2: "joeboch" },
    });
    const result = detectPlanDisruption({
      prior,
      snap,
      playerNameLookup: makeNameLookup({ judkins: "Quinshon Judkins" }),
    });
    check("1 snipe detected", result.snipes.length === 1, `count: ${result.snipes.length}`);
    check("snipe is judkins", result.snipes[0].player_id === "judkins");
    check("drafted_by_owner = joeboch", result.snipes[0].drafted_by_owner === "joeboch");
    const ack = result.acknowledgment ?? "";
    check("acknowledgment names the player", ack.includes("Judkins"), `ack: ${ack}`);
    check("acknowledgment names the drafter", ack.includes("joeboch"), `ack: ${ack}`);
    check("acknowledgment says picks before yours", ack.includes("before yours"), `ack: ${ack}`);
    check("acknowledgment says recalibrating", ack.toLowerCase().includes("recalibrating"), `ack: ${ack}`);
    check("no em dash in acknowledgment", !ack.includes(EM_DASH_CHAR));
    check("no 'dammit' (Voice C affect rejected)", !ack.toLowerCase().includes("dammit"));
  }

  console.log("\n── 4. Multiple snipes aggregate cleanly ──");
  {
    const prior: LastVisitFingerprint = {
      v: 1,
      ts: ELEVEN_MIN_AGO_ISO,
      total_picks_made: 50,
      standing_call_id: null,
      ev_bank_total: null,
      my_roster_size: 5,
      plan_player_ids: ["a", "b", "c", "d"],
    };
    // 12-team league so the reachability band (one round = 12 picks)
    // includes the 51 / 52 / 53 → 60 snipe range.
    const rosterNames: Record<number, string> = {};
    for (let i = 1; i <= 12; i++) rosterNames[i] = `Roster ${i}`;
    rosterNames[1] = "Me";
    rosterNames[2] = "Opp1";
    rosterNames[3] = "Opp2";
    const snap = makeSnap({
      myRosterId: 1,
      myNextPickNo: 60,
      totalPicksMade: 56,
      picks: [
        { pick_no: 51, roster_id: 2, player_id: "a" },
        { pick_no: 52, roster_id: 3, player_id: "b" },
        { pick_no: 53, roster_id: 2, player_id: "c" },
      ],
      rosterNames,
    });
    const result = detectPlanDisruption({
      prior,
      snap,
      playerNameLookup: makeNameLookup({ a: "Player A", b: "Player B", c: "Player C" }),
    });
    check("3 snipes", result.snipes.length === 3);
    const ack = result.acknowledgment ?? "";
    check("acknowledgment lists multiple", ack.includes("Multiple plan players"), `ack: ${ack}`);
    check("names all 3 (under cap)", ack.includes("Player A") && ack.includes("Player B") && ack.includes("Player C"));
  }

  console.log("\n── 5. User's own pick not flagged as snipe ──");
  {
    const prior: LastVisitFingerprint = {
      v: 1,
      ts: ELEVEN_MIN_AGO_ISO,
      total_picks_made: 53,
      standing_call_id: "warren",
      ev_bank_total: 2.0,
      my_roster_size: 4,
      plan_player_ids: ["warren"],
    };
    const snap = makeSnap({
      myRosterId: 1,
      myNextPickNo: 65,
      totalPicksMade: 56,
      picks: [
        { pick_no: 56, roster_id: 1, player_id: "warren" }, // user took warren themselves
      ],
      rosterNames: { 1: "Me", 2: "Opp" },
    });
    const result = detectPlanDisruption({
      prior,
      snap,
      playerNameLookup: makeNameLookup({ warren: "Tyler Warren" }),
    });
    check("no snipe (user took it)", result.snipes.length === 0);
    check("no acknowledgment", result.acknowledgment === null);
  }

  console.log("\n── 6. Picks before last visit not flagged ──");
  {
    const prior: LastVisitFingerprint = {
      v: 1,
      ts: ELEVEN_MIN_AGO_ISO,
      total_picks_made: 60,
      standing_call_id: null,
      ev_bank_total: null,
      my_roster_size: 5,
      plan_player_ids: ["x"],
    };
    const snap = makeSnap({
      myRosterId: 1,
      myNextPickNo: 80,
      totalPicksMade: 60, // no new picks since last visit
      picks: [
        { pick_no: 30, roster_id: 2, player_id: "x" }, // long before last visit
      ],
      rosterNames: { 1: "Me", 2: "Opp" },
    });
    const result = detectPlanDisruption({
      prior,
      snap,
      playerNameLookup: makeNameLookup({ x: "X" }),
    });
    check("no snipe for pre-visit pick", result.snipes.length === 0);
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
