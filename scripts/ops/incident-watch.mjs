#!/usr/bin/env node
/**
 * Hourly incident watch. Run by .github/workflows/incident-watch.yml.
 * Plain Node 20+, no dependencies; uses the `gh` CLI the runner provides.
 * Contract and severity rules: docs/team/INCIDENTS.md.
 *
 * 1. Reads production's incident log (/api/ops/incidents, HEALTH_TOKEN).
 * 2. Probes key pages and the email deep links (SMOKE_PATHS) signed out:
 *    any 5xx, timeout, crash page, or raw engine banner is an incident.
 * 3. Flags a cron whose last clean run is older than its allowed gap.
 * 4. Opens ONE GitHub issue per fingerprint (label `incident`), updates
 *    the counts on an open one, and reopens a closed one that recurred.
 *    Red-tier incidents also get `interrupt` and are assigned to the owner.
 *
 * Env: PROD_URL, HEALTH_TOKEN, GH_TOKEN, GITHUB_REPOSITORY, OWNER_LOGIN,
 *      WINDOW_HOURS (default 2), SMOKE_PATHS (comma list, extra probes),
 *      DRY_RUN=1 (print, do not touch issues).
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";

const env = process.env;
const PROD_URL = (env.PROD_URL || "https://dynastygeneral.app").replace(/\/$/, "");
const HEALTH_TOKEN = (env.HEALTH_TOKEN || "").trim();
const WINDOW_HOURS = Number(env.WINDOW_HOURS || 2);
const OWNER = env.OWNER_LOGIN || "greenpantsisaiah";
const DRY = env.DRY_RUN === "1";
const MAX_NEW = Number(env.MAX_NEW_ISSUES || 8);

const BASE_PROBES = ["/", "/home", "/pricing", "/how-it-works", "/changelog", "/api/health"];
const PROBE_TIMEOUT_MS = 90_000;
// Every league in the committed real-league snapshot, opened the way the
// email's league and trade links open it (signed out, ?username=). This is
// the path that showed Isaiah the raw banner on 2026-11-26.
function realLeagueProbes() {
  const dir = "evals/fixtures/real-leagues";
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    try {
      const snap = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
      for (const l of snap.leagues ?? []) out.push(`/leagues/${l.league.league_id}?username=${encodeURIComponent(snap.user.username)}`);
    } catch {
      /* unreadable fixture: skip */
    }
  }
  return out;
}
const PROBES = [...new Set([...BASE_PROBES, ...realLeagueProbes(), ...(env.SMOKE_PATHS || "").split(",").map((s) => s.trim()).filter(Boolean)])];

// Crash and raw-banner markers. A user must never see these on a default view.
const BAD_MARKERS = [
  { re: /Engine integrity issue/i, what: "raw engine integrity banner on a default view" },
  { re: /Something went wrong/i, what: "error boundary page" },
  { re: /Application error: a (server|client)-side exception/i, what: "Next.js crash page" },
];

// Max hours between clean runs before a cron counts as stopped.
const CRON_MAX_GAP_HOURS = { "aar-notifications": 3, "weekly-brief": 24 * 8, "game-day": 24 * 8 };

// Red tier (docs/team/INCIDENTS.md): money, trust, or every-user impact.
const RED_CRONS = new Set(["weekly-brief", "game-day"]);
const RED_INTEGRITY = new Set(["roster_identity_mismatch", "pool_missing_player", "pricing_unresolved"]);
const RED_PATHS = [/^\/$/, /^\/home/, /signup/, /^\/auth/, /^\/api\/brief-signup/, /stripe|billing|checkout/];
const RED_COUNT = 50;

function sh(args, input) {
  return execFileSync("gh", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });
}

async function fetchT(url, init = {}, ms = 25_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}

function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

async function readLog() {
  if (!HEALTH_TOKEN) return { note: "HEALTH_TOKEN not set: incident log not read, probes only.", incidents: [], cron: {} };
  try {
    const res = await fetchT(`${PROD_URL}/api/ops/incidents?hours=${WINDOW_HOURS}&t=${Date.now()}`, {
      headers: { authorization: `Bearer ${HEALTH_TOKEN}` },
    });
    if (res.status === 404) return { note: "/api/ops/incidents not deployed yet.", incidents: [], cron: {} };
    if (!res.ok) return { note: `/api/ops/incidents returned ${res.status}.`, incidents: [], cron: {}, failed: true };
    const body = await res.json();
    return { note: `store: ${body.store}, commit ${String(body.commit).slice(0, 7)}`, incidents: body.incidents ?? [], cron: body.cron_last_ok ?? {}, store: body.store };
  } catch (err) {
    return { note: `incident log unreachable: ${err?.message ?? err}`, incidents: [], cron: {}, failed: true };
  }
}

