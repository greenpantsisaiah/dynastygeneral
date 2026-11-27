/**
 * Incident log: every production fault, recorded once per fingerprint.
 *
 * Why (2026-11-26): the hub showed Isaiah a red engine-integrity banner
 * that had been firing a `[hub:integrity]` server-log alarm for who knows
 * how long. Nothing read those logs. A log line nobody reads is not
 * detection. This module is the write side of the loop:
 *
 *   detect   recordIncident() from instrumentation (server 5xx), the
 *            console.error capture (every tagged silent catch), cron
 *            wrappers, the integrity suite, and the client error beacon.
 *   record   Upstash hash per fingerprint: count, first/last seen, the
 *            latest sample, commit. Deduped, so a fault on every request
 *            is one incident with a big count, not a flood.
 *   resolve  .github/workflows/incident-watch.yml reads
 *            /api/ops/incidents hourly, opens or updates one GitHub issue
 *            per fingerprint, and the on-call engineer routine turns each
 *            new issue into a fix PR (docs/team/INCIDENTS.md).
 *
 * Fails open: without Upstash (local dev, CI, preview without env) every
 * call is a no-op. Never throws, never awaits on the caller's hot path
 * longer than one Upstash round trip, and never logs through
 * console.error (that would re-enter the capture).
 */

import { Redis } from "@upstash/redis";
import { deployedCommit } from "./error-counter";

export type IncidentSource = "server_error" | "logged_error" | "cron" | "integrity" | "client_error" | "probe";

export interface IncidentInput {
  source: IncidentSource;
  /** Stable grouping key: a log tag, route, cron name, or integrity kind. */
  key: string;
  /** One-line message. Numbers and ids are normalized out of the fingerprint. */
  message: string;
  /** Small structured context (league id, evidence, path). Truncated. */
  context?: Record<string, string | number | boolean | null | undefined>;
}

export interface IncidentRecord {
  fingerprint: string;
  source: IncidentSource;
  key: string;
  message: string;
  context: string;
  count: number;
  first_seen: number;
  last_seen: number;
  commit: string;
}

/** Every cron in vercel.json. The incident watch flags one that stops stamping its heartbeat. */
export const CRON_NAMES = ["aar-notifications", "weekly-brief", "game-day"] as const;

const INDEX_KEY = "ops:incidents";
const RECORD_PREFIX = "ops:incident:";
const CRON_PREFIX = "ops:cron:last_ok:";
const TTL_SECONDS = 30 * 24 * 60 * 60;
/** Per-instance write throttle per fingerprint. The count stays honest within this window via `pending`. */
const LOCAL_FLUSH_MS = 60_000;

let client: Redis | null | undefined;
function redis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

/** Test hook: force the backing store (null disables). */
export function __setIncidentStore(r: Redis | null | undefined): void {
  client = r;
  lastFlush.clear();
  pending.clear();
}

/**
 * Normalize a message for grouping: digits, hex ids, UUIDs, quoted
 * strings and whitespace runs collapse, so "league 1315790476086878208
 * failed" and "league 1183924497274310656 failed" are one incident.
 */
