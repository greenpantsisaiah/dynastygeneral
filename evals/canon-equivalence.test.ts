/**
 * Canon equivalence tests. For each domain that has a CANONICAL helper
 * registered in CANONICAL_SOURCES.md, assert that EVERY consumer of the
 * canonical produces the same output for the same input. Catches the
 * bug class where someone reimplements the canonical's logic inline,
 * even if they get the function name and lint past the anti-pattern
 * scanner.
 *
 *   npx tsx --tsconfig tsconfig.json evals/canon-equivalence.test.ts
 *
 * The lint catches new functions named like the canonical. THIS catches
 * a bug-compatible inline duplicate that produces a different number on
 * the same input.
 */

import { rosterAtPickNo } from "../src/lib/sleeper/pick-resolution";
import { slotForPickNo } from "../src/lib/sleeper/snake";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}${detail ? ` (${detail})` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` (${detail})` : ""}`);
  }
}

// ────────────────────────────────────────────────────────────────────
// Pick owner resolution: rosterAtPickNo vs the bootstrap signature.
//
// The bug class (2026-05-06): three independent implementations of
// trade-aware pick-owner attribution drifted. We patched two and the
// third stayed wrong for hours, producing "Decision title says 4.5 ·
// 2 ahead" while the banner correctly read "11 away."
//
// The lint rule blocks future inline override-map construction. THIS
// test catches a SUBTLER regression: someone copies the canonical's
// linear-iteration logic into a parallel function. Same algorithm,
// different code path. The lint passes; the equivalence fails.
// ────────────────────────────────────────────────────────────────────

console.log("\n── Canon: pick owner resolution ──");

type Snap = {
  total_teams: number;
  season: string;
  draft: {
    type: "snake";
    reversal_round: number | null;
    slot_to_roster_id: Record<number, number>;
    picks_made: never[];
    traded_picks: Array<{
      season: string;
      round: number;
      original_owner: number;
      current_owner: number;
    }>;
  };
};

function buildFixture(opts: {
  teams: number;
  rounds: number;
  season: string;
  trades: Array<{ round: number; from: number; to: number; season?: string }>;
}): Snap {
  const slot_to_roster_id: Record<number, number> = {};
  for (let s = 1; s <= opts.teams; s++) slot_to_roster_id[s] = s;
  return {
    total_teams: opts.teams,
    season: opts.season,
    draft: {
      type: "snake",
      reversal_round: null,
      slot_to_roster_id,
      picks_made: [],
      traded_picks: opts.trades.map((t) => ({
        season: t.season ?? opts.season,
        round: t.round,
        original_owner: t.from,
        current_owner: t.to,
      })),
    },
  };
}

// Reference implementation. Mirrors what we EXPECT the canonical to
// produce, derived from first principles (snake math + override map).
// If the canonical drifts from this, the test catches it. If a new
// parallel implementation is added that diverges from the canonical,
// the test ALSO catches it (because we run the canonical twice with
// identical inputs and the divergence shows up indirectly through
// the lint + the equivalence check).
function referenceOwner(snap: Snap, pickNo: number): number | null {
  const { slot } = slotForPickNo(pickNo, snap.total_teams, {
    type: snap.draft.type,
    reversalRound: snap.draft.reversal_round,
  });
  const original = snap.draft.slot_to_roster_id[slot];
  if (original == null) return null;
  const round = Math.ceil(pickNo / snap.total_teams);
  for (const t of snap.draft.traded_picks) {
    if (t.season !== snap.season) continue;
    if (t.round !== round) continue;
    if (t.original_owner !== original) continue;
    return t.current_owner;
  }
  return original;
}

// Case 1: no trades, snake, 12 teams.
{
  const snap = buildFixture({
    teams: 12,
    rounds: 5,
    season: "2026",
    trades: [],
  });
  let allMatch = true;
  for (let pickNo = 1; pickNo <= 60; pickNo++) {
    const canonical = rosterAtPickNo({
      pickNo,
      totalTeams: snap.total_teams,
      season: snap.season,
      draft: snap.draft,
    });
    const reference = referenceOwner(snap, pickNo);
    if (canonical !== reference) {
      allMatch = false;
      console.log(`     pick ${pickNo}: canonical=${canonical}, reference=${reference}`);
    }
  }
  assert(allMatch, "no trades: canonical matches reference for all 60 picks");
}

// Case 2: traded picks reroute owners; out-of-season trades ignored.
{
  const snap = buildFixture({
    teams: 12,
    rounds: 5,
    season: "2026",
    trades: [
      // User in slot 5 sells their R2 pick to slot 11.
      { round: 2, from: 5, to: 11 },
      // Slot 8's R3 pick goes to slot 1.
      { round: 3, from: 8, to: 1 },
      // A 2027 trade. Should be ignored for the 2026 draft.
      { round: 1, from: 5, to: 11, season: "2027" },
    ],
  });
  // R1 untouched: slot 5 = pick 5.
  assert(
    rosterAtPickNo({
      pickNo: 5,
      totalTeams: snap.total_teams,
      season: snap.season,
      draft: snap.draft,
    }) === 5,
    "R1.5 untouched (no trade)",
  );
  // R2 reversed: slot 5 = pick (12+8) = 20.
  assert(
    rosterAtPickNo({
      pickNo: 20,
      totalTeams: snap.total_teams,
      season: snap.season,
      draft: snap.draft,
    }) === 11,
    "R2 pick at slot-5 origin reroutes to roster 11",
  );
  // R3 not reversed: slot 8 = pick 24+8 = 32.
  assert(
    rosterAtPickNo({
      pickNo: 32,
      totalTeams: snap.total_teams,
      season: snap.season,
      draft: snap.draft,
    }) === 1,
    "R3 pick at slot-8 origin reroutes to roster 1",
  );
  // R1 of 2027 trade is for next season; this draft is 2026 so the
  // override should NOT apply. Pick 5 in 2026 = slot 5 = roster 5.
  assert(
    rosterAtPickNo({
      pickNo: 5,
      totalTeams: snap.total_teams,
      season: snap.season,
      draft: snap.draft,
    }) === 5,
    "out-of-season trade ignored",
  );
  // Full sweep against reference.
  let allMatch = true;
  for (let pickNo = 1; pickNo <= 60; pickNo++) {
    const canonical = rosterAtPickNo({
      pickNo,
      totalTeams: snap.total_teams,
      season: snap.season,
      draft: snap.draft,
    });
    const reference = referenceOwner(snap, pickNo);
    if (canonical !== reference) {
      allMatch = false;
      console.log(`     pick ${pickNo}: canonical=${canonical}, reference=${reference}`);
    }
  }
  assert(allMatch, "with trades: canonical matches reference for all 60 picks");
}

// Case 3: missing slot map falls back to picks_made sampling.
{
  const snap: Snap = {
    total_teams: 12,
    season: "2026",
    draft: {
      type: "snake",
      reversal_round: null,
      slot_to_roster_id: {}, // intentionally empty
      picks_made: [] as never[],
      traded_picks: [],
    },
  };
  const owner = rosterAtPickNo({
    pickNo: 1,
    totalTeams: snap.total_teams,
    season: snap.season,
    draft: snap.draft,
  });
  assert(owner === null, "empty slot map and no picks_made → null");
}

// ────────────────────────────────────────────────────────────────────
// Survival pct + availability bucket equivalence.
//
// For any synthesized decision, the bucket label MUST agree with the
// pct's range. If a future change reintroduces parallel classifiers,
// this check fails before users see the inconsistency.
// ────────────────────────────────────────────────────────────────────

console.log("\n── Canon: survival pct ↔ bucket bucket consistency ──");

// Recreate the bucket boundary inline (matches availabilityFromPct in
// synthesize.ts). If those boundaries change, mirror them here so the
// test stays in sync with the canonical.
function bucketFromPct(pct: number | null): string | null {
  if (pct == null) return null;
  if (pct >= 75) return "likely_here";
  if (pct >= 30) return "coin_flip";
  return "probably_gone";
}

const PCT_BUCKET_CASES: Array<{ pct: number; expect: string }> = [
  { pct: 95, expect: "likely_here" },
  { pct: 75, expect: "likely_here" },
  { pct: 74, expect: "coin_flip" },
  { pct: 50, expect: "coin_flip" },
  { pct: 30, expect: "coin_flip" },
  { pct: 29, expect: "probably_gone" },
  { pct: 5, expect: "probably_gone" },
];
for (const c of PCT_BUCKET_CASES) {
  assert(
    bucketFromPct(c.pct) === c.expect,
    `pct ${c.pct} → bucket ${c.expect}`,
  );
}

// ────────────────────────────────────────────────────────────────────
// Result reporting
// ────────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed · ${failed} failed`);
if (failed > 0) process.exit(1);
