import { NextResponse } from "next/server";
import { isEnforcementConfigured } from "@/lib/ratelimit";
import { isRealProduction } from "@/lib/ops/runtime";
import { alertOps } from "@/lib/ops/alert";

/**
 * Fail-closed guard for LLM-touching surfaces.
 *
 * When rate limiting AND the daily budget cap cannot be enforced
 * because Upstash is not configured, the #1 threat in the model (LLM
 * cost exhaustion) is undefended. In real production we refuse the call
 * rather than serve unprotected and silently drain the Anthropic
 * budget. In dev and preview (no Upstash expected) we allow, so local
 * and preview flows keep working.
 *
 * Scope: this guards ONLY the persistent misconfiguration case (env
 * vars absent). Transient Redis errors keep the existing fail-open
 * behavior in checkRateLimit / checkBudget, so a momentary Upstash blip
 * does not take LLM features down.
 */

const ENFORCEMENT_ALERT = {
  kind: "enforcement_unconfigured",
  summary:
    "LLM request refused: Upstash is not configured, so rate limiting and the daily budget cap are disabled in production.",
  detail:
    "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel (the Upstash-native names, not KV_*). LLM endpoints return 503 until enforcement is restored.",
} as const;

/**
 * Route guard. Returns a 503 Response to return immediately, or null to
 * proceed. Call at the top of every LLM-touching API route, before the
 * rate-limit and budget checks.
 */
export function guardLlmEnforcement(): NextResponse | null {
  if (!isRealProduction()) return null;
  if (isEnforcementConfigured()) return null;

  alertOps(ENFORCEMENT_ALERT);

  return NextResponse.json(
    {
      error: "service_unavailable",
      message:
        "Analysis is temporarily unavailable. The team has been alerted and is restoring service.",
    },
    { status: 503, headers: { "retry-after": "120" } },
  );
}

/**
 * Server-component variant. Returns true when an LLM-backed page must
 * render an unavailable state instead of doing the work. Fires the same
 * alert (deduped) as the route guard.
 */
export function isLlmEnforcementDown(): boolean {
  if (!isRealProduction()) return false;
  if (isEnforcementConfigured()) return false;
  alertOps(ENFORCEMENT_ALERT);
  return true;
}