export function normalizeForFingerprint(message: string): string {
  return message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>")
    .replace(/\b[0-9a-f]{12,}\b/g, "<hex>")
    .replace(/\d+(\.\d+)?/g, "<n>")
    .replace(/"[^"]{0,80}"|'[^']{0,80}'/g, "<s>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/** FNV-1a 32-bit, hex. Stable across runtimes, no crypto import. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function fingerprintOf(input: Pick<IncidentInput, "source" | "key" | "message">): string {
  // Integrity and cron incidents group by key alone (the kind / cron name
  // is the fault; the message carries per-league detail).
  const msgPart = input.source === "integrity" || input.source === "cron" ? "" : normalizeForFingerprint(input.message);
  return fnv1a(`${input.source}|${input.key}|${msgPart}`);
}

function trimContext(ctx: IncidentInput["context"]): string {
  if (!ctx) return "";
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (v === undefined) continue;
    out[k] = typeof v === "string" ? v.slice(0, 300) : v;
  }
  return JSON.stringify(out).slice(0, 1200);
}

const lastFlush = new Map<string, number>();
const pending = new Map<string, number>();

/**
 * Record one occurrence. Returns the fingerprint (useful for tests and for
 * linking a diagnose view to its incident). Never throws.
 */
export async function recordIncident(input: IncidentInput, nowMs = Date.now()): Promise<string> {
  const fp = fingerprintOf(input);
  const r = redis();
  if (!r) return fp;
  // Per-instance throttle: a fault on every request writes once a minute
  // per instance, carrying the occurrences it skipped in the count.
  const last = lastFlush.get(fp) ?? 0;
  if (nowMs - last < LOCAL_FLUSH_MS) {
    pending.set(fp, (pending.get(fp) ?? 0) + 1);
    return fp;
  }
  const inc = 1 + (pending.get(fp) ?? 0);
  pending.delete(fp);
  lastFlush.set(fp, nowMs);
  const key = RECORD_PREFIX + fp;
  try {
    const p = r.pipeline();
    p.hsetnx(key, "first_seen", nowMs);
    p.hincrby(key, "count", inc);
    p.hset(key, {
      source: input.source,
      key: input.key.slice(0, 120),
      message: input.message.slice(0, 500),
      context: trimContext(input.context),
      last_seen: nowMs,
      commit: deployedCommit(),
    });
    p.expire(key, TTL_SECONDS);
    p.zadd(INDEX_KEY, { score: nowMs, member: fp });
    await p.exec();
  } catch (err) {
    // console.warn, not console.error: the error capture wraps console.error.
    console.warn("[incidents] record failed:", err instanceof Error ? err.message : String(err));
  }
  return fp;
}

/** New client_error fingerprints admitted per hour before the rest fold into one overflow incident. */
export const CLIENT_ERROR_NEW_PER_HOUR = 25;
const CLIENT_FP_PREFIX = "ops:client_fp:";

/**
 * Bound how many distinct client_error incidents the public beacon can
 * create (issue #162). A fingerprint already seen this hour passes; a new
 * one passes while the hour's set is under CLIENT_ERROR_NEW_PER_HOUR;
 * past that the report becomes the single "client_error / overflow"
 * incident, so a flood of junk messages shows as one entry with a count.
 * Fails open (returns the input) when the store is unavailable.
 */
export async function admitClientIncident(input: IncidentInput, nowMs = Date.now()): Promise<IncidentInput> {
  if (input.source !== "client_error") return input;
  const r = redis();
  if (!r) return input;
  const fp = fingerprintOf(input);
  const setKey = CLIENT_FP_PREFIX + Math.floor(nowMs / 3_600_000);
  try {
    if (await r.sismember(setKey, fp)) return input;
    const n = Number(await r.scard(setKey));
    if (n >= CLIENT_ERROR_NEW_PER_HOUR) {
      return {
        source: "client_error",
        key: "overflow",
        message: `More than ${CLIENT_ERROR_NEW_PER_HOUR} distinct client errors this hour; extra reports grouped here`,
        context: { sample_key: input.key.slice(0, 120), sample_message: input.message.slice(0, 200) },
      };
    }
    await r.sadd(setKey, fp);
    await r.expire(setKey, 7200);
  } catch (err) {
    console.warn("[incidents] client cap check failed:", err instanceof Error ? err.message : String(err));
  }
  return input;
}

/** Fire-and-forget form for hot paths and log hooks. */
export function recordIncidentSoon(input: IncidentInput): void {
  void recordIncident(input).catch(() => {});
}

/** Incidents seen since `sinceMs`, newest first. Null when the store is unavailable. */
export async function readIncidents(sinceMs: number, limit = 200): Promise<IncidentRecord[] | null> {
  const r = redis();
  if (!r) return null;
  try {
    const fps = (await r.zrange(INDEX_KEY, "+inf", sinceMs, { byScore: true, rev: true, offset: 0, count: limit })) as string[];
    const out: IncidentRecord[] = [];
    for (const fp of fps) {
      const h = (await r.hgetall(RECORD_PREFIX + fp)) as Record<string, unknown> | null;
      if (!h) continue;
      out.push({
        fingerprint: fp,
        source: String(h.source ?? "logged_error") as IncidentSource,
        key: String(h.key ?? ""),
        message: String(h.message ?? ""),
        context: typeof h.context === "string" ? h.context : JSON.stringify(h.context ?? ""),
        count: Number(h.count ?? 0),
        first_seen: Number(h.first_seen ?? 0),
        last_seen: Number(h.last_seen ?? 0),
        commit: String(h.commit ?? ""),
      });
    }
    return out;
  } catch (err) {
    console.warn("[incidents] read failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Cron heartbeat: the last time each cron finished without a 5xx. */
export async function markCronOk(name: string, nowMs = Date.now()): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.set(CRON_PREFIX + name, nowMs, { ex: TTL_SECONDS });
  } catch {
    /* fail open */
  }
}

export async function readCronHeartbeats(names: readonly string[]): Promise<Record<string, number | null> | null> {
  const r = redis();
  if (!r) return null;
  try {
    const vals = await r.mget<(number | string | null)[]>(...names.map((n) => CRON_PREFIX + n));
    return Object.fromEntries(names.map((n, i) => [n, vals[i] == null ? null : Number(vals[i])]));
  } catch {
    return null;
  }
}

/**
 * Wrap a cron GET handler: a throw or a 5xx response records a `cron`
 * incident; anything else stamps the heartbeat, so the watcher can also
 * flag a cron that stopped running at all.
 */
export function withCronIncidents(
  name: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      const res = await handler(req);
      if (res.status >= 500) {
        let detail = "";
        try {
          detail = (await res.clone().text()).slice(0, 300);
        } catch {
          /* body unreadable */
        }
        await recordIncident({ source: "cron", key: name, message: `cron ${name} returned ${res.status}`, context: { body: detail } });
      } else if (res.status < 400) {
        await markCronOk(name);
      }
      return res;
    } catch (err) {
      await recordIncident({
        source: "cron",
        key: name,
        message: `cron ${name} threw: ${err instanceof Error ? err.message : String(err)}`,
        context: { stack: err instanceof Error ? (err.stack ?? "").split("\n").slice(0, 4).join(" | ") : null },
      });
      throw err;
    }
  };
}

