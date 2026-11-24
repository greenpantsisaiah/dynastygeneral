#!/usr/bin/env node
/**
 * Post-deploy tripwire. Run by .github/workflows/post-deploy-tripwire.yml
 * after every push to main. Plain Node 20+, no dependencies.
 *
 * 1. Waits until production's /api/health reports the pushed commit.
 * 2. Watches it for WATCH_MINUTES: probes core pages each minute and,
 *    when HEALTH_TOKEN is set, reads this commit's server error count.
 * 3. Decides TRIP or OK and writes `result=trip|ok|not_live` plus a
 *    human summary to $GITHUB_OUTPUT. The workflow does the revert.
 *
 * Trips when EITHER:
 *   - PROBE_FAIL_ROUNDS or more probe rounds had a core page return 5xx
 *     or time out, OR
 *   - server errors for the new commit reach ERROR_THRESHOLD AND are at
 *     least BASELINE_MULTIPLIER x the previous commit's count over the
 *     same length window (so a noisy-but-normal day does not revert).
 *
 * Env (all optional except TARGET_SHA):
 *   PROD_URL              default https://dynastygeneral.app
 *   TARGET_SHA            the pushed commit
 *   PREVIOUS_SHA          the commit it replaced (baseline)
 *   HEALTH_TOKEN          unlocks server error counts
 *   WAIT_LIVE_MINUTES     default 20
 *   WATCH_MINUTES         default 10
 *   PROBE_PATHS           default "/,/api/health,/changelog,/how-it-works,/pricing"
 *   PROBE_FAIL_ROUNDS     default 3
 *   ERROR_THRESHOLD       default 20
 *   BASELINE_MULTIPLIER   default 3
 *   INTERVAL_SECONDS      default 60
 */

import { appendFileSync } from "node:fs";

const env = process.env;
const PROD_URL = (env.PROD_URL || "https://dynastygeneral.app").replace(/\/$/, "");
const TARGET_SHA = env.TARGET_SHA || "";
const PREVIOUS_SHA = env.PREVIOUS_SHA || "";
const HEALTH_TOKEN = (env.HEALTH_TOKEN || "").trim();
const num = (v, d) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : d);
const WAIT_LIVE_MINUTES = num(env.WAIT_LIVE_MINUTES, 20);
const WATCH_MINUTES = num(env.WATCH_MINUTES, 10);
const PROBE_PATHS = (env.PROBE_PATHS || "/,/api/health,/changelog,/how-it-works,/pricing")
  .split(",").map((s) => s.trim()).filter(Boolean);
const PROBE_FAIL_ROUNDS = num(env.PROBE_FAIL_ROUNDS, 3);
const ERROR_THRESHOLD = num(env.ERROR_THRESHOLD, 20);
const BASELINE_MULTIPLIER = num(env.BASELINE_MULTIPLIER, 3);
const INTERVAL_MS = num(env.INTERVAL_SECONDS, 60) * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function output(key, value) {
  const line = `${key}<<__EOF__\n${value}\n__EOF__\n`;
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, line);
  console.log(`[output] ${key}=${value}`);
}

async function fetchWithTimeout(url, init = {}, ms = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}

