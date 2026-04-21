/**
 * Snake / linear slot math tests. Pure functions, no network.
 *
 *   npx tsx --tsconfig tsconfig.json evals/draft-math.test.ts
 */

// Pull out the functions under test. They're not exported, so we replicate
// the exact implementations here. If you change them in draft-state.ts,
// mirror the changes here.

function snakeSlotForPickNo(pickNo: number, teams: number) {
  const round = Math.ceil(pickNo / teams);
  const within = ((pickNo - 1) % teams) + 1;
  const slot = round % 2 === 1 ? within : teams - within + 1;
  return { round, slot };
}

function linearSlotForPickNo(pickNo: number, teams: number) {
  const round = Math.ceil(pickNo / teams);
  const slot = ((pickNo - 1) % teams) + 1;
  return { round, slot };
}

function labelForPickNo(pickNo: number, teams: number) {
  const round = Math.ceil(pickNo / teams);
  const within = ((pickNo - 1) % teams) + 1;
  return `${round}.${within}`;
}

type Case = { in: [number, number]; expect: { round: number; slot: number; label: string } };

const snakeCases: Case[] = [
  // 12-team snake
  { in: [1, 12], expect: { round: 1, slot: 1, label: "1.1" } },
  { in: [9, 12], expect: { round: 1, slot: 9, label: "1.9" } },
  { in: [12, 12], expect: { round: 1, slot: 12, label: "1.12" } },
  { in: [13, 12], expect: { round: 2, slot: 12, label: "2.1" } },
  { in: [24, 12], expect: { round: 2, slot: 1, label: "2.12" } },
  { in: [25, 12], expect: { round: 3, slot: 1, label: "3.1" } },
  // iceman example: pick 5.9 is pick #? (round 5, 9th within)
  // round 5 is odd, so slot 9 → pick_no = (5-1)*12 + 9 = 57
  // going the other direction: pick 57 with 12 teams → round 5, slot 9 ✓
  { in: [57, 12], expect: { round: 5, slot: 9, label: "5.9" } },
  // pick 7.4: odd round, slot 4, pick_no = 6*12+4 = 76
  { in: [76, 12], expect: { round: 7, slot: 4, label: "7.4" } },
  // pick 8.9 in human label = 9th pick of round 8. In snake with 12 teams,
  // round 8 is even and the 9th pick goes to slot 12-9+1 = 4.
  // pick_no = (8-1)*12 + 9 = 93. Label math: (93-1)%12 + 1 = 9 ✓
  { in: [93, 12], expect: { round: 8, slot: 4, label: "8.9" } },
  // 10-team snake
  { in: [11, 10], expect: { round: 2, slot: 10, label: "2.1" } },
  { in: [20, 10], expect: { round: 2, slot: 1, label: "2.10" } },
];

const linearCases: Case[] = [
  { in: [1, 12], expect: { round: 1, slot: 1, label: "1.1" } },
  { in: [12, 12], expect: { round: 1, slot: 12, label: "1.12" } },
  { in: [13, 12], expect: { round: 2, slot: 1, label: "2.1" } },
  { in: [24, 12], expect: { round: 2, slot: 12, label: "2.12" } },
];

function run() {
  let passed = 0;
  let failed = 0;

  console.log("── Snake cases ──");
  for (const c of snakeCases) {
    const r = snakeSlotForPickNo(c.in[0], c.in[1]);
    const l = labelForPickNo(c.in[0], c.in[1]);
    const ok =
      r.round === c.expect.round &&
      r.slot === c.expect.slot &&
      l === c.expect.label;
    if (ok) {
      passed++;
      console.log(`  ✓ pick ${c.in[0]}/${c.in[1]} → ${l} (slot ${r.slot})`);
    } else {
      failed++;
      console.log(
        `  ✗ pick ${c.in[0]}/${c.in[1]} expected ${c.expect.label} (slot ${c.expect.slot}) got ${l} (slot ${r.slot})`,
      );
    }
  }

  console.log("\n── Linear cases ──");
  for (const c of linearCases) {
    const r = linearSlotForPickNo(c.in[0], c.in[1]);
    const l = labelForPickNo(c.in[0], c.in[1]);
    const ok =
      r.round === c.expect.round &&
      r.slot === c.expect.slot &&
      l === c.expect.label;
    if (ok) {
      passed++;
      console.log(`  ✓ pick ${c.in[0]}/${c.in[1]} → ${l}`);
    } else {
      failed++;
      console.log(
        `  ✗ pick ${c.in[0]}/${c.in[1]} expected ${c.expect.label} got ${l}`,
      );
    }
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
