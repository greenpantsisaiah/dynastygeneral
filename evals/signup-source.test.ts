/**
 * Signup source attribution regression.
 *
 *   npx tsx --tsconfig tsconfig.json evals/signup-source.test.ts
 *
 * Locks the traffic-plan attribution (2026-11-26): the homepage signup
 * records which channel sent it, and a malformed or hostile `source`
 * never blocks a signup (per-field salvage, null when nothing survives).
 */
import { readFileSync } from "node:fs";
import { parseSignupSource, signupSourceFromLanding } from "../src/lib/growth/signup-source";

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

console.log("\n── signupSourceFromLanding ──");
const reddit = signupSourceFromLanding({
  search: "?utm_source=Reddit&utm_medium=post&utm_campaign=t2-dynastyff",
  referrer: "https://www.reddit.com/r/DynastyFF/comments/abc",
  ownHost: "dynastygeneral.app",
});
check(
  "utm tags lowercased + referrer host without www",
  JSON.stringify(reddit) ===
    JSON.stringify({ utm_source: "reddit", utm_medium: "post", utm_campaign: "t2-dynastyff", referrer_host: "reddit.com" }),
  JSON.stringify(reddit),
);
check(
  "same-site referrer and no tags = null",
  signupSourceFromLanding({ search: "", referrer: "https://dynastygeneral.app/how-it-works", ownHost: "dynastygeneral.app" }) === null,
);
check(
  "bad referrer is ignored, tags kept",
  signupSourceFromLanding({ search: "?ref=podcast_cam", referrer: "not a url", ownHost: "dynastygeneral.app" })?.ref === "podcast_cam",
);

console.log("\n── parseSignupSource (untrusted input) ──");
check("null / string / array input = null", [null, undefined, "reddit", ["a"]].every((x) => parseSignupSource(x) === null));
const salvaged = parseSignupSource({ utm_source: "meta", utm_campaign: "<script>", utm_medium: 42, extra: "x" });
check(
  "per-field salvage: bad fields and unknown keys dropped, good kept",
  JSON.stringify(salvaged) === JSON.stringify({ utm_source: "meta" }),
  JSON.stringify(salvaged),
);
check("values capped at 64 chars", (parseSignupSource({ utm_source: "a".repeat(200) })?.utm_source ?? "").length === 64);

console.log("\n── brief-signup wiring ──");
const route = readFileSync("src/app/api/brief-signup/route.ts", "utf8");
check("route stores parsed attribution as signup_utm", /parseSignupSource\(/.test(route) && /signup_utm: signupUtm/.test(route));
const form = readFileSync("src/components/landing/brief-signup-form.tsx", "utf8");
check("homepage form posts source from the landing URL", /signupSourceFromLanding\(/.test(form) && /source:/.test(form));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
