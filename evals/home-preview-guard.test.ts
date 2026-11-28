/**
 * Signed-out /home preview guard (before paid traffic). The 24h preview
 * cookie is replayable and each build runs season simulations, so the
 * signed-out path is per-IP limited and repeat views share one cached build.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cachedPreview, clearPreviewCache, PREVIEW_CACHE_TTL_MS, previewCacheKey, previewLimitLine } from "../src/lib/home/preview-cache";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${detail}`);
  }
}

async function main() {
  console.log("preview cache");
  let builds = 0;
  const build = async () => {
    builds++;
    return { n: builds };
  };
  const key = previewCacheKey("IzzyDaBomb", "2026", 13);
  check("key ignores username case", key === previewCacheKey("izzydabomb", "2026", 13));
  check("key changes with the week", key !== previewCacheKey("izzydabomb", "2026", 14));
  const t0 = 1_000_000;
  const [a, b] = await Promise.all([cachedPreview(key, build, t0), cachedPreview(key, build, t0)]);
  check("concurrent renders share one build", builds === 1 && a === b);
  await cachedPreview(key, build, t0 + PREVIEW_CACHE_TTL_MS - 1);
  check("a replay inside the TTL does not rebuild", builds === 1);
  const c = await cachedPreview(key, build, t0 + PREVIEW_CACHE_TTL_MS);
  check("an expired entry rebuilds", builds === 2 && c.n === 2);

  clearPreviewCache();
  let tries = 0;
  const flaky = async () => {
    tries++;
    if (tries === 1) throw new Error("sleeper 503");
    return "ok";
  };
  let threw = false;
  try {
    await cachedPreview("k", flaky, t0);
  } catch {
    threw = true;
  }
  await new Promise((r) => setTimeout(r, 0));
  const second = await cachedPreview("k", flaky, t0 + 1);
  check("a failed build is not cached", threw && second === "ok" && tries === 2);

  clearPreviewCache();
  for (let i = 0; i < 205; i++) await cachedPreview(`u${i}`, async () => i, t0);
  let rebuilt = false;
  await cachedPreview("u204", async () => {
    rebuilt = true;
    return 0;
  }, t0);
  check("the cache stays bounded and keeps recent entries", !rebuilt);

  console.log("\nlimit copy");
  const line = previewLimitLine(10, "10 minutes", 4 * 60000 + 1);
  check("names the cap, window and wait", line === "Preview limit reached on this network: 10 views per 10 minutes. Sign in to keep going, or retry in 5 min.", line);
  check("daily wait reads in hours", previewLimitLine(40, "day", 5 * 3600000).endsWith("retry in 5 hours."));
  check("no em dash or exclamation", !/[—!]/.test(line));

  console.log("\nwiring");
  const page = readFileSync(join(__dirname, "../src/app/home/page.tsx"), "utf8");
  const rl = readFileSync(join(__dirname, "../src/lib/ratelimit.ts"), "utf8");
  check("buckets registered", /"home-preview": \{ requests: \d+, window: "10 m" \}/.test(rl) && /"home-preview-daily": \{ requests: \d+, window: "1 d" \}/.test(rl));
  const limitAt = page.indexOf('checkRateLimit("home-preview"');
  const buildAt = page.indexOf("buildBriefLeagues({");
  check("signed-out path checks both limits before building", limitAt > 0 && page.includes('checkRateLimit("home-preview-daily"') && limitAt < buildAt);
  check("limits apply only to the preview", /if \(previewUsername\) \{\s*const ip = clientIpFromHeaders/.test(page));
  check("preview reads the cache, signed-in builds fresh", /previewUsername\s*\?\s*await cachedPreview\(previewCacheKey\(username, season, week\), load\)\s*:\s*await load\(\)/.test(page));
  check("a blocked view logs a tag", page.includes("[home:preview-limited]"));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
void main();
