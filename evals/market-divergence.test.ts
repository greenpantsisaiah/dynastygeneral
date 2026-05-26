/**
 * Market-divergence canonical regression.
 *
 *   npx tsx --tsconfig tsconfig.json evals/market-divergence.test.ts
 *
 * Locks the Stage 2c "data right" surface: the ADP-vs-trade-value
 * divergence read, exactly the Adonai Mitchell case the founder flagged
 * 2026-05-24 (Sleeper Dyn-SF ADP 196 vs FantasyCalc value rank 242 = ADP
 * 46 picks earlier). Pure neutral helper, no IO.
 */
import { readMarketDivergence } from "../src/lib/players/market-divergence";

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
  console.log("\n── readMarketDivergence ──");

  const mitchell = readMarketDivergence({ adp: 196, valueRank: 242 });
  check(
    "Mitchell: ADP earlier by 46 (lean adp_earlier)",
    mitchell != null &&
      mitchell.lean === "adp_earlier" &&
      mitchell.gap === 46 &&
      mitchell.line === "ADP 196 · value rank 242" &&
      /ADP 46 earlier/.test(mitchell.detail),
    mitchell ? `${mitchell.line} / ${mitchell.detail}` : "null",
  );

  const sleeper = readMarketDivergence({ adp: 230, valueRank: 184 });
  check(
    "trade-market lead: value earlier by 46 (lean value_earlier)",
    sleeper != null &&
      sleeper.lean === "value_earlier" &&
      sleeper.gap === 46 &&
      /value 46 earlier/.test(sleeper.detail),
    sleeper ? sleeper.detail : "null",
  );

  // Threshold: 15 picks is the noise band; smaller gaps return null.
  check(
    "gap of 14 picks is in agreement -> null",
    readMarketDivergence({ adp: 100, valueRank: 114 }) === null,
  );
  check(
    "gap of exactly 15 picks fires (threshold inclusive)",
    readMarketDivergence({ adp: 100, valueRank: 115 }) != null,
  );

  // Null inputs degrade.
  check(
    "missing adp -> null read",
    readMarketDivergence({ adp: null, valueRank: 242 }) === null,
  );
  check(
    "missing valueRank -> null read",
    readMarketDivergence({ adp: 196, valueRank: null }) === null,
  );
  check(
    "both missing -> null read",
    readMarketDivergence({ adp: null, valueRank: null }) === null,
  );

  // Fractional / non-integer inputs round cleanly.
  const frac = readMarketDivergence({ adp: 196.4, valueRank: 242.6 });
  check(
    "fractional ranks round to integers in line",
    frac != null && frac.line === "ADP 196 · value rank 243",
    frac?.line ?? "null",
  );

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
