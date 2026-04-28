/**
 * future_stash regression. Locks in the rule-order fix from the
 * Schultz-still-leans bug 2026-04-27.
 *
 *   npx tsx --tsconfig tsconfig.json evals/future-stash.test.ts
 *
 * Pinned scenarios:
 *
 * 1. ALL-saturated roster (3 QB / 5 RB / 6 WR / 2 TE in PPR, hard
 *    QB:1 / RB:2 / WR:2 / TE:1 + 3 flex). future_stash must FIRE
 *    and surface a young (age <= 23) candidate.
 *
 * 2. Saturated TE (3 TEs) + non-saturated WR (2 WRs in 2-WR-hard
 *    format). future_stash must NOT fire because not ALL positions
 *    are saturated.
 *
 * 3. Rule-order regression: with all-saturated, a young player
 *    (Mason Taylor, age 21) AND an older saturated faller (Schultz,
 *    age 29) both in available, future_stash must claim the young
 *    one BEFORE position_steal locks the score. The young player
 *    wins the lean at score 50, not 38.
 */

import {
  synthesizeDecision,
} from "../src/lib/strategy/decision-synthesis/synthesize";
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
}): LeagueSnapshot {
  return {
    league_id: "test",
    season: "2026",
    total_teams: 12,
    format: opts.superflex > 0 ? "superflex" : "1qb",
    scoring: ["PPR"],
    starter_slots: {
      hard: { ...opts.hard, K: 0, DST: 0 },
      flex: opts.flex,
      superflex: opts.superflex,
      rec_flex: 0,
      bench: 5,
    },
    rosters: [
      {
        roster_id: 1,
        owner_id: "u1",
        owner_name: "Test",
        is_me: true,
        position_counts: { ...opts.myCounts, K: 0, DST: 0 },
        position_ranks: { QB: [], RB: [], WR: [], TE: [], K: [], DST: [] },
        player_ids: [],
        avg_age: 26,
        wins: 0,
        losses: 0,
        ties: 0,
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
      next_pick_no: 200,
      picks_made: [],
      traded_picks: [],
      my_pick_schedule: [
        {
          pick_no: 200,
          round: 17,
          pick_label: "17.11",
          gap_to_prev: 12,
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
  is_rookie?: boolean;
  adp?: number;
  search_rank?: number;
}): AvailablePlayer {
  return {
    id: `p${nextId++}`,
    name: opts.name,
    position: opts.position,
    team: "TST",
    age: opts.age,
    yearsExp: opts.is_rookie ? 0 : Math.max(1, opts.age - 22),
    search_rank: opts.search_rank ?? 200,
    dynasty_rank: opts.search_rank ?? 200,
    adp: opts.adp ?? null,
    adp_variant: "dynasty_ppr",
    is_rookie: opts.is_rookie ?? false,
  } as unknown as AvailablePlayer;
}

function emptyArchetypes(): RankedArchetype[] {
  return [];
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
  console.log("\n── 1. ALL-saturated roster: future_stash fires ──");
  {
    const snap = makeSnapshot({
      myCounts: { QB: 3, RB: 5, WR: 6, TE: 2 },
      hard: { QB: 1, RB: 2, WR: 2, TE: 1 },
      flex: 3,
      superflex: 0,
    });
    const available: AvailablePlayer[] = [
      makePlayer({ name: "Mason Taylor", position: "TE", age: 21, adp: 124, search_rank: 180 }),
      makePlayer({ name: "Dalton Schultz", position: "TE", age: 29, adp: 158, search_rank: 221 }),
      makePlayer({ name: "Kirk Cousins", position: "QB", age: 37, adp: 238, search_rank: 368 }),
      makePlayer({ name: "Ted Hurst", position: "WR", age: 21, adp: 216, search_rank: 196 }),
      makePlayer({ name: "Max Klare", position: "TE", age: 22, adp: 227, search_rank: 212 }),
    ];
    const decision = synthesizeDecision({
      snap,
      available,
      ranked: emptyArchetypes(),
      windows: emptyWindows(),
      picks_until_me: 0,
      declared_window: null,
    });
    check(
      "lean rule is future_stash",
      decision?.recommendation.rule === "future_stash",
      `actual: ${decision?.recommendation.rule}`,
    );
    check(
      "lean is a young/rookie candidate (age <= 23 OR rookie)",
      Boolean(
        decision &&
          ((decision.recommendation.age != null &&
            decision.recommendation.age <= 23) ||
            decision.recommendation.is_rookie),
      ),
      `actual: ${decision?.recommendation.name} (age ${decision?.recommendation.age})`,
    );
    check(
      "lean is NOT Schultz (saturated faller, age 29)",
      decision?.recommendation.name !== "Dalton Schultz",
      `actual: ${decision?.recommendation.name}`,
    );
  }

  console.log("\n── 2. Partially saturated: future_stash does NOT fire ──");
  {
    // 3 TE saturated, 2 WR not saturated (hard.WR=3 means 2 < 3, hole exists)
    const snap = makeSnapshot({
      myCounts: { QB: 1, RB: 5, WR: 2, TE: 3 },
      hard: { QB: 1, RB: 2, WR: 3, TE: 1 },
      flex: 2,
      superflex: 0,
    });
    const available: AvailablePlayer[] = [
      makePlayer({ name: "Mason Taylor", position: "TE", age: 21, adp: 124, search_rank: 180 }),
      makePlayer({ name: "Best WR", position: "WR", age: 25, adp: 100, search_rank: 50 }),
    ];
    const decision = synthesizeDecision({
      snap,
      available,
      ranked: emptyArchetypes(),
      windows: emptyWindows(),
      picks_until_me: 0,
      declared_window: null,
    });
    check(
      "lean rule is NOT future_stash (WR hole still open)",
      decision?.recommendation.rule !== "future_stash",
      `actual: ${decision?.recommendation.rule}`,
    );
  }

  console.log("\n── 3. Rule order: future_stash claims young before position_steal ──");
  {
    // The original bug: position_steal claimed Mason Taylor at saturated cap
    // 38 BEFORE future_stash could bid 50. After fix: future_stash runs first.
    const snap = makeSnapshot({
      myCounts: { QB: 3, RB: 5, WR: 6, TE: 2 },
      hard: { QB: 1, RB: 2, WR: 2, TE: 1 },
      flex: 3,
      superflex: 0,
    });
    const available: AvailablePlayer[] = [
      // Mason Taylor: top of TE position (KTC 180), age 21, ADP 124. With
      // currentPickNo 200 and ADP 124, gap = 76. Position_steal would
      // fire and claim him at saturated cap ~38. future_stash should
      // claim him first at 50.
      makePlayer({ name: "Mason Taylor", position: "TE", age: 21, adp: 124, search_rank: 180 }),
      makePlayer({ name: "Dalton Schultz", position: "TE", age: 29, adp: 158, search_rank: 221 }),
    ];
    const decision = synthesizeDecision({
      snap,
      available,
      ranked: emptyArchetypes(),
      windows: emptyWindows(),
      picks_until_me: 0,
      declared_window: null,
    });
    check(
      "Mason Taylor wins lean (future_stash beats position_steal in dedup race)",
      decision?.recommendation.name === "Mason Taylor",
      `actual: ${decision?.recommendation.name}`,
    );
    check(
      "winning rule is future_stash (NOT saturated position_steal)",
      decision?.recommendation.rule === "future_stash",
      `actual: ${decision?.recommendation.rule}`,
    );
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
