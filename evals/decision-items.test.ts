/**
 * Decision item ids are the contract between the weekly emails and /home:
 * an email button links to /home?item={id}. Ids must be stable, carry the
 * week, and survive URL encoding.
 * Run: npm run test:decision-items
 */

import { decisionItemHref, decisionItemId } from "../src/lib/decisions/items";

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

const id = decisionItemId("trade", "2026", 12, "1180", "evans");
check("id format is kind:seasonWweek:league:subject", id === "trade:2026w12:1180:evans", id);
check("same inputs give the same id", id === decisionItemId("trade", "2026", 12, "1180", "evans"));
check("a new week gives a new id", id !== decisionItemId("trade", "2026", 13, "1180", "evans"));
check("cross-league items use 'all'", decisionItemId("rootfor", "2026", 12, null, "4984") === "rootfor:2026w12:all:4984");
const href = decisionItemHref("https://dynastygeneral.app/", id);
check("href points at /home with the id encoded", href === "https://dynastygeneral.app/home?item=trade%3A2026w12%3A1180%3Aevans", href);
check("href round-trips", new URL(href).searchParams.get("item") === id);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
