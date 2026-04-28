/**
 * SWOT compute regression tests. Pinned to the format-aware bugs that
 * surfaced in the wild.
 *
 *   npx tsx --tsconfig tsconfig.json evals/swot.test.ts
 *
 * Lock-in tests:
 *
 *   - Superflex QB starter math. SF leagues have hard.QB = 1 plus a
 *     SUPER_FLEX slot. The canonical helper folds them into
 *     qb_starters_max = 2. SWOT must report "2 starter slots", not 1.
 *     Founder bug 2026-04-26: SWOT card said "QB room locked (3 bodies
 *     for 1 starter slot)" in a SF league because the compute branched
 *     on starter_slots.hard.QB directly.
 *
 *   - 1QB starter math. Standard 1QB leagues should still report 1.
 *
 *   - Flex eligibility folds into RB/WR/TE caps. A 1-FLEX 2-WR league
 *     gives wr_starters_max = 3, not 2.
 */

import { computeSwot } from "../src/lib/strategy/swot/compute";
import type { LeagueSnapshot } from "../src/lib/strategy/league-state/snapshot";
import type { LeagueOutlook } from "../src/lib/strategy/league-outlook/compute";

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
  format: "1qb" | "superflex" | "2qb";
  hard: { QB: number; RB: number; WR: number; TE: number };
  superflex: number;
  flex: number;
  recFlex?: number;
  scoring?: string[];
}): LeagueSnapshot {
  return {
    league_id: "test",
    season: "2026",
    total_teams: 12,
    format: opts.format,
    scoring: opts.scoring ?? ["PPR"],
    starter_slots: {
      hard: { ...opts.hard, K: 0, DST: 0 },
      flex: opts.flex,
      superflex: opts.superflex,
      rec_flex: opts.recFlex ?? 0,
      bench: 5,
    },
    rosters: [],
    my_roster_id: 1,
    draft: {
      status: "complete",
      type: "snake",
      rounds: 30,
      reversal_round: null,
      slot_to_roster_id: { 1: 1 },
      my_slot: 1,
      next_pick_no: 1,
      picks_made: [],
      traded_picks: [],
      my_pick_schedule: [],
    },
    agg: {
      teams_without_position_after_round: () => 0,
      avg_position_count: () => 0,
    },
  } as unknown as LeagueSnapshot;
}

function makeOutlook(opts: {
  myCounts: { QB: number; RB: number; WR: number; TE: number };
  totalTeams?: number;
}): LeagueOutlook {
  const total = opts.totalTeams ?? 12;
  const teams = [];
  // The user's roster.
  teams.push({
    roster_id: 1,
    owner_name: "Test Manager",
    is_me: true,
    position_counts: { ...opts.myCounts, K: 0, DST: 0 },
    avg_age: 26,
    player_ids_count: 20,
    win_now: 80,
    future: 70,
    forecast: [],
    peak_year: "2026",
    peak_score: 80,
    peak_tier: "Trending Contender" as const,
    trajectory: "flat" as const,
  });
  // Other teams: a spread so median computations have something to anchor.
  for (let i = 2; i <= total; i++) {
    teams.push({
      roster_id: i,
      owner_name: `Team ${i}`,
      is_me: false,
      position_counts: {
        QB: 2,
        RB: 3 + (i % 2),
        WR: 4 + (i % 3),
        TE: 2,
        K: 0,
        DST: 0,
      },
      avg_age: 25 + (i % 5),
      player_ids_count: 20,
      win_now: 70 + (i % 10),
      future: 65 + (i % 8),
      forecast: [],
      peak_year: "2026",
      peak_score: 70 + (i % 10),
      peak_tier: "Bubble" as const,
      trajectory: "flat" as const,
    });
  }
  return {
    teams,
    median_win_now: 75,
    median_future: 68,
    range_win_now: { min: 65, max: 85 },
    range_future: { min: 60, max: 78 },
  } as unknown as LeagueOutlook;
}

