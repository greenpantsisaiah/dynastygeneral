/**
 * Per-deploy server error counter. Feeds the post-deploy tripwire
 * (`scripts/ops/post-deploy-tripwire.mjs`) through `/api/health`.
 *
 * Each server error captured by `src/instrumentation.ts` increments a
 * per-minute Upstash counter keyed by the deployed commit, so the
 * tripwire can ask "how many server errors has THIS commit thrown in the
 * last N minutes" and compare it with the commit it replaced.
 *
 * Fails open: with no Upstash configured (local dev, preview) every call
 * is a no-op and reads return null. Never throws.
 */

import { Redis } from "@upstash/redis";

const KEY_TTL_SECONDS = 3 * 60 * 60;

let client: Redis | null | undefined;
function redis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

/** The commit this instance is serving. Vercel injects it on every deploy. */
export function deployedCommit(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
}

function minuteBucket(ms: number): number {
  return Math.floor(ms / 60_000);
}

function keyFor(commit: string, minute: number): string {
  return `ops:errors:${commit}:${minute}`;
}

export async function recordServerError(nowMs = Date.now()): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    const key = keyFor(deployedCommit(), minuteBucket(nowMs));
    await r.incr(key);
    await r.expire(key, KEY_TTL_SECONDS);
  } catch (err) {
    console.error(
      "[error-counter] increment failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** Server errors for `commit` over the last `minutes` minutes, or null when unavailable. */
export async function readServerErrors(
  commit: string,
  minutes: number,
  nowMs = Date.now(),
): Promise<number | null> {
  const r = redis();
  if (!r) return null;
  const end = minuteBucket(nowMs);
  const keys: string[] = [];
  for (let m = end - minutes + 1; m <= end; m++) keys.push(keyFor(commit, m));
  try {
    const values = await r.mget<(number | string | null)[]>(...keys);
    return values.reduce<number>((sum, v) => sum + (Number(v) || 0), 0);
  } catch (err) {
    console.error(
      "[error-counter] read failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
