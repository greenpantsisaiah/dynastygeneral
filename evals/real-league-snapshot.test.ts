/**
 * Real-league snapshot loader: staleness rule (8 days) and the shape of
 * any committed snapshot. Passes with no snapshot committed yet.
 * Run: npm run test:real-league-snapshot
 */

import { MAX_AGE_DAYS, isStale, listRealLeagueSnapshots, loadRealLeagueSnapshot } from "./fixtures/real-leagues/load";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`);
  }
}

console.log("\n── staleness ──");
const now = Date.parse("2026-11-25T12:00:00Z");
check("7 days old is fresh", !isStale("2026-11-18T12:00:00Z", now));
check(`${MAX_AGE_DAYS + 1} days old is stale`, isStale("2026-11-16T12:00:00Z", now));
check("unparseable date is stale", isStale("not a date", now));

console.log("\n── committed snapshots ──");
const names = listRealLeagueSnapshots();
console.log(`  ${names.length} snapshot(s): ${names.join(", ") || "none yet"}`);
for (const n of names) {
  const s = loadRealLeagueSnapshot(n, { allowStale: true });
  const raw = JSON.stringify(s);
  check(`${n}: has leagues and players`, s.leagues.length > 0 && Object.keys(s.players).length > 0);
  check(`${n}: every league has rosters and users`, s.leagues.every((l) => l.rosters.length > 0 && l.users.length > 0));
  check(`${n}: no email addresses`, !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(raw));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