/**
 * Tagged console.error lines are this codebase's silent-catch convention
 * (`console.error("[hub:decision-synthesis]", err)`). Pull the tag and a
 * message out of the arguments so each distinct silent catch becomes one
 * incident. Returns null for untagged noise.
 */
export function incidentFromConsoleArgs(args: unknown[]): IncidentInput | null {
  const first = args[0];
  if (typeof first !== "string") return null;
  const m = first.match(/^\[([a-z0-9:_\-./]+)\]/i);
  if (!m) return null;
  const tag = m[1];
  // Recorder's own tags never re-enter.
  if (tag.startsWith("incidents") || tag.startsWith("error-counter")) return null;
  // Integrity alarms are recorded explicitly per kind (source "integrity").
  if (tag.endsWith(":integrity")) return null;
  const rest = args
    .slice(1)
    .map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : (() => {
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })()))
    .join(" ");
  const errArg = args.find((a): a is Error => a instanceof Error);
  return {
    source: "logged_error",
    key: tag,
    message: `${first.slice(m[0].length).trim()} ${rest}`.trim().slice(0, 500) || tag,
    context: errArg?.stack ? { stack: errArg.stack.split("\n").slice(0, 4).join(" | ") } : undefined,
  };
}

let consoleHooked = false;
/**
 * Mirror tagged console.error calls into the incident log. Installed once
 * per Node server instance from instrumentation `register()`. The original
 * console.error still runs first, so Vercel logs are unchanged.
 */
export function installConsoleErrorCapture(): void {
  if (consoleHooked) return;
  consoleHooked = true;
  const original = console.error.bind(console);
  let inside = false;
  console.error = (...args: unknown[]) => {
    original(...args);
    if (inside) return;
    inside = true;
    try {
      const inc = incidentFromConsoleArgs(args);
      if (inc) recordIncidentSoon(inc);
    } finally {
      inside = false;
    }
  };
}
