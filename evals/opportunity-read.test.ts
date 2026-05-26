/**
 * Opportunity-read canonical regression.
 *
 *   npx tsx --tsconfig tsconfig.json evals/opportunity-read.test.ts
 *
 * Locks the shared role read (readOpportunity, players/opportunity-read.ts)
 * that BOTH the inflection opportunity signal and The Call candidate-card
 * detail consume. One threshold, one role string, one trend call, so chat,
 * the inflection scorecard, and the board never diverge. Stage 2a of the
 * "data right" on-ramp (ARCHITECTURE_UNIFICATION_PLAN.md addendum).
 */

import {
  readOpportunity,
  describeRole,
} from "../src/lib/players/opportunity-read";
import type { OpportunityProfile } from "../src/lib/players/season-stats";

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

function prof(over: Partial<OpportunityProfile>): OpportunityProfile {
  return {
    snap_share: null,
    targets_per_game: null,
    adot: null,
    drop_rate: null,
    rz_targets_per_game: null,
    targets: null,
    ...over,
  };
}

function run() {
  console.log("\n── readOpportunity trend calls ──");

  // Adonai Mitchell, the founder eye-test case: snap 35% -> 50%, the
  // proven-sophomore role the board's value sort hides.
  const rising = readOpportunity({
    prev: prof({ snap_share: 0.5, targets_per_game: 4.6, adot: 5.0 }),
    prevPrev: prof({ snap_share: 0.35, targets_per_game: 3.2 }),
  });
  check(
    "rising snap share -> trend rising",
    rising?.trend === "rising" && /up 15 pts from 35%/.test(rising.detail),
    rising?.detail ?? "null",
  );
  check(
    "role line carries snap share + targets + aDOT",
    rising?.line === "50% snaps, 4.6 tgt/g, 5 aDOT",
    rising?.line ?? "null",
  );

  const falling = readOpportunity({
    prev: prof({ snap_share: 0.45 }),
    prevPrev: prof({ snap_share: 0.65 }),
  });
  check(
    "eroding snap share -> trend falling",
    falling?.trend === "falling" && /down 20 pts from 65%/.test(falling.detail),
    falling?.detail ?? "null",
  );

  const flat = readOpportunity({
    prev: prof({ snap_share: 0.62 }),
    prevPrev: prof({ snap_share: 0.6 }),
  });
  check(
    "sub-threshold change -> trend flat (with real prior)",
    flat?.trend === "flat" && /stable vs 60%/.test(flat.detail),
    flat?.detail ?? "null",
  );

  const single = readOpportunity({
    prev: prof({ snap_share: 0.7 }),
    prevPrev: null,
  });
  check(
    "one season of data -> trend single_season (not 'steady')",
    single?.trend === "single_season" && /one season/.test(single.detail),
    single?.detail ?? "null",
  );

  // Targets-per-game fallback when snap share is absent both seasons.
  const tgtRise = readOpportunity({
    prev: prof({ targets_per_game: 6 }),
    prevPrev: prof({ targets_per_game: 4 }),
  });
  check(
    "targets/game fallback fires when snap share absent",
    tgtRise?.trend === "rising" && /targets up 2\/g from 4/.test(tgtRise.detail),
    tgtRise?.detail ?? "null",
  );

  console.log("\n── readOpportunity null / degradation ──");

  check("null prev -> null read", readOpportunity({ prev: null, prevPrev: null }) === null);
  check(
    "all-null prev profile -> null read (rookie / no NFL history)",
    readOpportunity({ prev: prof({}), prevPrev: prof({}) }) === null,
  );

  console.log("\n── describeRole ──");
  check(
    "describeRole omits null fields, keeps units",
    describeRole(prof({ snap_share: 0.49, targets_per_game: 4.6 })) ===
      "49% snaps, 4.6 tgt/g",
    describeRole(prof({ snap_share: 0.49, targets_per_game: 4.6 })),
  );

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
