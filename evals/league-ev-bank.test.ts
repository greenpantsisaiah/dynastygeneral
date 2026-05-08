/**
 * League EV bank regression. Locks the per-roster computation +
 * ranking + percentile math.
 *
 *   npx tsx --tsconfig tsconfig.json evals/league-ev-bank.test.ts
 */

import { analyzeLeagueEvBank } from "../src/lib/strategy/ev-bank/league";
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

function approxEqual(a: number, b: number, tol = 0.05): boolean {
  return Math.abs(a - b) <= tol;
}

type RosterPick = {
  roster_id: number;
  pick_no: number;
  player_id: string;
};

function makeSnap(opts: {
  rosterIds: number[];
  myRosterId: number;
  picks: RosterPick[];
}): LeagueSnapshot {
  return {
    league_id: "test",
    season: "2026",
    total_teams: opts.rosterIds.length,
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
    rosters: opts.rosterIds.map((rid) => ({
      roster_id: rid,
      owner_id: `u${rid}`,
      owner_name: rid === opts.myRosterId ? "Me" : `Opp${rid}`,
      is_me: rid === opts.myRosterId,
      position_counts: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 },
      position_ranks: { QB: [], RB: [], WR: [], TE: [], K: [], DST: [] },
      player_ids: opts.picks.filter((p) => p.roster_id === rid).map((p) => p.player_id),
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
      slot_to_roster_id: Object.fromEntries(opts.rosterIds.map((rid, i) => [i + 1, rid])),
      my_slot: 1,
      next_pick_no: null,
      picks_made: opts.picks.map((p) => ({
        pick_no: p.pick_no,
        round: Math.ceil(p.pick_no / opts.rosterIds.length),
        roster_id: p.roster_id,
        player_id: p.player_id,
        position: "RB",
        age: 25,
        years_exp: 3,
      })),
      traded_picks: [],
      my_pick_schedule: [],
    },
    agg: {
      teams_without_position_after_round: () => 0,
      avg_position_count: () => 0,
    },
  } as unknown as LeagueSnapshot;
}

function run() {
  console.log("\n── 1. Three-roster league: rank + percentile + average ──");
  {
    // Roster 1 (me): bargain pick. value 80, pick 5, ADP 1. ev=0.8*4=3.2
    // Roster 2: at consensus. value 50, pick 6, ADP 6. ev=0
    // Roster 3: sharp lock. value 80, pick 7, ADP 20. ev=0.8*-13=-10.4
    const snap = makeSnap({
      rosterIds: [1, 2, 3],
      myRosterId: 1,
      picks: [
        { roster_id: 1, pick_no: 5, player_id: "p1" },
        { roster_id: 2, pick_no: 6, player_id: "p2" },
        { roster_id: 3, pick_no: 7, player_id: "p3" },
      ],
    });
    const result = analyzeLeagueEvBank({
      snap,
      playerValueMap: new Map([
        ["p1", { value: 80 }],
        ["p2", { value: 50 }],
        ["p3", { value: 80 }],
      ]),
      getAdp: (id) => ({ p1: 1, p2: 6, p3: 20 }[id] ?? null),
    });
    check("3 rosters in result", result.rosters.length === 3);
    check("ranked_count = 3", result.ranked_count === 3);
    check("my_rank = 1 (top)", result.my_rank === 1, `actual: ${result.my_rank}`);
    check("my_percentile = 100", result.my_percentile === 100, `actual: ${result.my_percentile}`);
    check("league_avg ≈ -2.4", approxEqual(result.league_avg!, -2.4, 0.1), `actual: ${result.league_avg}`);
    check("rosters sorted by total_ev desc", result.rosters[0].is_me && result.rosters[2].roster_id === 3);
  }

  console.log("\n── 2. User in middle of pack: percentile reflects rank ──");
  {
    // 5 rosters; user has 2nd-best EV bank. Percentile = (5-2)/(5-1) = 75
    const snap = makeSnap({
      rosterIds: [1, 2, 3, 4, 5],
      myRosterId: 3,
      picks: [
        // r1 +6
        { roster_id: 1, pick_no: 5, player_id: "r1p1" },
        // r2 +1
        { roster_id: 2, pick_no: 6, player_id: "r2p1" },
        // r3 (me) +4
        { roster_id: 3, pick_no: 7, player_id: "r3p1" },
        // r4 -3
        { roster_id: 4, pick_no: 8, player_id: "r4p1" },
        // r5 -6
        { roster_id: 5, pick_no: 9, player_id: "r5p1" },
      ],
    });
    const result = analyzeLeagueEvBank({
      snap,
      playerValueMap: new Map([
        ["r1p1", { value: 80 }],   // 0.8 * (5-2) = 2.4? no wait. Let me compute properly.
        ["r2p1", { value: 80 }],
        ["r3p1", { value: 80 }],
        ["r4p1", { value: 80 }],
        ["r5p1", { value: 80 }],
      ]),
      // ev = (value/100) * (pick_no - adp). For rank order:
      // r1: 0.8 * (5 - (-3)) = 6.4   (adp -3 → effectively player goes "before draft starts")
      // ... actually negative ADP isn't realistic; let me redo with values that just produce ordered totals.
      getAdp: (id) =>
        ({ r1p1: -3, r2p1: 4, r3p1: 2, r4p1: 12, r5p1: 16 }[id] ?? null),
    });
    // Computed totals:
    // r1: 0.8 * (5 - -3) = 6.4
    // r2: 0.8 * (6 - 4) = 1.6
    // r3 (me): 0.8 * (7 - 2) = 4.0
    // r4: 0.8 * (8 - 12) = -3.2
    // r5: 0.8 * (9 - 16) = -5.6
    // Order: r1 (6.4), r3 me (4.0), r2 (1.6), r4 (-3.2), r5 (-5.6)
    check("my_rank = 2", result.my_rank === 2, `actual: ${result.my_rank}`);
    check("my_percentile = 75", approxEqual(result.my_percentile!, 75), `actual: ${result.my_percentile}`);
    check("ranked_count = 5", result.ranked_count === 5);
  }

  console.log("\n── 3. Unresolved roster (no values / no ADPs) excluded from rank ──");
  {
    const snap = makeSnap({
      rosterIds: [1, 2],
      myRosterId: 1,
      picks: [
        { roster_id: 1, pick_no: 5, player_id: "p1" },
        { roster_id: 2, pick_no: 6, player_id: "p2" },
      ],
    });
    const result = analyzeLeagueEvBank({
      snap,
      // p1 resolves; p2 does not (no value).
      playerValueMap: new Map([["p1", { value: 50 }]]),
      getAdp: (id) => ({ p1: 5, p2: 6 }[id] ?? null),
    });
    check("ranked_count = 1 (only resolved roster)", result.ranked_count === 1);
    check(
      "unresolved roster has total_ev null",
      result.rosters.find((r) => r.roster_id === 2)?.total_ev == null,
    );
    check("unresolved roster sorts last", result.rosters[result.rosters.length - 1].roster_id === 2);
    check("my_percentile = 100 (only resolved)", result.my_percentile === 100);
  }

  console.log("\n── 4. Range envelope present when 2+ resolved picks ──");
  {
    const snap = makeSnap({
      rosterIds: [1],
      myRosterId: 1,
      picks: [
        { roster_id: 1, pick_no: 5, player_id: "p1" },
        { roster_id: 1, pick_no: 17, player_id: "p2" },
      ],
    });
    const result = analyzeLeagueEvBank({
      snap,
      playerValueMap: new Map([
        ["p1", { value: 80 }],
        ["p2", { value: 50 }],
      ]),
      getAdp: (id) => ({ p1: 1, p2: 17 }[id] ?? null),
    });
    const me = result.rosters.find((r) => r.is_me);
    check("range_low present", me?.range_low != null);
    check("range_high present", me?.range_high != null);
    check("range_low < total_ev", me!.range_low! < me!.total_ev!);
    check("range_high > total_ev", me!.range_high! > me!.total_ev!);
  }

  console.log("\n── 5. Empty league: graceful ──");
  {
    const snap = makeSnap({ rosterIds: [1, 2], myRosterId: 1, picks: [] });
    const result = analyzeLeagueEvBank({
      snap,
      playerValueMap: new Map(),
      getAdp: () => null,
    });
    check("ranked_count = 0", result.ranked_count === 0);
    check("my_rank null", result.my_rank == null);
    check("my_percentile null", result.my_percentile == null);
    check("league_avg null", result.league_avg == null);
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
