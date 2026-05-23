/**
 * Startable-depth canonical regression.
 *
 *   npx tsx --tsconfig tsconfig.json evals/startable-depth.test.ts
 *
 * Locks the fix for the 2026-05-16 founder report: "strategy advice
 * over-weights total RB/WR counts instead of startable quality and
 * stable depth." buildPositionDepth grades depth by leaguewide value
 * rank (startable tier = total_teams x realistic starters), so six
 * replacement-level WRs do NOT read as deep at WR. annotateStartableDepth
 * writes the counts onto the snapshot for every consumer to read.
 */

import {
  buildPositionDepth,
  annotateStartableDepth,
} from "../src/lib/engine/roster-fit";
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

// 2-team standard league. hard.WR = 1, no flex -> realistic WR starters
// = 1 + standard WR flex share (1) = 2. Startable tier = 2 teams x 2 = 4
// top WRs leaguewide. Stable tier = 2 x 3 = 6.
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
        roster_id: 1,
        is_me: true,
        player_ids: ["a1", "a2", "a3", "a4", "a5", "ak"],
        position_counts: { QB: 0, RB: 0, WR: 5, TE: 0, K: 1, DST: 0 },
      },
      {
        roster_id: 2,
        is_me: false,
        player_ids: ["b1", "b2", "b3"],
        position_counts: { QB: 0, RB: 0, WR: 3, TE: 0, K: 0, DST: 0 },
      },
    ],
  } as unknown as LeagueSnapshot;
}

// Roster 1: 2 startable-quality WRs + 3 scrubs. Roster 2: 3 mid WRs.
const VALUES: Record<string, number> = {
  a1: 100,
  a2: 90,
  a3: 10,
  a4: 5,
  a5: 2,
  ak: 5,
  b1: 80,
  b2: 70,
  b3: 60,
};
const POSITIONS: Record<string, "QB" | "RB" | "WR" | "TE" | "K" | "DST"> = {
  a1: "WR",
  a2: "WR",
  a3: "WR",
  a4: "WR",
  a5: "WR",
  ak: "K",
  b1: "WR",
  b2: "WR",
  b3: "WR",
};
const valueOf = (id: string) => VALUES[id] ?? null;
const positionOf = (id: string) => POSITIONS[id] ?? null;

function run() {
  console.log("\n── buildPositionDepth: six bodies != deep ──");
  {
    const snap = makeSnap();
    const depth = buildPositionDepth({ snap, valueOf, positionOf });
    const r1 = depth.get(1)!;
    const r2 = depth.get(2)!;

    check("roster 1 WR body counts all five", r1.WR.body === 5, `body=${r1.WR.body}`);
    check(
      "roster 1 WR startable is only the 2 that clear the tier",
      r1.WR.startable === 2,
      `startable=${r1.WR.startable}`,
    );
    check("roster 1 WR stable extends one tier deeper to 3", r1.WR.stable === 3, `stable=${r1.WR.stable}`);
    check("roster 2 WR startable is 2 (mid tier)", r2.WR.startable === 2, `startable=${r2.WR.startable}`);
    check(
      "the 3 scrub WRs do not inflate startable above the 2 real starters",
      r1.WR.startable < r1.WR.body,
      `${r1.WR.startable} startable of ${r1.WR.body}`,
    );
    check("K startable equals body (no value scale)", r1.K.startable === 1 && r1.K.body === 1);
  }

  console.log("\n── annotateStartableDepth writes onto the snapshot ──");
  {
    const snap = makeSnap();
    annotateStartableDepth({ snap, valueOf, positionOf });
    const me = snap.rosters.find((r) => r.is_me)!;
    check("startable_counts.WR annotated", me.startable_counts?.WR === 2, `${me.startable_counts?.WR}`);
    check("stable_depth_counts.WR annotated", me.stable_depth_counts?.WR === 3, `${me.stable_depth_counts?.WR}`);
    check("startable_counts.K equals body", me.startable_counts?.K === 1);
  }

  console.log("\n── All scrubs: startable is 0 even WITH values, not body ──");
  {
    // 3-team league. Team 3 owns four WRs that all have values but all
    // sit below the leaguewide startable tier. This is the case the
    // per-position fallback used to get wrong (reporting body as
    // startable). It must report 0 startable.
    const snap = {
      total_teams: 3,
      scoring: [],
      starter_slots: {
        hard: { QB: 1, RB: 2, WR: 1, TE: 1, K: 0, DST: 0 },
        flex: 0,
        rec_flex: 0,
        superflex: 0,
      },
      rosters: [
        { roster_id: 1, is_me: false, player_ids: ["a1", "a2"], position_counts: { QB: 0, RB: 0, WR: 2, TE: 0, K: 0, DST: 0 } },
        { roster_id: 2, is_me: false, player_ids: ["b1", "b2", "b3", "b4"], position_counts: { QB: 0, RB: 0, WR: 4, TE: 0, K: 0, DST: 0 } },
        { roster_id: 3, is_me: true, player_ids: ["c1", "c2", "c3", "c4"], position_counts: { QB: 0, RB: 0, WR: 4, TE: 0, K: 0, DST: 0 } },
      ],
    } as unknown as LeagueSnapshot;
    const v: Record<string, number> = {
      a1: 100, a2: 95, b1: 90, b2: 85, b3: 80, b4: 75, c1: 5, c2: 4, c3: 3, c4: 1,
    };
    annotateStartableDepth({
      snap,
      valueOf: (id) => v[id] ?? null,
      positionOf: () => "WR",
    });
    const me = snap.rosters.find((r) => r.is_me)!;
    check(
      "four scrub WRs report 0 startable (not 4)",
      me.startable_counts?.WR === 0,
      `startable=${me.startable_counts?.WR}, body=${me.position_counts.WR}`,
    );
  }

  console.log("\n── No value map: degrade to body, do not zero out ──");
  {
    const snap = makeSnap();
    annotateStartableDepth({ snap, valueOf: () => null, positionOf });
    const me = snap.rosters.find((r) => r.is_me)!;
    check(
      "startable_counts left unset when no values resolve",
      me.startable_counts === undefined,
      `startable_counts=${JSON.stringify(me.startable_counts)}`,
    );
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
