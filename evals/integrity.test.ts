/**
 * Engine integrity-suite regression tests. Pure functions, no network.
 *
 *   npx tsx --tsconfig tsconfig.json evals/integrity.test.ts
 *
 * Locks in the LaPorta-class detection guarantees plus the rest of
 * the Tier 1 / Tier 2 risks (drafted-in-pool, roster identification,
 * position normalization, format detection, starter-reqs drift,
 * availability coherence). Each test constructs a synthetic
 * LeagueSnapshot fragment and asserts the check fires (or doesn't).
 */

import {
  runEngineIntegrityChecks,
  type IntegrityIssue,
} from "../src/lib/players/integrity";
import type { LeagueSnapshot } from "../src/lib/strategy/league-state/snapshot";
import type { AvailablePlayer } from "../src/lib/players/available";
import type { PlayerValue } from "../src/lib/players/values";
import type { Decision } from "../src/lib/strategy/decision-synthesis/types";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, note?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}${note ? ` (${note})` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${note ? ` (${note})` : ""}`);
  }
}

function has(issues: IntegrityIssue[], kind: string): boolean {
  return issues.some((i) => i.kind === kind);
}

function makeSnapshot(overrides: Partial<LeagueSnapshot> = {}): LeagueSnapshot {
  return {
    league_id: "test",
    season: "2026",
    total_teams: 12,
    format: "1qb",
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
        owner_id: "user1",
        owner_name: "Test User",
        is_me: true,
        position_counts: { QB: 1, RB: 1, WR: 1, TE: 0, K: 0, DST: 0 },
        position_ranks: { QB: [], RB: [], WR: [], TE: [], K: [], DST: [] },
        player_ids: ["p1", "p2", "p3"],
        avg_age: 26,
        wins: null,
        losses: null,
        ties: null,
      },
    ],
    my_roster_id: 1,
    draft: {
      status: "drafting",
      type: "snake",
      rounds: 30,
      reversal_round: null,
      slot_to_roster_id: { 1: 1 },
      my_slot: 1,
      next_pick_no: 60,
      picks_made: [],
      traded_picks: [],
      my_pick_schedule: [],
    },
    agg: {
      teams_without_position_after_round: () => 0,
      avg_position_count: () => 0,
    },
    ...overrides,
  } as unknown as LeagueSnapshot;
}

function makeAvailable(p: Partial<AvailablePlayer>): AvailablePlayer {
  return {
    id: p.id ?? "x",
    name: p.name ?? "Test Player",
    position: p.position ?? "RB",
    team: p.team ?? "DAL",
    age: p.age ?? 25,
    search_rank: p.search_rank ?? 50,
    adp: p.adp ?? 60,
    is_rookie: p.is_rookie ?? false,
    dynasty_rank: p.dynasty_rank ?? 50,
  } as AvailablePlayer;
}

function makeValue(p: Partial<PlayerValue>): PlayerValue {
  return {
    player_id: p.player_id ?? "x",
    name: p.name ?? "Test Player",
    position: p.position ?? "RB",
    team: p.team ?? "DAL",
    value: p.value ?? 50,
    raw_value: p.raw_value ?? 5000,
    overall_rank: p.overall_rank ?? 50,
    position_rank: p.position_rank ?? 10,
  };
}

function run() {
  console.log("── 1. pool_missing_player ──");
  {
    const snap = makeSnapshot();
    const available = [makeAvailable({ id: "p1" })];
    const playerValues = new Map<string, PlayerValue>([
      ["p1", makeValue({ player_id: "p1", overall_rank: 1 })],
      ["LAPORTA", makeValue({ player_id: "LAPORTA", name: "Sam LaPorta", overall_rank: 50, position: "TE" })],
    ]);
    const r = runEngineIntegrityChecks({
      snap, available, playerValues, decision: null,
      rosterPositionsRaw: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN", "BN", "BN", "BN", "BN"],
      playersFetchedAt: Date.now(),
    });
    check("LaPorta-class missing player fires severe", has(r.issues, "pool_missing_player"));
  }

  console.log("\n── 2. drafted_in_available ──");
  {
    const snap = makeSnapshot({
      draft: {
        ...makeSnapshot().draft,
        picks_made: [{ pick_no: 1, round: 1, roster_id: 1, player_id: "p1" } as never],
      } as never,
    });
    const available = [makeAvailable({ id: "p1", name: "Should Be Drafted" })];
    const r = runEngineIntegrityChecks({
      snap, available, playerValues: new Map(), decision: null,
      rosterPositionsRaw: ["QB"], playersFetchedAt: Date.now(),
    });
    check("drafted player appearing in available fires severe", has(r.issues, "drafted_in_available"));
  }

  console.log("\n── 3. roster_not_found ──");
  {
    const snap = makeSnapshot({
      rosters: [
        { ...makeSnapshot().rosters[0], is_me: false } as never,
      ],
    });
    const r = runEngineIntegrityChecks({
      snap, available: [], playerValues: new Map(), decision: null,
      rosterPositionsRaw: ["QB"], playersFetchedAt: Date.now(),
    });
    check("missing 'me' roster fires severe", has(r.issues, "roster_not_found"));
  }

  console.log("\n── 4. position_unknown ──");
  {
    // Roster has 5 player_ids but position_counts only sums to 3:
    // 2 unaccounted for.
    const snap = makeSnapshot({
      rosters: [
        {
          ...makeSnapshot().rosters[0],
          player_ids: ["p1", "p2", "p3", "p4", "p5"],
          position_counts: { QB: 1, RB: 1, WR: 1, TE: 0, K: 0, DST: 0 },
        } as never,
      ],
    });
    const r = runEngineIntegrityChecks({
      snap, available: [], playerValues: new Map(), decision: null,
      rosterPositionsRaw: ["QB"], playersFetchedAt: Date.now(),
    });
    check("unknown-position players fire severe", has(r.issues, "position_unknown"));
  }
  {
    // Clean roster: counts sum equals player_ids length.
    const snap = makeSnapshot();
    const r = runEngineIntegrityChecks({
      snap, available: [], playerValues: new Map(), decision: null,
      rosterPositionsRaw: ["QB"], playersFetchedAt: Date.now(),
    });
    check("clean roster does NOT fire position_unknown", !has(r.issues, "position_unknown"));
  }

  console.log("\n── 5. format_mismatch ──");
  {
    // roster_positions has SF variant but starter_slots.superflex is 0.
    const snap = makeSnapshot();
    const r = runEngineIntegrityChecks({
      snap, available: [], playerValues: new Map(), decision: null,
      rosterPositionsRaw: ["QB", "SUPER_FLEX", "RB"],
      playersFetchedAt: Date.now(),
    });
    check("raw SF slot but parsed superflex=0 fires severe", has(r.issues, "format_mismatch"));
  }
  {
    // Both raw and parsed agree on superflex=0.
    const snap = makeSnapshot();
    const r = runEngineIntegrityChecks({
      snap, available: [], playerValues: new Map(), decision: null,
      rosterPositionsRaw: ["QB", "RB"],
      playersFetchedAt: Date.now(),
    });
    check("aligned format does NOT fire mismatch", !has(r.issues, "format_mismatch"));
  }

  console.log("\n── 6. cache_stale ──");
  {
    // 50 hours old → severe.
    const oldEnough = Date.now() - 50 * 60 * 60 * 1000;
    const snap = makeSnapshot();
    const r = runEngineIntegrityChecks({
      snap, available: [], playerValues: new Map(), decision: null,
      rosterPositionsRaw: ["QB"], playersFetchedAt: oldEnough,
    });
    const stale = r.issues.find((i) => i.kind === "cache_stale");
    check("cache 50h old fires severe", !!stale && stale.severity === "severe");
  }
  {
    // 30 hours old → warning.
    const stalish = Date.now() - 30 * 60 * 60 * 1000;
    const snap = makeSnapshot();
    const r = runEngineIntegrityChecks({
      snap, available: [], playerValues: new Map(), decision: null,
      rosterPositionsRaw: ["QB"], playersFetchedAt: stalish,
    });
    const stale = r.issues.find((i) => i.kind === "cache_stale");
    check("cache 30h old fires warning", !!stale && stale.severity === "warning");
  }
  {
    // 1 hour old → no issue.
    const fresh = Date.now() - 60 * 60 * 1000;
    const snap = makeSnapshot();
    const r = runEngineIntegrityChecks({
      snap, available: [], playerValues: new Map(), decision: null,
      rosterPositionsRaw: ["QB"], playersFetchedAt: fresh,
    });
    check("fresh cache does NOT fire stale", !has(r.issues, "cache_stale"));
  }

  console.log("\n── 7. starter_reqs_drift ──");
  {
    // Force a shape that would diverge: starter_slots.hard.QB = 1,
    // superflex = 1. effectiveStarterReqs returns QB:2.
    // buildFormatRulesFromSnapshot returns qb_starters_max:2. Aligned.
    const snap = makeSnapshot({
      format: "superflex",
      starter_slots: {
        hard: { QB: 1, RB: 2, WR: 2, TE: 1, K: 0, DST: 0 },
        flex: 1, superflex: 1, rec_flex: 0, bench: 5,
      },
    });
    const r = runEngineIntegrityChecks({
      snap, available: [], playerValues: new Map(), decision: null,
      rosterPositionsRaw: ["QB", "SUPER_FLEX", "RB", "RB"],
      playersFetchedAt: Date.now(),
    });
    check("aligned QB requirement does NOT fire drift", !has(r.issues, "starter_reqs_drift"));
  }

  console.log("\n── 8. availability_incoherent ──");
  {
    // Build a Decision where Higgins is "probably_gone" but appears
    // as a target name in next_picks_plan.
    const snap = makeSnapshot();
    const decision = {
      pick_label: "5.11",
      pick_no: 59,
      picks_until_me: 0,
      density: "cluster",
      window_frame: { direction: "win_now", strength: "moderate", label: "Lean win-now", sentence: "" },
      recommendation: { player_id: "love", name: "Jordan Love", position: "QB", team: "GB", age: 27, search_rank: 49, adp: 49, is_rookie: false, value: 39, primary_reason: "", rule: "fill_starter_urgent" },
      top_candidates: [
        { player_id: "love", name: "Jordan Love", position: "QB", team: "GB", age: 27, search_rank: 49, adp: 49, is_rookie: false, value: 39, primary_reason: "", rule: "fill_starter_urgent", is_lean: true, availability_next_pick: "probably_gone", constraint_note: null },
        { player_id: "higgins", name: "Tee Higgins", position: "WR", team: "CIN", age: 27, search_rank: 62, adp: 62, is_rookie: false, value: 32, primary_reason: "", rule: "fill_starter_urgent", is_lean: false, availability_next_pick: "probably_gone", constraint_note: null },
      ],
      quadrant_candidates: [],
      why: [],
      tradeoff: { gains: [], losses: [] },
      next_picks_plan: [
        { pick_label: "6.2", pick_no: 62, density: "cluster", target_position: "WR", target_names: ["Tee Higgins"], reason: "Fill WR hole", confidence: "high", alternates: [] },
      ],
      scarcity_callout: null,
      emergency_trade_up: null,
      counter_view: null,
    } as unknown as Decision;
    const r = runEngineIntegrityChecks({
      snap, available: [], playerValues: new Map(), decision,
      rosterPositionsRaw: ["QB"], playersFetchedAt: Date.now(),
    });
    check("probably_gone name appearing in next picks fires severe", has(r.issues, "availability_incoherent"));
  }

  console.log("\n── 9. cross_source_position ──");
  {
    const snap = makeSnapshot();
    const available = [
      makeAvailable({ id: "p1", name: "Conflicted Player", position: "TE" }),
    ];
    const playerValues = new Map<string, PlayerValue>([
      ["p1", makeValue({ player_id: "p1", name: "Conflicted Player", position: "WR", overall_rank: 30 })],
    ]);
    const r = runEngineIntegrityChecks({
      snap, available, playerValues, decision: null,
      rosterPositionsRaw: ["QB"], playersFetchedAt: Date.now(),
    });
    const issue = r.issues.find((i) => i.kind === "cross_source_position");
    check("source disagreement fires warning", !!issue && issue.severity === "warning");
  }

  console.log("\n── 10. clean snapshot is OK ──");
  {
    const snap = makeSnapshot();
    const r = runEngineIntegrityChecks({
      snap, available: [], playerValues: new Map(), decision: null,
      rosterPositionsRaw: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN", "BN", "BN", "BN", "BN"],
      playersFetchedAt: Date.now(),
    });
    check("clean snapshot returns severity ok", r.severity === "ok", `severity: ${r.severity}, issues: ${r.issues.length}`);
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
