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
    return {
      allowed: spent < cap,
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

/**
 * Record spend from a completed Anthropic response. Call AFTER the
 * request succeeds. Token counts come from response.usage.
 */
export async function recordSpend(args: {
  model: string;
  input_tokens: number;
  output_tokens: number;
}): Promise<void> {
  const r = getRedis();
  if (!r) return;
  const price =
    PRICING_PER_MTOK[args.model] ?? PRICING_PER_MTOK.default;
  const usd =
    (args.input_tokens / 1_000_000) * price.input +
    (args.output_tokens / 1_000_000) * price.output;
  if (!Number.isFinite(usd) || usd <= 0) return;
  try {
    const key = todayUtcKey();
    // INCRBYFLOAT accumulates per day. Key lives 48h to cover UTC
    // rollover confusion without leaking history.
    await r.incrbyfloat(key, usd);
    await r.expire(key, 60 * 60 * 48);
  } catch (err) {
    console.error("[budget:record]", err);
  }
}
