/**
 * Roster-ownership regression. Locks the canonical ownedPlayerIds:
 * draft picks merge into a roster ONLY while the draft is live
 * (drafting / paused). Once complete, the pick log is history and
 * roster.players alone is the truth.
 *
 * Bug class (founder report 2026-09-15, Finders Keepers): an
 * unconditional union of roster.players + draft picks resurrected five
 * dropped draftees (Shedeur Sanders, Anthony Richardson, ...) onto the
 * user's in-season roster, so Coach read five QBs where Sleeper showed
 * three. The fixture below mirrors that league: roster 8 drafted 20
 * players, later dropped five, and the live Sleeper roster carries 22
 * ids (draftees kept plus waiver adds plus a DEF).
 *
 *   npx tsx --tsconfig tsconfig.json evals/roster-ownership.test.ts
 */

import {
  draftedIdsByRoster,
  isLiveDraft,
  ownedPlayerIds,
} from "../src/lib/sleeper/roster-ownership";

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

// Live Sleeper roster 8 in Finders Keepers, 2026-09-15 (in-season).
const LIVE_ROSTER = [
  "10213", "10235", "11237", "11559", "11625", "11635", "12518", "12534",
  "13279", "13286", "13298", "13330", "3634", "4046", "4195", "4881",
  "5012", "7564", "8408", "9486", "9753", "CIN",
];
// The completed draft's pick log for roster 8 (20 picks). Five of these
// were dropped after the draft: 13349 Stowers, 12476 Neal, 12469
// Sampson, 12524 Shedeur Sanders, 9229 Anthony Richardson.
const DRAFTED_ROSTER_8 = [
  "7564", "4881", "4046", "12518", "13279", "11635", "13286", "12534",
  "8408", "13298", "13330", "9753", "13349", "11559", "5012", "11625",
  "12476", "12469", "12524", "9229",
];
const DROPPED = ["13349", "12476", "12469", "12524", "9229"];
const SHEDEUR = "12524";
const RICHARDSON = "9229";

function run() {
  console.log("\n── roster ownership (ownedPlayerIds) ──");

  const complete = ownedPlayerIds({
    rosterPlayers: LIVE_ROSTER,
    draftedForRoster: DRAFTED_ROSTER_8,
    draftStatus: "complete",
  });
  check(
    "complete draft: roster.players is the truth (22 ids, no resurrection)",
    complete.length === LIVE_ROSTER.length &&
      LIVE_ROSTER.every((id) => complete.includes(id)),
    `got ${complete.length}`,
  );
  check(
    "complete draft: Shedeur Sanders (dropped draftee) is NOT owned",
    !complete.includes(SHEDEUR),
  );
  check(
    "complete draft: Anthony Richardson (dropped draftee) is NOT owned",
    !complete.includes(RICHARDSON),
  );
  check(
    "complete draft: none of the five dropped draftees are owned",
    DROPPED.every((id) => !complete.includes(id)),
  );

  // Mid-draft: Sleeper's roster.players is stale (empty / prior season);
  // the pick log is the only ownership source.
  const drafting = ownedPlayerIds({
    rosterPlayers: [],
    draftedForRoster: DRAFTED_ROSTER_8.slice(0, 6),
    draftStatus: "drafting",
  });
  check(
    "drafting: picks merge in (6 picks -> 6 owned)",
    drafting.length === 6 && drafting.includes("4046"),
    `got ${drafting.length}`,
  );
  const paused = ownedPlayerIds({
    rosterPlayers: ["stale-prior-season"],
    draftedForRoster: ["4881"],
    draftStatus: "paused",
  });
  check(
    "paused: picks merge in alongside roster.players",
    paused.includes("4881") && paused.includes("stale-prior-season"),
  );

  for (const status of ["pre_draft", "no_draft"] as const) {
    const out = ownedPlayerIds({
      rosterPlayers: ["a", "b"],
      draftedForRoster: ["c"],
      draftStatus: status,
    });
    check(
      `${status}: picks are NOT merged`,
      out.length === 2 && !out.includes("c"),
    );
  }

  const deduped = ownedPlayerIds({
    rosterPlayers: ["a", "a", null, undefined, "b"],
    draftedForRoster: ["b", "c", null],
    draftStatus: "drafting",
  });
  check(
    "de-duplicates and drops null ids",
    deduped.length === 3 && ["a", "b", "c"].every((x) => deduped.includes(x)),
    deduped.join(","),
  );

  check(
    "isLiveDraft: drafting + paused only",
    isLiveDraft("drafting") &&
      isLiveDraft("paused") &&
      !isLiveDraft("complete") &&
      !isLiveDraft("pre_draft") &&
      !isLiveDraft("no_draft") &&
      !isLiveDraft(null) &&
      !isLiveDraft(undefined),
  );

  const grouped = draftedIdsByRoster([
    { player_id: "x", roster_id: 8 },
    { player_id: "y", roster_id: 8 },
    { player_id: "z", roster_id: 3 },
    { player_id: null, roster_id: 8 },
    { player_id: "w", roster_id: null },
  ]);
  check(
    "draftedIdsByRoster groups by roster and skips null ids / rosters",
    grouped.get(8)?.join(",") === "x,y" &&
      grouped.get(3)?.join(",") === "z" &&
      grouped.size === 2,
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

run();
