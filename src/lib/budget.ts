/**
 * Anthropic daily spend cap.
 *
 * Tracks total tokens used per day, converts to estimated USD via model
 * pricing, and refuses new LLM calls when the day's cap is exceeded.
 * Uses Upstash Redis when configured; otherwise no-op (allow all).
 *
 * Cap is controlled by ANTHROPIC_DAILY_USD_CAP env var (default $25).
 * Tracking key is bucketed per UTC day so daily reset is automatic.
 *
 * This is a safety net, not a billing system. It's intentionally
 * loose: if the Redis check fails for any reason we fall open rather
 * than block legit users. The hard stop should also be set in the
 * Anthropic console (Settings → Limits → Monthly usage limit).
 */

import { Redis } from "@upstash/redis";
import { alertOps } from "@/lib/ops/alert";

// claude-sonnet-4-6 pricing as of 2026. Update when pricing changes.
// Dollars per 1M tokens.
const PRICING_PER_MTOK: Record<
  string,
  { input: number; output: number }
> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-7": { input: 15, output: 75 },
  // Fallback
  default: { input: 3, output: 15 },
};

// Web search tool fee. Anthropic bills web search as a separate line
// item from message tokens: ~$10 per 1000 requests. Per
// dynasty-cost-watcher 2026-04-25 audit: prior recordSpend captured
// only input/output tokens, so search-augmented Coach turns under-
// reported actual cost by the search-tool fee. Fixed below.
const WEB_SEARCH_USD_PER_REQUEST = 0.01;

// Default daily cap. Per cost-watcher 2026-04-25 audit at projected
// alpha mix (100 free + 10 Pro at full per-user caps): realistic
// daily spend under non-malicious load is ~$244. The $25 default
// would have triggered well before normal Pro usage was exhausted
// and blocked legitimate users.
//
// $75 covers normal alpha load, leaves margin, and stops cold any
// rate-limit-saturation attack since per-IP single-endpoint
// exposure (post the 2026-04-25 fixes) lands at ~$15/day on
// strategy-Opus and ~$11/day on scout. Override per env via
// ANTHROPIC_DAILY_USD_CAP. Raise to $200 for beta scale.
const DEFAULT_CAP_USD = 75;

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

function capUsd(): number {
  const raw = process.env.ANTHROPIC_DAILY_USD_CAP;
  const parsed = raw ? Number.parseFloat(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CAP_USD;
}

function todayUtcKey(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `dg:budget:${y}-${m}-${d}`;
}

/**
 * Check whether we're under the daily USD cap. Call BEFORE making an
 * LLM request. Returns `{ allowed, ... }`. When Upstash isn't configured
 * (dev), always allows and reports enforced=false.
 */
export async function checkBudget(): Promise<{
  allowed: boolean;
  spent_usd: number;
  cap_usd: number;
  enforced: boolean;
}> {
  const r = getRedis();
  const cap = capUsd();
  if (!r) {
    return { allowed: true, spent_usd: 0, cap_usd: cap, enforced: false };
  }
  try {
    const key = todayUtcKey();
    const raw = await r.get<string | number>(key);
    const spent =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? Number.parseFloat(raw) || 0
          : 0;
    const allowed = spent < cap;
    if (!allowed) {
      // The day's LLM features are paused until UTC midnight. Could be
      // organic load or an attack saturating the rate limits; either way
      // the founder wants to know now, not from a confused user report.
      // alertOps dedupes per kind, so the per-request re-check while over
      // cap does not spam the inbox.
      alertOps({
        kind: "budget_cap_reached",
        summary: `Daily Anthropic budget cap reached: $${spent.toFixed(2)} of $${cap.toFixed(2)}. LLM features are paused until UTC midnight.`,
        values: { spent_usd: Number(spent.toFixed(2)), cap_usd: cap },
      });
    }
    return {
      allowed,
      spent_usd: spent,
      cap_usd: cap,
      enforced: true,
    };
  } catch (err) {
    // Fail open on Redis errors; budget cap is a safety net, not an auth check.
    console.error("[budget:check]", err);
    return { allowed: true, spent_usd: 0, cap_usd: cap, enforced: false };
  }
}

// Prompt-cache billing multipliers on the base input rate. Cache reads
// bill at 0.1x; 5-minute cache writes bill at 1.25x. Anthropic reports
// these token classes separately from `input_tokens`, so without them a
// cached turn under-reports (reads) or over-saves (writes) its cost.
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

export type SpendArgs = {
  model: string;
  input_tokens: number;
  output_tokens: number;
  // response.usage.cache_read_input_tokens / cache_creation_input_tokens.
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  // Optional: number of web_search tool requests this turn used.
  // Read from response.usage.server_tool_use?.web_search_requests
  // when calling. Anthropic bills these separately from message
  // tokens (~$10 per 1000 requests). Without this field, search-
  // augmented turns under-report cost.
  web_search_requests?: number;
  // Optional: the signed-in user who caused the spend. When present the
  // cost also accumulates on a per-user monthly counter, which is what
  // the cost-per-user estimate and the free-tier spend ceiling read.
  userId?: string | null;
};

/** Pure: estimated USD for one Anthropic response. */
export function costUsd(args: SpendArgs): number {
  const price = PRICING_PER_MTOK[args.model] ?? PRICING_PER_MTOK.default;
  const perTok = price.input / 1_000_000;
  const tokenUsd =
    args.input_tokens * perTok +
    (args.cache_read_input_tokens ?? 0) * perTok * CACHE_READ_MULTIPLIER +
    (args.cache_creation_input_tokens ?? 0) * perTok * CACHE_WRITE_MULTIPLIER +
    (args.output_tokens / 1_000_000) * price.output;
  const searchUsd =
    (args.web_search_requests ?? 0) * WEB_SEARCH_USD_PER_REQUEST;
  return tokenUsd + searchUsd;
}

/** Per-user monthly spend key, UTC month. */
export function userMonthSpendKey(userId: string, now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `dg:spend:user:${userId}:${y}-${m}`;
}

/**
 * Record spend from a completed Anthropic response. Call AFTER the
 * request succeeds. Token counts come from response.usage.
 */
export async function recordSpend(args: SpendArgs): Promise<void> {
  const r = getRedis();
  if (!r) return;
  const usd = costUsd(args);
  if (!Number.isFinite(usd) || usd <= 0) return;
  try {
    const key = todayUtcKey();
    // INCRBYFLOAT accumulates per day. Key lives 48h to cover UTC
    // rollover confusion without leaking history.
    await r.incrbyfloat(key, usd);
    await r.expire(key, 60 * 60 * 48);
    if (args.userId) {
      // Per-user month total. 40-day TTL keeps last month readable for
      // the product steward's cost-per-user readout after rollover.
      const uk = userMonthSpendKey(args.userId);
      await r.incrbyfloat(uk, usd);
      await r.expire(uk, 60 * 60 * 24 * 40);
    }
  } catch (err) {
    console.error("[budget:record]", err);
  }
}

/** Month-to-date spend for one user, in USD. 0 when Redis is absent. */
export async function getUserMonthSpend(userId: string): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  try {
    const raw = await r.get<string | number>(userMonthSpendKey(userId));
    const n = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? 0));
    return Number.isFinite(n) ? n : 0;
  } catch (err) {
    console.error("[budget:user-month]", err);
    return 0;
  }
}
