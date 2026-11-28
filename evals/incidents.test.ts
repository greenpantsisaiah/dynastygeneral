/**
 * Incident detection + user-facing integrity copy (docs/team/INCIDENTS.md).
 *
 *   npx tsx --tsconfig tsconfig.json evals/incidents.test.ts
 *
 * Locks: (1) fingerprints group the same fault across ids and numbers and
 * separate different faults; (2) tagged console.error lines become
 * incidents and the recorder's own tags never re-enter; (3) every
 * integrity kind has a plain-language user line with no engine vocabulary
 * or em dash; (4) the canonical fantasy position resolves two-way players;
 * (5) the cron wrapper records a 5xx and a throw.
 */

import { fingerprintOf, incidentFromConsoleArgs, withCronIncidents, recordIncident, __setIncidentStore, admitClientIncident, CLIENT_ERROR_NEW_PER_HOUR } from "../src/lib/ops/incidents";
import { isSameOriginBeacon, routeKeyFor } from "../src/lib/ops/client-error-guard";
import { userFacingIntegrityNote, userFacingIntegrityNotes, type IntegrityIssue, type IntegrityKind } from "../src/lib/players/integrity";
import { playerPosition } from "../src/lib/strategy/archetypes/schema";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` (${detail})` : ""}`);
}

// Minimal in-memory stand-in for the Upstash pipeline calls the recorder uses.
function fakeStore() {
  const hashes = new Map<string, Record<string, unknown>>();
  const writes: string[] = [];
  const pipe = () => {
    const ops: Array<() => void> = [];
    const api = {
      hsetnx: (k: string, f: string, v: unknown) => (ops.push(() => { const h = hashes.get(k) ?? {}; if (!(f in h)) h[f] = v; hashes.set(k, h); }), api),
      hincrby: (k: string, f: string, n: number) => (ops.push(() => { const h = hashes.get(k) ?? {}; h[f] = Number(h[f] ?? 0) + n; hashes.set(k, h); }), api),
      hset: (k: string, o: Record<string, unknown>) => (ops.push(() => { hashes.set(k, { ...(hashes.get(k) ?? {}), ...o }); writes.push(k); }), api),
      expire: () => api,
      zadd: () => api,
      exec: async () => ops.forEach((o) => o()),
    };
    return api;
  };
  return { store: { pipeline: pipe, set: async () => "OK" } as never, hashes, writes };
}

async function main() {
  console.log("fingerprints");
  const a = fingerprintOf({ source: "logged_error", key: "hub:decision-synthesis", message: "league 1315790476086878208 failed after 3 tries" });
  const b = fingerprintOf({ source: "logged_error", key: "hub:decision-synthesis", message: "league 1183924497274310656 failed after 4 tries" });
  const c = fingerprintOf({ source: "logged_error", key: "hub:decision-synthesis", message: "Cannot read properties of undefined" });
  check("same fault across ids groups to one fingerprint", a === b);
  check("a different message is a different fingerprint", a !== c);
  const i1 = fingerprintOf({ source: "integrity", key: "position_unknown", message: "1 player on your roster" });
  const i2 = fingerprintOf({ source: "integrity", key: "position_unknown", message: "3 players on your roster" });
  check("integrity groups by kind alone", i1 === i2);

  console.log("console capture");
  const inc = incidentFromConsoleArgs(["[cron:weekly-brief:sleeper]", "user-1", new Error("Sleeper 503")]);
  check("tagged console.error becomes an incident", inc?.key === "cron:weekly-brief:sleeper" && /Sleeper 503/.test(inc.message));
  check("untagged noise is ignored", incidentFromConsoleArgs(["something happened"]) === null);
  check("recorder tags never re-enter", incidentFromConsoleArgs(["[incidents] record failed:", "x"]) === null);
  check("integrity log line is left to the explicit recorder", incidentFromConsoleArgs(["[hub:integrity]", "x"]) === null);

  console.log("user-facing integrity copy");
  const kinds: IntegrityKind[] = [
    "pool_missing_player", "drafted_in_available", "roster_not_found", "roster_identity_mismatch",
    "position_unknown", "format_mismatch", "cache_stale", "starter_reqs_drift", "availability_incoherent",
    "cross_source_position", "weak_recommendation", "pricing_unresolved",
  ];
  for (const kind of kinds) {
    const line = userFacingIntegrityNote({ kind, severity: "severe", headline: "", detail: "", evidence: "" });
    const bad = /engine integrity|diagnose|snap\.|player_ids|severe|—/i.test(line) || line.length < 20;
    check(`${kind}: plain line`, !bad, line);
  }

  const iss = (kind: IntegrityKind, value?: number): IntegrityIssue => ({ kind, severity: "severe", headline: "", detail: "", evidence: "", value });
  check("pool line names top 200, not top 100", /top-200/.test(userFacingIntegrityNote(iss("pool_missing_player"))));
  check("pool line counts several players", /^3 top-200 players are/.test(userFacingIntegrityNotes([iss("pool_missing_player"), iss("pool_missing_player"), iss("pool_missing_player")])[0]));
  check("stale line states the real age", /52 hours old/.test(userFacingIntegrityNote(iss("cache_stale", 52))));
  check("no line says nothing for you to do", kinds.every((k) => !/nothing for you/i.test(userFacingIntegrityNote(iss(k)))));
  const many = userFacingIntegrityNotes([iss("cache_stale", 50), iss("drafted_in_available"), iss("format_mismatch"), iss("pricing_unresolved"), iss("roster_identity_mismatch")]);
  check("lines sorted by impact (identity first)", /another manager/.test(many[0]) && /values did not load/.test(many[1]));
  check("cap adds a hidden-count line", many.length === 4 && many[3] === "2 more data issues logged for a fix.", many.join(" | "));

  console.log("canonical player position (two-way players)");
  check("Travis Hunter (DB, [DB, WR]) reads WR", playerPosition({ position: "DB", fantasy_positions: ["DB", "WR"] }) === "WR");
  check("a plain WR is unchanged", playerPosition({ position: "WR", fantasy_positions: ["WR"] }) === "WR");
  check("DEF normalizes to DST", playerPosition({ position: "DEF", fantasy_positions: ["DEF"] }) === "DST");
  check("a pure IDP player has no fantasy position", playerPosition({ position: "LB", fantasy_positions: ["LB"] }) === null);
  check("null position falls back to fantasy_positions", playerPosition({ position: null, fantasy_positions: ["RB"] }) === "RB");

  console.log("cron wrapper + recorder");
  const fake = fakeStore();
  __setIncidentStore(fake.store);
  const failing = withCronIncidents("weekly-brief", async () => new Response("{\"error\":\"send_guard_refused\"}", { status: 503 }));
  const res = await failing(new Request("https://x/api/cron/weekly-brief"));
  check("5xx passes through unchanged", res.status === 503);
  check("5xx records a cron incident", [...fake.hashes.values()].some((h) => h.source === "cron" && h.key === "weekly-brief"));
  const throwing = withCronIncidents("game-day", async () => { throw new Error("boom"); });
  let threw = false;
  try { await throwing(new Request("https://x/api/cron/game-day")); } catch { threw = true; }
  check("a throw is rethrown and recorded", threw && [...fake.hashes.values()].some((h) => h.key === "game-day" && /boom/.test(String(h.message))));
  const now = Date.now();
  const before = fake.writes.length;
  for (let k = 0; k < 5; k++) await recordIncident({ source: "server_error", key: "/x", message: "same" }, now + k);
  await recordIncident({ source: "server_error", key: "/x", message: "same" }, now + 120_000);
  const h = [...fake.hashes.values()].find((x) => x.key === "/x");
  check("throttled writes keep an honest count", fake.writes.length - before === 2 && Number(h?.count) === 6, `writes=${fake.writes.length - before} count=${h?.count}`);
  __setIncidentStore(undefined);

  // Client-error beacon abuse guards (issue #162).
  const hdr = (o: Record<string, string>) => new Headers(o);
  check("beacon: same-origin Origin passes", isSameOriginBeacon(hdr({ origin: "https://dynastygeneral.app", host: "dynastygeneral.app", "sec-fetch-site": "same-origin" })));
  check("beacon: preview host matches its own Origin", isSameOriginBeacon(hdr({ origin: "https://dg-abc.vercel.app", host: "dg-abc.vercel.app" })));
  check("beacon: cross-site Origin refused", !isSameOriginBeacon(hdr({ origin: "https://evil.example", host: "dynastygeneral.app" })));
  check("beacon: cross-site fetch metadata refused", !isSameOriginBeacon(hdr({ "sec-fetch-site": "cross-site", host: "dynastygeneral.app" })));
  check("beacon: no Origin falls to the rate limit", isSameOriginBeacon(hdr({ host: "dynastygeneral.app" })));
  check("route key: ids collapse", routeKeyFor("/leagues/1315790476086878208/trade") === "/leagues/[id]/trade" && routeKeyFor("/leagues/1183924497274310656/trade") === "/leagues/[id]/trade");
  check("route key: junk segments collapse", routeKeyFor("/%3Cscript%3E") === "/[x]" && routeKeyFor("/a/b/c/d/e") === "/a/b/c");
  check("route key: non-path is unknown", routeKeyFor("https://x.y/z") === "unknown" && routeKeyFor(null) === "unknown");

  const sets = new Map<string, Set<string>>();
  __setIncidentStore({
    sismember: async (k: string, m: string) => (sets.get(k)?.has(m) ? 1 : 0),
    scard: async (k: string) => sets.get(k)?.size ?? 0,
    sadd: async (k: string, m: string) => { const x = sets.get(k) ?? new Set<string>(); x.add(m); sets.set(k, x); return 1; },
    expire: async () => 1,
  } as never);
  const at = Date.UTC(2026, 10, 27, 3, 0, 0);
  const mk = (i: number) => ({ source: "client_error" as const, key: `page:/r${String.fromCharCode(97 + (i % 26))}${i}`, message: `crash kind ${String.fromCharCode(97 + (i % 26))}` });
  const admitted = [];
  for (let i = 0; i < CLIENT_ERROR_NEW_PER_HOUR + 10; i++) admitted.push(await admitClientIncident(mk(i), at));
  const overflow = admitted.filter((x) => x.key === "overflow").length;
  check("cap: new client fingerprints past the hourly cap fold into overflow", overflow === 10, `overflow=${overflow}`);
  check("cap: a fingerprint already admitted this hour still passes", (await admitClientIncident(mk(0), at)).key === mk(0).key);
  check("cap: the next hour starts a fresh budget", (await admitClientIncident(mk(99), at + 3_600_000)).key === mk(99).key);
  check("cap: overflow is one fingerprint", new Set(admitted.filter((x) => x.key === "overflow").map((x) => fingerprintOf(x))).size === 1);
  check("cap: other sources untouched", (await admitClientIncident({ source: "server_error", key: "k", message: "m" }, at)).key === "k");
  __setIncidentStore(undefined);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
