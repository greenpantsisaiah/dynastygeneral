/**
 * EV Bank regression. Locks the math + range envelope per user feedback
 * 2026-05-08.
 *
 *   npx tsx --tsconfig tsconfig.json evals/ev-bank.test.ts
 *
 * Covers:
 *   - Per-pick ev_delta = (value / 100) * (pick_no - ADP)
 *   - Bargain (player fell past ADP): positive delta
 *   - Sharp lock (player taken before ADP): negative delta
 *   - Total = sum of resolved entries
 *   - Range envelope: +/- ADP_NOISE_PICKS (3) on every pick
 *   - Ungraded entries (missing value or ADP): excluded from sum,
 *     surfaced in entries with ev_delta = null
 *   - Empty roster: returns null
 */

import { analyzeEvBank } from "../src/lib/strategy/ev-bank/analyze";
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

function makeSnapshot(myPicks: Array<{ pick_no: number; player_id: string }>): LeagueSnapshot {
  return {
    league_id: "test",
    season: "2026",
    total_teams: 12,
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
    rosters: [
      {
        roster_id: 1,
        owner_id: "u1",
        owner_name: "Me",
        is_me: true,
        position_counts: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 },
        position_ranks: { QB: [], RB: [], WR: [], TE: [], K: [], DST: [] },
        player_ids: myPicks.map((p) => p.player_id),
        avg_age: 26,
        starter_avg_age: 26,
        starter_talent_score: 0.5,
        wins: 0,
        losses: 0,
        ties: 0,
      },
    ],
    my_roster_id: 1,
    draft: {
      status: "drafting",
      type: "snake",
      rounds: 20,
      reversal_round: null,
      slot_to_roster_id: { 1: 1 },
      my_slot: 1,
      next_pick_no: null,
      picks_made: myPicks.map((p) => ({
        pick_no: p.pick_no,
        round: Math.ceil(p.pick_no / 12),
        roster_id: 1,
        player_id: p.player_id,
        position: "WR",
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

function makeNameLookup(map: Record<string, { name: string; position: string | null }>) {
  return (id: string) => map[id] ?? null;
}

function makeAdpLookup(map: Record<string, number | null>) {
  return (id: string) => map[id] ?? null;
}

function run() {
  console.log("\n── 1. Single bargain pick: positive ev_delta ──");
  {
    // Player value 50, taken at pick 20 vs ADP 15. picks past ADP = 5.
    // ev_delta = (50/100) * (20 - 15) = 0.5 * 5 = 2.5
    const snap = makeSnapshot([{ pick_no: 20, player_id: "p1" }]);
    const result = analyzeEvBank({
      snap,
      playerValueMap: new Map([["p1", { value: 50, overall_rank: 30 }]]),
      playerNameLookup: makeNameLookup({ p1: { name: "Bargain WR", position: "WR" } }),
      getAdp: makeAdpLookup({ p1: 15 }),
    });
    check("ev bank not null", result != null);
    check("entry count = 1", result?.entries.length === 1);
    check("ev_delta = 2.5", result != null && approxEqual(result.entries[0].ev_delta!, 2.5), `actual: ${result?.entries[0].ev_delta}`);
    check("total = 2.5", result != null && approxEqual(result.total_ev!, 2.5), `actual: ${result?.total_ev}`);
    check("tier = solid (between -5 and 5)", result?.tier === "solid");
    check("single pick: no range envelope", result?.range_low == null && result?.range_high == null);
  }

  console.log("\n── 2. Sharp lock: negative ev_delta ──");
  {
    // Player value 80 (Mahomes-tier), taken at pick 50 vs ADP 65.
    // ev_delta = (80/100) * (50 - 65) = 0.8 * -15 = -12
    const snap = makeSnapshot([{ pick_no: 50, player_id: "p1" }]);
    const result = analyzeEvBank({
      snap,
      playerValueMap: new Map([["p1", { value: 80, overall_rank: 10 }]]),
      playerNameLookup: makeNameLookup({ p1: { name: "Sharp QB", position: "QB" } }),
      getAdp: makeAdpLookup({ p1: 65 }),
    });
    check("ev_delta = -12", result != null && approxEqual(result.entries[0].ev_delta!, -12), `actual: ${result?.entries[0].ev_delta}`);
    check("total = -12", result != null && approxEqual(result.total_ev!, -12), `actual: ${result?.total_ev}`);
    check("tier = mixed (between -15 and -5)", result?.tier === "mixed", `actual: ${result?.tier}`);
  }

  console.log("\n── 3. Mixed picks: bargain + sharp lock cancel partially ──");
  {
    const snap = makeSnapshot([
      { pick_no: 5, player_id: "p1" },   // bargain
      { pick_no: 50, player_id: "p2" },  // sharp lock
    ]);
    const result = analyzeEvBank({
      snap,
      // p1: value 95, ADP 1, taken at 5. ev = 0.95 * 4 = 3.8
      // p2: value 80, ADP 65, taken at 50. ev = 0.8 * -15 = -12
      // Total: 3.8 - 12 = -8.2
      playerValueMap: new Map([
        ["p1", { value: 95, overall_rank: 1 }],
        ["p2", { value: 80, overall_rank: 10 }],
      ]),
      playerNameLookup: makeNameLookup({
        p1: { name: "Bargain", position: "WR" },
        p2: { name: "Sharp", position: "QB" },
      }),
      getAdp: makeAdpLookup({ p1: 1, p2: 65 }),
    });
    check("entry count = 2", result?.entries.length === 2);
    check("total ≈ -8.2", result != null && approxEqual(result.total_ev!, -8.2, 0.1), `actual: ${result?.total_ev}`);
    check("range envelope present (2+ resolved)", result?.range_low != null && result?.range_high != null);
    // Range: shift +3 → bank smaller; shift -3 → bank bigger.
    // High = 3.8 - (12 + (0.8 + 0.95) * 3) ≈ 3.8 - 12 + 5.25 = -2.95
    // Low = 3.8 - (12 - (0.8 + 0.95) * 3) ≈ 3.8 - 12 - 5.25 = -13.45
    check("range_low < total", result != null && result.range_low! < result.total_ev!, `low: ${result?.range_low}, total: ${result?.total_ev}`);
    check("range_high > total", result != null && result.range_high! > result.total_ev!, `high: ${result?.range_high}, total: ${result?.total_ev}`);
  }

  console.log("\n── 4. Ungraded entries excluded from sum, surfaced in entries ──");
  {
    const snap = makeSnapshot([
      { pick_no: 5, player_id: "p1" },
      { pick_no: 17, player_id: "p2" },  // missing ADP
      { pick_no: 29, player_id: "p3" },  // missing value
    ]);
    const result = analyzeEvBank({
      snap,
      playerValueMap: new Map([
        ["p1", { value: 50, overall_rank: 20 }],
        ["p3", { value: 0, overall_rank: null }],  // value present but 0; treated as resolved
      ]),
      playerNameLookup: makeNameLookup({
        p1: { name: "P1", position: "WR" },
        p2: { name: "P2", position: "RB" },
        p3: { name: "P3", position: "TE" },
      }),
      getAdp: makeAdpLookup({ p1: 1, p2: null, p3: 30 }),
    });
    check("3 entries surfaced (all picks visible)", result?.entries.length === 3);
    const ungraded = result?.entries.find((e) => e.player_id === "p2");
    check("p2 ev_delta is null (no ADP)", ungraded?.ev_delta == null);
    // p1 value=50, pick=5, ADP=1: 0.5 * 4 = 2.0
    // p3 value=0, pick=29, ADP=30: 0 * -1 = 0
    // total = 2.0
    check("total only sums resolved entries", result != null && approxEqual(result.total_ev!, 2.0), `actual: ${result?.total_ev}`);
  }

  console.log("\n── 5. Pick label format (snake) ──");
  {
    // Pick 56 in 12-team snake = round 5, slot 8 = "5.8"
    const snap = makeSnapshot([{ pick_no: 56, player_id: "p1" }]);
    const result = analyzeEvBank({
      snap,
      playerValueMap: new Map([["p1", { value: 50, overall_rank: 50 }]]),
      playerNameLookup: makeNameLookup({ p1: { name: "Test", position: "WR" } }),
      getAdp: makeAdpLookup({ p1: 50 }),
    });
    check("pick_label = '5.8'", result?.entries[0].pick_label === "5.8", `actual: ${result?.entries[0].pick_label}`);
  }

  console.log("\n── 6. Empty roster: null ──");
  {
    const snap = makeSnapshot([]);
    const result = analyzeEvBank({
      snap,
      playerValueMap: new Map(),
      playerNameLookup: makeNameLookup({}),
      getAdp: makeAdpLookup({}),
    });
    check("returns null for empty picks", result == null);
  }

  console.log("\n── 7. All picks at consensus: total ≈ 0, tier solid ──");
  {
    const snap = makeSnapshot([
      { pick_no: 5, player_id: "p1" },
      { pick_no: 17, player_id: "p2" },
    ]);
    const result = analyzeEvBank({
      snap,
      playerValueMap: new Map([
        ["p1", { value: 60, overall_rank: 5 }],
        ["p2", { value: 50, overall_rank: 17 }],
      ]),
      playerNameLookup: makeNameLookup({
        p1: { name: "P1", position: "WR" },
        p2: { name: "P2", position: "RB" },
      }),
      getAdp: makeAdpLookup({ p1: 5, p2: 17 }),
    });
    check("total ≈ 0", result != null && approxEqual(result.total_ev!, 0), `actual: ${result?.total_ev}`);
    check("tier = solid", result?.tier === "solid");
    check("summary mentions 'at market rate'", result?.summary.includes("at market rate"), `summary: ${result?.summary}`);
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
