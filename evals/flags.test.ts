/**
 * Feature flags: the evaluator is deterministic, overrides act as a kill
 * switch, a bad override never breaks the product, and every registered
 * flag passes the registry rules (control first, rollout sane, not
 * expired). Run: npm run test:flags
 */

import {
  bucketFor,
  isEnabled,
  parseOverrides,
  validateRegistry,
  variantFor,
  type FlagDefinition,
} from "../src/lib/flags/evaluate";
import { FLAGS } from "../src/lib/flags/registry";

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

const onOff: FlagDefinition = {
  description: "test flag",
  owner: "test",
  created: "2026-11-21",
  expires: "2099-01-01",
  variants: ["off", "on"],
  rollout: [30],
};

console.log("\n── determinism ──");
{
  const a = variantFor("f", onOff, { unitId: "izzydabomb" });
  const b = variantFor("f", onOff, { unitId: "izzydabomb" });
  check("same unit, same arm", a === b);
  check("bucket in 0..9999", bucketFor("f", "x") >= 0 && bucketFor("f", "x") < 10000);
}

console.log("\n── rollout share ──");
{
  let on = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) {
    if (isEnabled("f", onOff, { unitId: `user-${i}` })) on++;
  }
  const share = on / n;
  check("30% rollout lands near 30%", share > 0.28 && share < 0.32, `got ${share}`);

  const dark = { ...onOff, rollout: [0] };
  let darkOn = 0;
  for (let i = 0; i < 2000; i++) {
    if (isEnabled("f", dark, { unitId: `user-${i}` })) darkOn++;
  }
  check("0% rollout is dark", darkOn === 0);

  const full = { ...onOff, rollout: [100] };
  check("100% rollout is everyone", isEnabled("f", full, { unitId: "anyone" }));
}

console.log("\n── multi-arm ──");
{
  const abc: FlagDefinition = { ...onOff, variants: ["a", "b", "c"], rollout: [25, 25] };
  const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 20000; i++) counts[variantFor("abc", abc, { unitId: `u${i}` })]!++;
  check("control near 50%", counts.a! / 20000 > 0.48 && counts.a! / 20000 < 0.52);
  check("arm b near 25%", counts.b! / 20000 > 0.23 && counts.b! / 20000 < 0.27);
}

console.log("\n── overrides (kill switch) ──");
{
  const full = { ...onOff, rollout: [100] };
  check(
    "override off beats 100% rollout",
    variantFor("f", full, { unitId: "u", overrides: { f: "off" } }) === "off",
  );
  check(
    "override on works with no unit id",
    variantFor("f", onOff, { unitId: null, overrides: { f: "on" } }) === "on",
  );
  check(
    "typo override is ignored, not fatal",
    variantFor("f", { ...onOff, rollout: [0] }, { unitId: "u", overrides: { f: "onn" } }) === "off",
  );
  check("no unit id gets control", variantFor("f", { ...onOff, rollout: [100] }, { unitId: null }) === "off");
  const parsed = parseOverrides(" a=on, b = off ,junk,=x,c=");
  check("parse keeps valid entries", parsed.a === "on" && parsed.b === "off");
  check("parse drops malformed entries", Object.keys(parsed).length === 2);
  check("parse handles empty", Object.keys(parseOverrides(undefined)).length === 0);
}

console.log("\n── registry rules ──");
{
  const today = new Date().toISOString().slice(0, 10);
  const problems = validateRegistry(FLAGS, today);
  check("every registered flag is valid and unexpired", problems.length === 0, problems.join("; "));
  check(
    "validator catches an expired flag",
    validateRegistry({ old: { ...onOff, expires: "2020-01-01" } }, today).length === 1,
  );
  check(
    "validator catches a rollout over 100",
    validateRegistry({ big: { ...onOff, variants: ["a", "b", "c"], rollout: [60, 60] } }, today).length === 1,
  );
}

console.log(`\n${passed} passed · ${failed} failed`);
if (failed > 0) process.exit(1);
