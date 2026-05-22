/**
 * push_path reach + met-position regression. Locks the 2026-05-21
 * Mark Andrews bug: with all starter quotas met, fill_starter could
 * not fire, so push_path (TE Streamer, 100% drift, "acquisition")
 * crowned a starter-met TE going ~40 picks past ADP (-3 EV) as THE
 * CALL, contradicting every value/lane/path list.
 *
 *   npx tsx --tsconfig tsconfig.json evals/push-path-reach.test.ts
 *
 * Fix (synthesize.ts push_path): never push a position whose starter
 * need is already met (that is executing, take value), and never reach
 * for a piece that will clearly survive (gap <= PUSH_PATH_REACH_LIMIT).
 */

import { synthesizeDecision } from "../src/lib/strategy/decision-synthesis/synthesize";
import type { LeagueSnapshot } from "../src/lib/strategy/league-state/snapshot";
import type { AvailablePlayer } from "../src/lib/players/available";
import type { RankedArchetype } from "../src/lib/strategy/archetypes/schema";
import type { WindowsResult } from "../src/lib/strategy/windows/compute";

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

function makeSnapshot(opts: {
  myCounts: { QB: number; RB: number; WR: number; TE: number };
  hard: { QB: number; RB: number; WR: number; TE: number };
  flex: number;
  superflex: number;
  currentPickNo: number;
  nextPickNo: number;
}): LeagueSnapshot {
  const totalTeams = 12;
  const rosters: LeagueSnapshot["rosters"] = [];
  for (let rid = 1; rid <= totalTeams; rid++) {
    const isMe = rid === 1;
    const counts = isMe
      ? { ...opts.myCounts, K: 0, DST: 0 }
      : { QB: 1, RB: 1, WR: 1, TE: 1, K: 0, DST: 0 };
    rosters.push({
      roster_id: rid,
      owner_id: `u${rid}`,
      owner_name: isMe ? "Me" : `Opp${rid}`,
      is_me: isMe,
      position_counts: counts,
      position_ranks: { QB: [], RB: [], WR: [], TE: [], K: [], DST: [] },
      player_ids: [],
      avg_age: 26,
      starter_avg_age: 26,
      starter_talent_score: 0.5,
      wins: 0,
      losses: 0,
      ties: 0,
    });
  }
  const slot_to_roster_id: Record<number, number> = {};
  for (let s = 1; s <= totalTeams; s++) slot_to_roster_id[s] = s;
  return {
    league_id: "test",
    season: "2026",
    total_teams: totalTeams,
    format: opts.superflex > 0 ? "superflex" : "1qb",
    league_type: "keeper",
    max_keepers: 3,
    scoring: ["PPR", "TE-premium"],
    starter_slots: {
      hard: { ...opts.hard, K: 0, DST: 0 },
      flex: opts.flex,
      superflex: opts.superflex,
      rec_flex: 0,
      bench: 5,
    },
    rosters,
    my_roster_id: 1,
    draft: {
      status: "drafting",
      type: "snake",
      rounds: 20,
      reversal_round: null,
      slot_to_roster_id,
      my_slot: 1,
      next_pick_no: opts.currentPickNo,
      picks_made: [],
      traded_picks: [],
      my_pick_schedule: [
        {
          pick_no: opts.currentPickNo,
          round: Math.ceil(opts.currentPickNo / 12),
          pick_label: `${Math.ceil(opts.currentPickNo / 12)}.X`,
          gap_to_prev: 12,
          gap_to_next: opts.nextPickNo - opts.currentPickNo,
          density_kind: "normal",
        },
        {
          pick_no: opts.nextPickNo,
          round: Math.ceil(opts.nextPickNo / 12),
          pick_label: `${Math.ceil(opts.nextPickNo / 12)}.X`,
          gap_to_prev: opts.nextPickNo - opts.currentPickNo,
          gap_to_next: 12,
          density_kind: "normal",
        },
      ],
    },
    agg: {
      teams_without_position_after_round: () => 0,
      avg_position_count: () => 0,
    },
  } as unknown as LeagueSnapshot;
}

let nextId = 1;
function makePlayer(opts: {
  name: string;
  position: "QB" | "RB" | "WR" | "TE";
  age: number;
  adp?: number;
  search_rank?: number;
}): AvailablePlayer {
  return {
    id: `p${nextId++}`,
    name: opts.name,
    position: opts.position,
    team: "TST",
    age: opts.age,
    yearsExp: Math.max(1, opts.age - 22),
    search_rank: opts.search_rank ?? 200,
    dynasty_rank: opts.search_rank ?? 200,
    adp: opts.adp ?? null,
    adp_variant: "dynasty_superflex",
    is_rookie: false,
  } as unknown as AvailablePlayer;
}

function teStreamerPushing(teId: string): RankedArchetype {
  return {
    archetype: {
      id: "te-streamer",
      name: "TE Streamer",
      category: "TE",
      tagline: "",
      horizon: 0,
    },
    drift_score: 1.0,
    opening_boost: 0,
    total_score: 1.0,
    trajectory: { direction: "flat", reasons: [] },
    live_gamble: { statement: "", likelihood: 0 },
    live_risks: [],
    active_openings: [],
    phase: "acquisition",
    top_candidates: [
      { player_id: teId, name: "Reach TE", position: "TE", reason: "" },
    ],
  } as unknown as RankedArchetype;
}

function emptyWindows(): WindowsResult {
  return {
    declared: null,
    auto: { label: "Balanced", strength: "none" as const, sentence: "" },
    win_now_score: 50,
    future_score: 50,
    composite: 0,
  } as unknown as WindowsResult;
}

function run() {
  console.log("\n── 1. All starters met: push_path can't crown a reach TE ──");
  {
    // All starter quotas well over-met, so fill_starter is silent.
    // TE Streamer at 100% drift pushes a TE going 45 picks past ADP.
    // The reach must NOT become the call.
    const snap = makeSnapshot({
      myCounts: { QB: 3, RB: 4, WR: 5, TE: 2 },
      hard: { QB: 1, RB: 2, WR: 2, TE: 1 },
      flex: 1,
      superflex: 1,
      currentPickNo: 100,
      nextPickNo: 110,
    });
    const reachTe = makePlayer({
      name: "Reach TE",
      position: "TE",
      age: 25,
      adp: 145, // 45 picks past the current pick = a reach
      search_rank: 60,
    });
    const valueWr = makePlayer({
      name: "Value WR",
      position: "WR",
      age: 24,
      adp: 80, // 20 picks past current = available below consensus
      search_rank: 70,
    });
    const fillerRb = makePlayer({
      name: "Filler RB",
      position: "RB",
      age: 25,
      adp: 92,
      search_rank: 90,
    });
    const decision = synthesizeDecision({
      snap,
      available: [reachTe, valueWr, fillerRb],
      ranked: [teStreamerPushing(reachTe.id)],
      windows: emptyWindows(),
      picks_until_me: 0,
    });
    check(
      "the reach TE is NOT the standing call",
      decision?.recommendation.name !== "Reach TE",
      `actual: ${decision?.recommendation.name}`,
    );
    check(
      "the call did not come from push_path",
      decision?.recommendation.rule !== "push_path",
      `actual rule: ${decision?.recommendation.rule}`,
    );
    const recAdp = decision?.recommendation.adp ?? null;
    check(
      "the call is not a reach (ADP not far past the current pick)",
      recAdp == null || 100 - recAdp > -8,
      `rec ADP: ${recAdp}`,
    );
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