function run() {
  console.log("\n── 1. SF league: 3 QB bodies = adequate, not locked ─");
  {
    const snap = makeSnapshot({
      format: "superflex",
      hard: { QB: 1, RB: 2, WR: 2, TE: 1 },
      superflex: 1,
      flex: 1,
    });
    const outlook = makeOutlook({
      myCounts: { QB: 3, RB: 3, WR: 4, TE: 2 },
    });
    const swot = computeSwot(snap, outlook);
    // Original bug: SWOT said "QB room locked (3 bodies for 1 starter slot)"
    // because compute branched on starter_slots.hard.QB (which is 1 in SF).
    // Fix: starters = qb_starters_max = 2 in SF, so 3 < 2+2 = 4, NOT locked.
    // Copy refreshed 2026-04-27 to "QB bench depth locked / thin" so SWOT's
    // upper-bound framing doesn't read as a contradiction with Decision
    // card's realistic-max framing. Same math, clearer language.
    check(
      "SF QB with 3 bodies does NOT trip 'QB bench depth locked' (regression: 1-starter math is gone)",
      !swot.strengths.some(
        (s) =>
          s.voice === "coach" &&
          s.headline.startsWith("QB bench depth locked"),
      ),
      "locked threshold is starters+2 = 4 in SF; 3 bodies is adequate",
    );
    check(
      "SF QB with 3 bodies does NOT trip 'QB bench depth thin'",
      !swot.weaknesses.some(
        (s) =>
          s.voice === "coach" && s.headline.startsWith("QB bench depth thin"),
      ),
      "thin threshold is starters = 2; 3 bodies is above that",
    );
  }

  console.log("\n── 2. 1QB league reports 1 QB starter slot ─");
  {
    const snap = makeSnapshot({
      format: "1qb",
      hard: { QB: 1, RB: 2, WR: 2, TE: 1 },
      superflex: 0,
      flex: 1,
    });
    const outlook = makeOutlook({
      myCounts: { QB: 3, RB: 3, WR: 4, TE: 2 },
    });
    const swot = computeSwot(snap, outlook);
    const qbItem = [...swot.strengths, ...swot.weaknesses].find(
      (s) => s.headline.includes("QB bench depth") && s.voice === "coach",
    );
    check(
      "1QB QB bench-depth headline mentions 1 slot eligible",
      Boolean(qbItem) && qbItem!.headline.includes("1 slot eligible"),
      qbItem ? `headline: ${qbItem.headline}` : "qbItem missing",
    );
    check(
      "1QB with 3 QBs trips 'bench depth locked' (1 + 2 = 3)",
      swot.strengths.some(
        (s) =>
          s.voice === "coach" && s.headline.startsWith("QB bench depth locked"),
      ),
    );
  }

  console.log(
    "\n── 3. PPR-FLEX league counts flex into WR/RB cap ─",
  );
  {
    const snap = makeSnapshot({
      format: "1qb",
      hard: { QB: 1, RB: 2, WR: 2, TE: 1 },
      superflex: 0,
      flex: 1, // FLEX eligible for RB/WR/TE
    });
    // User: QB locked-zone, RB adequate, WR thin (= starters), TE adequate.
    // Forces the WR thin item to win the slice(0,4) cap without
    // competition from other Coach thin items.
    const outlook = makeOutlook({
      myCounts: { QB: 3, RB: 4, WR: 3, TE: 3 },
    });
    const swot = computeSwot(snap, outlook);
    const wrThin = [...swot.weaknesses].find(
      (s) => s.voice === "coach" && s.headline.startsWith("WR bench depth thin"),
    );
    check(
      "WR bench depth headline reports 3 slots eligible (2 hard + 1 flex), not 2",
      Boolean(wrThin) && wrThin!.headline.includes("3 slots eligible"),
      wrThin ? `headline: ${wrThin.headline}` : "no WR thin item fired",
    );
  }

  console.log(
    "\n── 4. SF QB with 4 bodies trips 'locked' ─",
  );
  {
    const snap = makeSnapshot({
      format: "superflex",
      hard: { QB: 1, RB: 2, WR: 2, TE: 1 },
      superflex: 1,
      flex: 1,
    });
    const outlook = makeOutlook({
      myCounts: { QB: 4, RB: 3, WR: 4, TE: 2 },
    });
    const swot = computeSwot(snap, outlook);
    const locked = swot.strengths.find(
      (s) => s.voice === "coach" && s.headline.startsWith("QB bench depth locked"),
    );
    check(
      "SF QB bench-depth locked headline reports 4 bodies, 2 slots eligible",
      Boolean(locked) &&
        locked!.headline.includes("4 bodies") &&
        locked!.headline.includes("2 slot"),
      locked ? `headline: ${locked.headline}` : "no QB locked item fired",
    );
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
