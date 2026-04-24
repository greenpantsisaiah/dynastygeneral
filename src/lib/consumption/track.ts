/**
 * Per-user, per-feature daily consumption tracking.
 *
 * Two responsibilities:
 *   1. Observe actual usage during beta. Without this, we're guessing
 *      about post-beta cap calibration. Every Coach turn / briefing
 *      batch increments a counter we can query for analytics.
 *   2. Enforce caps post-beta. Free-tier daily limits and the
 *      protective Pro cap (against the 1% extreme user) live here.
 *
 * Backed by Upstash Redis, same instance the rate limiter uses.
 * Daily key TTL handles the reset (day rolls over -> old key
 * expires; new key starts at 0).
 *
 * Caps are env-configurable so we can tune without redeploying.
 * Defaults match the values published on /pricing.
 *
 * During beta (BETA_OPEN_MODE=true), checkCap returns observed_only=true
 * so callers can record without enforcing. Logs preserve the fact that
 * the user WOULD have hit the cap, useful for tuning.
 */

import { Redis } from "@upstash/redis";
import { isBetaOpenMode } from "@/lib/billing/beta-mode";
import type { Tier } from "@/lib/auth/session";

export type Feature = "coach" | "briefing" | "multi_pick" | "verdict";

const DEFAULT_CAPS: Record<Tier, Record<Feature, number>> = {
  free: {
    coach: 5,
    briefing: 3,
    multi_pick: 1,
    verdict: 5,
  },
  pro: {
    // Pro caps are protective ceilings against the 1% extreme user
    // (someone running 5 leagues, 200 coach turns per draft). The
    // median Pro user won't see these caps. Tune from analytics
    // once we have actual beta consumption data.
    coach: 200,
    briefing: 100,
    multi_pick: 50,
    verdict: 100,
  },
};

const ENV_CAP_KEY: Record<Tier, Record<Feature, string>> = {
  free: {
    coach: "CAP_FREE_COACH_PER_DAY",
    briefing: "CAP_FREE_BRIEFINGS_PER_DAY",
    multi_pick: "CAP_FREE_MULTI_PICK_PER_DAY",
    verdict: "CAP_FREE_VERDICT_PER_DAY",
  },
  pro: {
    coach: "CAP_PRO_COACH_PER_DAY",
    briefing: "CAP_PRO_BRIEFINGS_PER_DAY",
    multi_pick: "CAP_PRO_MULTI_PICK_PER_DAY",
    verdict: "CAP_PRO_VERDICT_PER_DAY",
  },
};

function capFor(tier: Tier, feature: Feature): number {
  const envKey = ENV_CAP_KEY[tier][feature];
  const raw = process.env[envKey];
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_CAPS[tier][feature];
}

function todayKey(): string {
  // UTC day. Caps reset at midnight UTC; documented on /pricing FAQ.
  return new Date().toISOString().slice(0, 10);
}

function key(userId: string, feature: Feature): string {
  return `consumption:${userId}:${feature}:${todayKey()}`;
}

let redis: Redis | null = null;
let warned = false;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warned && process.env.NODE_ENV === "production") {
      console.error(
        "[consumption] Upstash unset in production. Per-user caps DISABLED. Beta-mode fall-open + global Anthropic budget cap remain.",
      );
      warned = true;
    }
    return null;
  }
  redis = new Redis({ url, token });
  return redis;
}

export type CapCheck = {
  // True when the call is allowed (under cap, OR enforcement is off
  // because of beta mode, OR Upstash is unavailable).
  allowed: boolean;
  // Caller passes this to recordUse() so we count even when allowed.
  // Skip recordUse() when allowed=false (no point counting denials).
  used: number;
  cap: number;
  // True when the cap WOULD have blocked but beta mode let it through.
  // Caller can log this for tuning.
  observed_only: boolean;
};

function dayPassKey(userId: string): string {
  return `day_pass:${userId}`;
}

/**
 * Grant a 24-hour unlimited usage pass to the user. Called from the
 * Stripe webhook on successful day_pass purchase. Idempotent (a
 * second purchase same day extends the pass).
 */
export async function grantDayPass(userId: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(dayPassKey(userId), "1", { ex: 24 * 60 * 60 });
  } catch (err) {
    console.error("[consumption:day-pass:grant]", err);
  }
}

/**
 * True when the user has an active Day Pass. Checked by checkCap to
 * skip enforcement. Quietly returns false on KV failure.
 */
export async function hasActiveDayPass(userId: string): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    const v = await r.get(dayPassKey(userId));
    return v != null;
  } catch {
    return false;
  }
}

