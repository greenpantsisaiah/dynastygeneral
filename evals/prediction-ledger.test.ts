/**
 *   npx tsx --tsconfig tsconfig.json evals/prediction-ledger.test.ts
 *
 * Locks the value_decay@v1 shadow row builder + scorer.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ageRetention } from "../src/lib/players/age-curve";
import {
  buildValueDecayShadowRows,
  scoreValueDecayRow,
  VALUE_DECAY_TYPE,
  type ValueDecayInput,
} from "../src/lib/predictions/ledger";

let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}\n  ${e instanceof Error ? e.message : e}`);
  }
}

const loggedAt = new Date("2026-11-23T12:00:00Z");

const pool: ValueDecayInput[] = [
  { player_id: "a", position: "RB", age: 29, value: 80 },
  { player_id: "b", position: "WR", age: 22, value: 95 },
  { player_id: "c", position: "QB", age: 27, value: 60 },
  { player_id: "d", position: "WR", age: null, value: 70 },
  { player_id: "e", position: "DEF", age: 25, value: 50 },
  { player_id: "f", position: "TE", age: 33, value: 10 },
];

test("emits rows for value_decay@v1 with a 28 day resolve date", () => {
  const rows = buildValueDecayShadowRows({ values: pool, loggedAt });
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.equal(r.prediction_type, VALUE_DECAY_TYPE);
    assert.equal(r.resolve_after, "2026-12-21");
    assert.equal(r.baseline_predicted, 0);
    assert.equal(r.source, "shadow_weekly");
    assert.equal(r.subject_kind, "player");
    assert.equal(r.inputs.snapshot_date, "2026-11-23");
  }
});

test("predicted delta comes from the canonical age curve", () => {
  const rows = buildValueDecayShadowRows({ values: pool, loggedAt });
  const a = rows.find((r) => r.subject_id === "a")!;
  const h = 28 / 365;
  const expected = 80 * (ageRetention("RB", 29 + h) / ageRetention("RB", 29) - 1);
  assert.ok(Math.abs(a.predicted - expected) < 1e-12);
  assert.ok(a.predicted < 0, "post-peak RB decays");
});

test("skips null age and non-skill positions", () => {
  const ids = buildValueDecayShadowRows({ values: pool, loggedAt }).map((r) => r.subject_id);
  assert.ok(!ids.includes("d"));
  assert.ok(!ids.includes("e"));
});

test("keeps only the top N by value", () => {
  const rows = buildValueDecayShadowRows({ values: pool, loggedAt, topN: 2 });
  const ids = rows.map((r) => r.subject_id).sort();
  assert.deepEqual(ids, ["a", "b"]);
});

test("scorer returns squared errors for model and baseline", () => {
  const [row] = buildValueDecayShadowRows({ values: [pool[0]], loggedAt });
  const realized = 80 + row.predicted; // model exactly right
  const s = scoreValueDecayRow(row, realized);
  assert.ok(s.model_sq_err < 1e-18);
  assert.ok(Math.abs(s.baseline_sq_err - row.predicted ** 2) < 1e-9);
  assert.equal(s.model_beats_baseline, true);
  const flat = scoreValueDecayRow(row, 80);
  assert.equal(flat.model_beats_baseline, false);
});

test("migration is RLS-on with no policies and a daily unique index", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "0019_prediction_log.sql"),
    "utf8",
  );
  assert.match(sql, /enable row level security/);
  assert.ok(!/create policy/i.test(sql));
  assert.match(sql, /create unique index/);
});

if (failed > 0) {
  console.error(`${failed} failed`);
  process.exit(1);
}
