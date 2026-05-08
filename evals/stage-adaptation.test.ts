/**
 * Stage adaptation regression. Locks the per-stage surface ordering
 * so the hub renders the right hero surface for the user's current
 * draft moment.
 *
 *   npx tsx --tsconfig tsconfig.json evals/stage-adaptation.test.ts
 */

import { selectSurfaceLayout } from "../src/lib/stage-adaptation/select";
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

function makeSnap(opts: {
  status: "pre_draft" | "drafting" | "paused" | "complete" | "no_draft";
  myPicksMade: number;
  totalRounds?: number;
  leagueType?: "dynasty" | "keeper" | "redraft";
  format?: "1qb" | "superflex" | "2qb";
  scoring?: string[];
  maxKeepers?: number | null;
}): LeagueSnapshot {
  return {
    league_id: "test",
    season: "2026",
    total_teams: 12,
    format: opts.format ?? "1qb",
    league_type: opts.leagueType ?? "dynasty",
    max_keepers: opts.maxKeepers ?? null,
    scoring: opts.scoring ?? ["PPR"],
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
        player_ids: [],
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
      status: opts.status,
      type: "snake",
      rounds: opts.totalRounds ?? 20,
      reversal_round: null,
      slot_to_roster_id: { 1: 1 },
      my_slot: 1,
      next_pick_no: null,
      picks_made: Array.from({ length: opts.myPicksMade }).map((_, i) => ({
        pick_no: i + 1,
        round: 1,
        roster_id: 1,
        player_id: `p${i}`,
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
  console.log("\n── 1. Pre-draft: Team Identity preview leads ──");
  {
    const layout = selectSurfaceLayout({
      snap: makeSnap({ status: "pre_draft", myPicksMade: 0 }),
    });
    check("stage = pre_draft", layout.stage === "pre_draft");
    check("hero = team_identity", layout.hero === "team_identity", `actual: ${layout.hero}`);
    check("Bridge always first", layout.order[0] === "bridge");
    check("Library appears in pre-draft top three", layout.order.slice(0, 3).includes("the_library"));
  }

  console.log("\n── 2. Early draft: The Call dominates ──");
  {
    const layout = selectSurfaceLayout({
      snap: makeSnap({ status: "drafting", myPicksMade: 2, totalRounds: 20 }),
    });
    check("stage = early_draft", layout.stage === "early_draft");
    check("hero = the_call", layout.hero === "the_call", `actual: ${layout.hero}`);
  }

  console.log("\n── 3. Mid draft (round ~6 of 20): Call + Track Record split ──");
  {
    const layout = selectSurfaceLayout({
      snap: makeSnap({ status: "drafting", myPicksMade: 6, totalRounds: 20 }),
    });
    check("stage = mid_draft", layout.stage === "mid_draft");
    check(
      "hero is the_call (first non-bridge)",
      layout.hero === "the_call",
      `actual: ${layout.hero}`,
    );
    check(
      "track_record in top 3",
      layout.order.slice(0, 3).includes("track_record"),
    );
  }

  console.log("\n── 4. Late draft (round ~14 of 20): Track Record + Field promote ──");
  {
    const layout = selectSurfaceLayout({
      snap: makeSnap({ status: "drafting", myPicksMade: 14, totalRounds: 20 }),
    });
    check("stage = late_draft", layout.stage === "late_draft");
    check("hero = track_record", layout.hero === "track_record", `actual: ${layout.hero}`);
    check("the_field in top 3", layout.order.slice(0, 3).includes("the_field"));
  }

  console.log("\n── 5. Post-draft (complete): Track Record locked + Identity featured ──");
  {
    const layout = selectSurfaceLayout({
      snap: makeSnap({ status: "complete", myPicksMade: 20 }),
    });
    check("stage = post_draft", layout.stage === "post_draft");
    check("hero = track_record", layout.hero === "track_record", `actual: ${layout.hero}`);
    check(
      "team_identity in top 3",
      layout.order.slice(0, 3).includes("team_identity"),
    );
  }

  console.log("\n── 6. Format reads ──");
  {
    const layout = selectSurfaceLayout({
      snap: makeSnap({
        status: "drafting",
        myPicksMade: 5,
        leagueType: "keeper",
        format: "superflex",
        scoring: ["PPR", "TE-premium"],
        maxKeepers: 3,
      }),
    });
    check("is_keeper = true", layout.format.is_keeper);
    check("is_superflex = true", layout.format.is_superflex);
    check("is_te_premium = true", layout.format.is_te_premium);
    check("max_keepers = 3", layout.format.max_keepers === 3);
    check("is_dynasty = false", !layout.format.is_dynasty);
    check("is_redraft = false", !layout.format.is_redraft);
  }

  console.log("\n── 7. forced_hero override ──");
  {
    const layout = selectSurfaceLayout({
      snap: makeSnap({ status: "drafting", myPicksMade: 5 }),
      forced_hero: "the_library",
    });
    check("hero = the_library when forced", layout.hero === "the_library");
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
