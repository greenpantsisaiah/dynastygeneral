/**
 * Rate limiting for expensive endpoints (LLM calls).
 *
 * Uses Upstash Redis when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * are set. Falls back to "allow-all + log" when they aren't, so dev works
 * without external infra but production gets real protection.
 *
 * Identifier scheme: IP address + logical bucket (coach / briefings /
 * decisions). Same IP spamming /coach for one league is one cost center
 * to us, so bucket = endpoint, not leagueId.
 *
 * Limits are deliberately tight for launch. We can relax later when we
 * see real usage patterns.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type BucketName =
  | "coach"
  | "briefings"
  | "decisions"
  | "scout"
  | "decisions-strategy"
  | "players-search"
  | "feedback"
  | "league-refresh"
  | "waitlist"
  | "account-action";

type LimitSpec = {
  // Requests allowed
  requests: number;
  // Window, accepted by @upstash/ratelimit as a string ("10 s", "1 m", etc)
  window: `${number} ${"s" | "m" | "h" | "d"}`;
};

const LIMITS: Record<BucketName, LimitSpec> = {
  coach: { requests: 10, window: "5 m" }, // 10 coach chats per 5 min per IP
  briefings: { requests: 5, window: "10 m" }, // 5 briefings runs per 10 min per IP
  decisions: { requests: 20, window: "5 m" }, // pick + trade decisions
  // Strategy uses Opus (5x cost). Split into its own bucket so a bot can't
  // burn the full decisions allowance on the most expensive endpoint. Per
  // cost-watcher audit 2026-04-22: shared bucket = $1,008/day single-IP exposure.
  "decisions-strategy": { requests: 5, window: "1 h" },
  // Scout is a public, force-dynamic page that calls Sonnet with 4000 max
  // output tokens. Pre-audit it had no rate limit at all (single biggest
  // exposure: $1,558-$7,793/day from a single bot per cost-watcher audit
  // 2026-04-22). Tight bucket appropriate; legitimate users only need a
  // handful of scout views per session.
  scout: { requests: 3, window: "10 m" },
  // Player autocomplete: high frequency by design (every keystroke
  // triggers a debounced fetch), but cap so a bot can't loop through
  // q=a..q=zzz busting the cache + forcing a full pool scan each
  // time. Per security-auditor 2026-04-23: each call holds the full
  // player pool in memory and CPU-scans it.
  "players-search": { requests: 60, window: "1 m" },
  // In-app feedback. Tight cap so a bot can't flood the table; legit
  // users send 1-2 submissions per session.
  feedback: { requests: 5, window: "1 m" },
  // League refresh: per-user, generous for live draft but caps abuse.
  "league-refresh": { requests: 5, window: "1 m" },
  // Waitlist: public form, tight to prevent spam.
  waitlist: { requests: 3, window: "1 m" },
  // Account export + wipe: auth-required, destructive or data-heavy.
  "account-action": { requests: 5, window: "1 m" },
};

let redis: Redis | null = null;
const limiters = new Map<BucketName, Ratelimit>();

let warnedMissingUpstash = false;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    // Production deploys without Upstash silently lose rate limiting AND
    // budget enforcement. Make it loud once per process so misconfiguration
    // is visible in Vercel function logs.
    if (!warnedMissingUpstash && process.env.NODE_ENV === "production") {
      console.error(
        "[ratelimit] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN missing in production. Rate limiting AND budget cap are DISABLED. Provision Upstash before serving real traffic.",
      );
      warnedMissingUpstash = true;
    }
    return null;
  }
  redis = new Redis({ url, token });
  return redis;
}

function getLimiter(bucket: BucketName): Ratelimit | null {
  const cached = limiters.get(bucket);
  if (cached) return cached;
  const r = getRedis();
  if (!r) return null;
  const spec = LIMITS[bucket];
  const limiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(spec.requests, spec.window),
    analytics: true,
    prefix: `dg:rl:${bucket}`,
  });
  limiters.set(bucket, limiter);
  return limiter;
}

export type RateLimitResult = {
  allowed: boolean;
  // Remaining calls in the current window (approximate)
  remaining: number;
  // Total limit in the window
  limit: number;
  // Human-readable reset window
  reset_ms: number;
  // Whether rate limiting is actually enforced (vs. open-for-dev)
  enforced: boolean;
};

/**
 * Check if an IP is allowed to hit a bucket. Call BEFORE doing the
 * expensive work. When Upstash isn't configured, returns
 * `{ allowed: true, enforced: false }` so dev flows aren't blocked.
 */
export async function checkRateLimit(
  bucket: BucketName,
  ip: string | null,
): Promise<RateLimitResult> {
  const limiter = getLimiter(bucket);
  const spec = LIMITS[bucket];
  if (!limiter) {
    return {
      allowed: true,
      remaining: spec.requests,
      limit: spec.requests,
      reset_ms: 0,
      enforced: false,
    };
  }
  // Use a stable identifier. If we don't have an IP (local dev), use a
  // shared "anon" key so the anonymous bucket still gets throttled.
  const identifier = ip || "anon";
  const { success, limit, remaining, reset } = await limiter.limit(identifier);
  return {
    allowed: success,
    remaining,
    limit,
    reset_ms: reset - Date.now(),
    enforced: true,
  };
}

/**
 * Extract client IP from a Next.js Request. Prefers Vercel's
 * `x-forwarded-for` (which Vercel populates with the real client IP).
 */
export function clientIpFrom(req: Request): string | null {
  return clientIpFromHeaders(req.headers);
}

/**
 * Server-component variant. Use with `headers()` from `next/headers`.
 * Server components don't receive a Request directly.
 */
export function clientIpFromHeaders(hdrs: Headers): string | null {
  const xff = hdrs.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = hdrs.get("x-real-ip");
  if (real) return real.trim();
  return null;
}