async function probe(path) {
  const sep = path.includes("?") ? "&" : "?";
  try {
    const res = await fetchT(`${PROD_URL}${path}${sep}watch=${Date.now()}`, {}, PROBE_TIMEOUT_MS);
    if (res.status >= 500) return `${path} returned ${res.status}`;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/html")) {
      const html = await res.text();
      for (const m of BAD_MARKERS) if (m.re.test(html)) return `${path} shows ${m.what}`;
    }
    return null;
  } catch (err) {
    return `${path} ${err?.name === "AbortError" ? "timed out" : "network error"}`;
  }
}

function severityOf(inc) {
  if (inc.source === "cron" && RED_CRONS.has(inc.key)) return "red";
  if (inc.source === "integrity" && RED_INTEGRITY.has(inc.key)) return "red";
  if (inc.source === "probe" && RED_PATHS.some((re) => re.test(inc.key))) return "red";
  if ((inc.source === "server_error" || inc.source === "client_error") && RED_PATHS.some((re) => re.test(inc.key.replace(/^(page|global):/, "")))) return "red";
  if (inc.count >= RED_COUNT) return "red";
  return "amber";
}

function fmtTime(ms) {
  return ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "n/a";
}

function issueBody(inc, sev) {
  let ctx = inc.context;
  try {
    ctx = JSON.stringify(JSON.parse(inc.context || "{}"), null, 2);
  } catch {
    /* keep raw */
  }
  return [
    `<!-- incident:${inc.fingerprint} -->`,
    `**${sev === "red" ? "Red" : "Amber"} incident** from the hourly incident watch. Contract: \`docs/team/INCIDENTS.md\`.`,
    "",
    "| Field | Value |",
    "|---|---|",
    `| Source | \`${inc.source}\` |`,
    `| Key | \`${inc.key}\` |`,
    `| Occurrences | ${inc.count} |`,
    `| First seen | ${fmtTime(inc.first_seen)} |`,
    `| Last seen | ${fmtTime(inc.last_seen)} |`,
    `| Commit | \`${String(inc.commit || "").slice(0, 7)}\` |`,
    "",
    "**Message**",
    "```",
    String(inc.message || "").slice(0, 1500),
    "```",
    "**Context**",
    "```json",
    String(ctx || "").slice(0, 2500),
    "```",
    "",
    "Next step: the on-call engineer routine picks this up, states \"the bug is X because Y\" with runtime evidence, adds a failing test that reproduces it, fixes the root cause, and opens a PR that says `Fixes #<this issue>`. Do not close this issue without a fix or a written reason.",
  ].join("\n");
}

function findIssue(fp) {
  const out = sh(["issue", "list", "--label", "incident", "--state", "all", "--search", `"incident:${fp}" in:body`, "--json", "number,state,closedAt", "--limit", "5"]);
  const list = JSON.parse(out || "[]");
  return list.find((i) => i.state === "OPEN") ?? list[0] ?? null;
}

function ensureLabels() {
  const labels = [
    ["incident", "d93f0b", "Production fault recorded by the incident watch"],
    ["severity:red", "b60205", "Red-tier incident: owner is interrupted"],
    ["severity:amber", "fbca04", "Amber incident: on-call fixes, no interrupt"],
    ["interrupt", "b60205", "Needs Isaiah now"],
    ["fix-in-progress", "0e8a16", "On-call engineer has a PR open"],
  ];
  for (const [name, color, desc] of labels) {
    try {
      sh(["label", "create", name, "--color", color, "--description", desc, "--force"]);
    } catch {
      /* exists or no permission: fine */
    }
  }
}

