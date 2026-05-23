/**
 * Roster-identity regression. Locks the canonical isRosterOwnedBy:
 * a roster belongs to a user if they are the primary owner OR a
 * co-owner. Resolving by owner_id alone mis-identifies co-owned teams
 * (INVARIANTS.md "Roster identity must be ground-truth verified").
 *
 *   npx tsx --tsconfig tsconfig.json evals/roster-identity.test.ts
 */

import { isRosterOwnedBy } from "../src/lib/sleeper/roster-identity";

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

function run() {
  console.log("\n── roster identity (isRosterOwnedBy) ──");

  check(
    "primary owner matches",
    isRosterOwnedBy({ owner_id: "u1", co_owners: null }, "u1") === true,
  );
  check(
    "co-owner matches (the bug class owner_id-only missed)",
    isRosterOwnedBy({ owner_id: "u1", co_owners: ["u2", "u3"] }, "u3") === true,
  );
  check(
    "non-owner non-co-owner does not match",
    isRosterOwnedBy({ owner_id: "u1", co_owners: ["u2"] }, "u9") === false,
  );
  check(
    "null user id never matches",
    isRosterOwnedBy({ owner_id: "u1", co_owners: ["u2"] }, null) === false,
  );
  check(
    "undefined user id never matches",
    isRosterOwnedBy({ owner_id: "u1" }, undefined) === false,
  );
  check(
    "null roster never matches",
    isRosterOwnedBy(null, "u1") === false,
  );
  check(
    "orphan roster (owner_id null) still matches a co-owner",
    isRosterOwnedBy({ owner_id: null, co_owners: ["u2"] }, "u2") === true,
  );
  check(
    "orphan roster with no co-owners does not match",
    isRosterOwnedBy({ owner_id: null, co_owners: null }, "u1") === false,
  );
  check(
    "no co-owners field + primary match does not crash",
    isRosterOwnedBy({ owner_id: "u1" }, "u1") === true,
  );

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