async function health(commit) {
  const qs = commit ? `?minutes=${Math.ceil(WATCH_MINUTES)}&commit=${commit}` : `?minutes=${Math.ceil(WATCH_MINUTES)}`;
  const headers = HEALTH_TOKEN ? { authorization: `Bearer ${HEALTH_TOKEN}` } : {};
  try {
    const res = await fetchWithTimeout(`${PROD_URL}/api/health${qs}&t=${Date.now()}`, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function probeRound() {
  const failures = [];
  for (const path of PROBE_PATHS) {
    const sep = path.includes("?") ? "&" : "?";
    try {
      const res = await fetchWithTimeout(`${PROD_URL}${path}${sep}tripwire=${Date.now()}`);
      if (res.status >= 500) failures.push(`${path} -> ${res.status}`);
    } catch (err) {
      failures.push(`${path} -> ${err?.name === "AbortError" ? "timeout" : "network error"}`);
    }
  }
  return failures;
}

async function main() {
  if (!TARGET_SHA) {
    console.error("TARGET_SHA is required");
    process.exit(2);
  }
  console.log(`Tripwire: ${PROD_URL} commit ${TARGET_SHA.slice(0, 7)} (baseline ${PREVIOUS_SHA.slice(0, 7) || "none"})`);
  if (!HEALTH_TOKEN) console.log("HEALTH_TOKEN not set: watching probes only, not server error counts.");

  // 1. Wait for the new commit to be live.
  const liveDeadline = Date.now() + WAIT_LIVE_MINUTES * 60_000;
  let live = false;
  while (Date.now() < liveDeadline) {
    const h = await health();
    if (h?.commit === TARGET_SHA) { live = true; break; }
    console.log(`waiting for deploy (serving ${h?.commit?.slice(0, 7) ?? "unknown"})`);
    await sleep(30_000);
  }
  if (!live) {
    output("result", "not_live");
    output("summary", `Commit ${TARGET_SHA.slice(0, 7)} never went live on ${PROD_URL} within ${WAIT_LIVE_MINUTES} minutes. Vercel build may have failed; production is still on the previous deploy. No revert needed, but check the Vercel dashboard.`);
    return;
  }

  // Baseline: the previous commit's errors over its last watch-length window.
  let baseline = null;
  if (HEALTH_TOKEN && PREVIOUS_SHA) {
    const h = await health(PREVIOUS_SHA);
    baseline = typeof h?.server_errors === "number" ? h.server_errors : null;
  }
  console.log(`live. baseline errors: ${baseline ?? "n/a"}`);

  // Say plainly why error counts are or are not available, so a missing
  // token (GitHub secret vs Vercel env) or a missing Upstash store is
  // diagnosable from this log alone.
  if (HEALTH_TOKEN) {
    const probe = await health(TARGET_SHA);
    if (!probe) {
      console.log("error counts: /api/health did not answer.");
    } else if (!("server_errors" in probe)) {
      console.log("error counts: token REJECTED by production. Check that Vercel HEALTH_TOKEN (Production) matches the GitHub secret and that production was redeployed after setting it.");
    } else if (probe.server_errors == null) {
      console.log("error counts: token accepted, but the error store is unavailable (Upstash env vars missing in production).");
    } else {
      console.log(`error counts: token accepted, store live (${probe.server_errors} errors in window).`);
    }
  }

  // 2. Watch.
  const rounds = Math.max(1, Math.round((WATCH_MINUTES * 60_000) / INTERVAL_MS));
  let failedRounds = 0;
  const failureLog = [];
  let errors = null;
  let tripReason = "";
  for (let i = 0; i < rounds; i++) {
    const failures = await probeRound();
    if (failures.length > 0) {
      failedRounds++;
      failureLog.push(`round ${i + 1}: ${failures.join(", ")}`);
    }
    if (HEALTH_TOKEN) {
      const h = await health(TARGET_SHA);
      if (h && h.commit !== TARGET_SHA) {
        output("result", "superseded");
        output("summary", `A newer deploy (${String(h.commit).slice(0, 7)}) replaced ${TARGET_SHA.slice(0, 7)} during the watch. Its own tripwire run takes over.`);
        return;
      }
      if (typeof h?.server_errors === "number") errors = h.server_errors;
    }
    console.log(`round ${i + 1}/${rounds}: probe failures ${failures.length}, failed rounds ${failedRounds}, server errors ${errors ?? "n/a"}`);

    if (failedRounds >= PROBE_FAIL_ROUNDS) {
      tripReason = `${failedRounds} probe rounds hit 5xx or timeouts (limit ${PROBE_FAIL_ROUNDS}).`;
      break;
    }
    const baselineBar = baseline == null ? ERROR_THRESHOLD : Math.max(ERROR_THRESHOLD, baseline * BASELINE_MULTIPLIER);
    if (errors != null && errors >= baselineBar) {
      tripReason = `${errors} server errors in the watch window (bar ${baselineBar}: threshold ${ERROR_THRESHOLD}, previous commit ${baseline ?? "n/a"} x${BASELINE_MULTIPLIER}).`;
      break;
    }
    if (i < rounds - 1) await sleep(INTERVAL_MS);
  }

  const evidence = [
    `Production: ${PROD_URL}`,
    `Commit: ${TARGET_SHA}`,
    `Previous: ${PREVIOUS_SHA || "n/a"}`,
    `Server errors (new commit, last ${WATCH_MINUTES} min): ${errors ?? "n/a"}`,
    `Server errors (previous commit baseline): ${baseline ?? "n/a"}`,
    `Probe rounds failed: ${failedRounds}`,
    ...failureLog,
  ].join("\n");

  if (tripReason) {
    output("result", "trip");
    output("summary", `${tripReason}\n\n${evidence}`);
  } else {
    output("result", "ok");
    output("summary", `Healthy after ${WATCH_MINUTES} minutes.\n\n${evidence}`);
  }
}

main().catch((err) => {
  console.error(err);
  output("result", "error");
  output("summary", `Tripwire script crashed: ${err?.message ?? err}`);
});