/**
 * Pre-flight check: would this request exceed the user's daily cap?
 *
 * During beta: returns allowed=true regardless, with observed_only=true
 * when the cap would have fired. Caller still proceeds; we just know
 * for analytics that this call would have been denied post-beta.
 *
 * Active Day Pass: returns allowed=true regardless of usage. Caller
 * still records use for analytics.
 *
 * Post-beta + no Day Pass: returns allowed=false when used >= cap.
 * Caller should 429 with a structured response.
 *
 * When Upstash is unavailable (KV not provisioned), returns allowed=true
 * unconditionally. The global Anthropic budget cap in lib/budget.ts is
 * the safety net.
 */
export async function checkCap(
  userId: string,
  feature: Feature,
  tier: Tier,
): Promise<CapCheck> {
  const cap = capFor(tier, feature);
  const r = getRedis();
  if (!r) {
    return { allowed: true, used: 0, cap, observed_only: false };
  }
  // Day Pass short-circuits the cap. Read in parallel with usage so
  // the check doesn't add a serial round-trip.
  const [usedRaw, passRaw] = await Promise.all([
    r.get<string | number>(key(userId, feature)),
    r.get(dayPassKey(userId)),
  ]);
  const used = typeof usedRaw === "number" ? usedRaw : Number(usedRaw ?? 0);
  const wouldBlock = Number.isFinite(used) && used >= cap;
  const dayPass = passRaw != null;
  const beta = isBetaOpenMode();
  if (dayPass && wouldBlock) {
    console.info(
      `[consumption:day-pass-active] user=${userId} feature=${feature} used=${used} cap=${cap} (Day Pass active; not enforced)`,
    );
    return { allowed: true, used, cap, observed_only: false };
  }
  if (wouldBlock && beta) {
    console.info(
      `[consumption:observe] user=${userId} feature=${feature} tier=${tier} used=${used} cap=${cap} (beta open; not enforced)`,
    );
    return { allowed: true, used, cap, observed_only: true };
  }
  return {
    allowed: !wouldBlock,
    used: Number.isFinite(used) ? used : 0,
    cap,
    observed_only: false,
  };
}

export type FeatureUsage = {
  feature: Feature;
  used: number;
  cap: number;
  remaining: number;
  pct: number; // 0..1
  // True when the user is at or above 80% of cap. UI surfaces a
  // gentle warning chip color shift at this point.
  near_cap: boolean;
};

/**
 * Bulk read of the user's usage across all tracked features. One
 * round-trip to Upstash. Powers the visible "X of Y today" meter
 * on Coach + Account.
 *
 * Returns zero usage for every feature when Upstash isn't
 * configured. Never throws; meter degrades to "0 of N" silently.
 */
export async function getUsageSummary(
  userId: string,
  tier: Tier,
): Promise<FeatureUsage[]> {
  const features: Feature[] = ["coach", "briefing", "multi_pick", "verdict"];
  const r = getRedis();
  if (!r) {
    return features.map((feature) => {
      const cap = capFor(tier, feature);
      return {
        feature,
        used: 0,
        cap,
        remaining: cap,
        pct: 0,
        near_cap: false,
      };
    });
  }
  // mget batches the gets into one round-trip.
  const keys = features.map((f) => key(userId, f));
  const raw = await r.mget<Array<string | number | null>>(...keys);
  return features.map((feature, i) => {
    const cap = capFor(tier, feature);
    const v = raw[i];
    const used = typeof v === "number" ? v : Number(v ?? 0);
    const safe = Number.isFinite(used) ? used : 0;
    const remaining = Math.max(0, cap - safe);
    const pct = cap > 0 ? Math.min(1, safe / cap) : 0;
    return {
      feature,
      used: safe,
      cap,
      remaining,
      pct,
      near_cap: pct >= 0.8,
    };
  });
}

/**
 * Record one use. Atomic INCR with TTL on first set so the key
 * naturally expires at the end of the UTC day (with 2h buffer for
 * timezone slop). Best-effort: a missing Upstash means we silently
 * skip the record; the global budget cap remains the safety net.
 */
export async function recordUse(
  userId: string,
  feature: Feature,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    const k = key(userId, feature);
    const next = await r.incr(k);
    if (next === 1) {
      // First write of the day. Set expiry to ~26h so the day
      // rollover is clean across timezones.
      await r.expire(k, 26 * 60 * 60);
    }
  } catch (err) {
    console.error("[consumption:record]", err);
  }
}
