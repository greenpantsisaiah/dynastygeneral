/**
 * Opponent-coverage regression.
 *
 *   npx tsx --tsconfig tsconfig.json evals/opponent-coverage.test.ts
 *
 * Locks the property behind the 2026-05-16 founder report (Elite 10 /
 * "Mike Ekans"): Coach must see EVERY non-me roster as a named, tradeable
 * opponent, not just the ones buildOpponentReadout chose to characterize.
 *
 * buildOpponentReadout only emits a `teams[]` entry for opponents that
 * fire a signal (>=3 picks, or an active trade angle). The Coach route
 * used to build opponents[] from that dropped list, so an opponent who
 * had drafted only 0-2 players (common early in a draft, or in a fresh
 * league) silently vanished from Coach's context. The user asked Coach
 * for trade help on "Mike Ekans" and Coach replied it did not have that
 * opponent, while his full roster was sitting in the snapshot.
 *
 * orderOpponentRosters(rosters, characterizedIds) is the seam: it returns
 * every non-me roster (characterized-first), and the route maps over it.
 * This test asserts no opponent is dropped regardless of pick count.
 */

import { orderOpponentRosters } from "../src/lib/strategy/opponents/observe";

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

type FakeRoster = { roster_id: number; is_me?: boolean; owner_name: string };

function run() {
  console.log("\n── Elite 10: 10 rosters, 1 me, only 3 characterized ──");
  {
    // A 10-team league. The user is roster 1. Mid-draft, only rosters
    // 2,3,4 have drafted enough to be characterized; "Mike Ekans"
    // (roster 7) has 1 pick and was dropped from readout.teams.
    const rosters: FakeRoster[] = Array.from({ length: 10 }, (_, i) => ({
      roster_id: i + 1,
      is_me: i === 0,
      owner_name: i + 1 === 7 ? "Mike Ekans" : `Manager ${i + 1}`,
    }));
    const characterizedIds = [2, 3, 4];

    const ordered = orderOpponentRosters(rosters, characterizedIds);
    const ids = ordered.map((r) => r.roster_id);

    check(
      "emits one entry per non-me roster (9 of 10)",
      ordered.length === 9,
      `got ${ordered.length}`,
    );
    check("excludes the me roster", !ids.includes(1));
    check(
      "includes the dropped 'Mike Ekans' opponent (roster 7)",
      ordered.some((r) => r.owner_name === "Mike Ekans"),
    );
    check(
      "characterized opponents come first",
      ids[0] === 2 && ids[1] === 3 && ids[2] === 4,
      `order: ${ids.join(",")}`,
    );
    check(
      "every non-me roster appears exactly once",
      new Set(ids).size === ids.length && ids.length === 9,
    );
  }

  console.log("\n── Degenerate: no characterized opponents at all ──");
  {
    // Fresh league / pre-draft: nobody fires a signal. Every opponent
    // must still surface so Coach can talk trades from named rosters.
    const rosters: FakeRoster[] = [
      { roster_id: 1, is_me: true, owner_name: "Me" },
      { roster_id: 2, owner_name: "Alpha" },
      { roster_id: 3, owner_name: "Beta" },
    ];
    const ordered = orderOpponentRosters(rosters, []);
    check(
      "all opponents emitted with empty characterized set",
      ordered.length === 2 &&
        ordered.every((r) => r.owner_name === "Alpha" || r.owner_name === "Beta"),
      `got ${ordered.length}`,
    );
  }

  console.log("\n── Robustness: stale characterized id not in rosters ──");
  {
    const rosters: FakeRoster[] = [
      { roster_id: 1, is_me: true, owner_name: "Me" },
      { roster_id: 2, owner_name: "Alpha" },
    ];
    // 99 is a phantom id (e.g., a roster that left the league). It must
    // not crash or inject a null entry.
    const ordered = orderOpponentRosters(rosters, [99, 2]);
    check(
      "phantom characterized id is ignored, real opponent kept once",
      ordered.length === 1 && ordered[0].roster_id === 2,
      `ids: ${ordered.map((r) => r.roster_id).join(",")}`,
    );
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