function upsertIssue(inc) {
  const sev = severityOf(inc);
  const title = `Incident (${sev}): ${inc.source} ${inc.key}: ${String(inc.message || "").replace(/\s+/g, " ").slice(0, 80)}`;
  const body = issueBody(inc, sev);
  if (DRY) {
    console.log(`[dry-run] ${sev} ${inc.fingerprint} ${title}`);
    return { action: "dry", sev };
  }
  const existing = findIssue(inc.fingerprint);
  if (!existing) {
    const args = ["issue", "create", "--title", title, "--body-file", "-", "--label", `incident,severity:${sev}`];
    if (sev === "red") args.push("--label", "interrupt", "--assignee", OWNER);
    const url = sh(args, body).trim();
    return { action: "opened", sev, url };
  }
  if (existing.state === "OPEN") {
    sh(["issue", "edit", String(existing.number), "--body-file", "-"], body);
    return { action: "updated", sev, url: `#${existing.number}` };
  }
  // Closed, but the fault happened again after it closed: reopen.
  const closedAt = Date.parse(existing.closedAt || "");
  if (Number.isFinite(closedAt) && inc.last_seen > closedAt) {
    sh(["issue", "reopen", String(existing.number)]);
    sh(["issue", "edit", String(existing.number), "--body-file", "-"], body);
    sh(["issue", "comment", String(existing.number), "--body", `Recurred after close: ${inc.count} occurrence(s), last ${fmtTime(inc.last_seen)}. The fix did not hold; on-call re-opens the investigation.`]);
    return { action: "reopened", sev, url: `#${existing.number}` };
  }
  return { action: "closed-no-recurrence", sev };
}

async function main() {
  const log = await readLog();
  console.log(`incident log: ${log.note}`);
  const incidents = [...log.incidents];

  // Probes, signed out. One retry so a single network blip is not an incident.
  for (const path of PROBES) {
    let fail = await probe(path);
    if (fail) fail = await probe(path);
    if (fail) {
      const now = Date.now();
      incidents.push({ fingerprint: fnv1a(`probe|${path}`), source: "probe", key: path, message: fail, context: "{}", count: 1, first_seen: now, last_seen: now, commit: "" });
    }
    console.log(`probe ${path}: ${fail ?? "ok"}`);
  }

  // Cron heartbeats. A null heartbeat means "never stamped since this
  // shipped"; only a stale stamp counts as stopped.
  for (const [name, maxH] of Object.entries(CRON_MAX_GAP_HOURS)) {
    const last = log.cron[name];
    if (typeof last === "number" && Date.now() - last > maxH * 3_600_000) {
      const now = Date.now();
      incidents.push({ fingerprint: fnv1a(`cron-stale|${name}`), source: "cron", key: name, message: `cron ${name} has not finished cleanly since ${fmtTime(last)} (allowed gap ${maxH}h)`, context: "{}", count: 1, first_seen: last, last_seen: now, commit: "" });
    }
    console.log(`cron ${name}: last ok ${typeof last === "number" ? fmtTime(last) : "never stamped"}`);
  }

  if (log.failed) {
    const now = Date.now();
    incidents.push({ fingerprint: fnv1a("watch|incident-log"), source: "probe", key: "/api/ops/incidents", message: log.note, context: "{}", count: 1, first_seen: now, last_seen: now, commit: "" });
  }

  if (!DRY) ensureLabels();
  // Red first, then by count. At most MAX_NEW new issues per run so a
  // first run over a noisy log cannot flood the tracker; anything left
  // over is still in the log and gets its issue on the next run.
  incidents.sort((a, b) => (severityOf(b) === "red") - (severityOf(a) === "red") || b.count - a.count);
  const results = [];
  let opened = 0;
  for (const inc of incidents) {
    if (opened >= MAX_NEW && !DRY) {
      try {
        if (!findIssue(inc.fingerprint)) {
          results.push({ inc, action: "deferred", sev: severityOf(inc) });
          continue;
        }
      } catch {
        continue;
      }
    }
    try {
      const r = upsertIssue(inc);
      if (r.action === "opened") opened++;
      results.push({ inc, ...r });
    } catch (err) {
      console.log(`issue upsert failed for ${inc.fingerprint}: ${err?.stderr || err?.message || err}`);
    }
  }
  const lines = results.map((r) => `- ${r.action} (${r.sev}) ${r.inc.source} ${r.inc.key}${r.url ? ` ${r.url}` : ""}`);
  const summary = `${incidents.length} incident(s) in the last ${WINDOW_HOURS}h window.\n${lines.join("\n")}`;
  console.log(summary);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `## Incident watch\n\n${log.note}\n\n${summary}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
