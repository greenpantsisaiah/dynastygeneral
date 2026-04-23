/**
 * Session + tier helpers. Server-only. Used by server components, route
 * handlers, and the tier-gating middleware.
 *
 * Design notes:
 * - All helpers degrade gracefully when Supabase env vars are missing.
 *   Locally / in early dev that means everyone is anonymous and every
 *   tier-gated feature falls open. Production should always have the env
 *   set; the ratelimit module already loud-warns when it's not.
 * - Tier reads are NOT cached across requests. Stripe webhook updates
 *   the row; the next request reads fresh state. Good enough for v1.
 */

import { createClient } from "@/lib/supabase/server";

export type Tier = "free" | "pro";

export type AuthUser = {
  id: string;
  email: string | null;
  // Tier read from public.subscriptions, defaults "free" if no row.
  tier: Tier;
  // Trial status (true while trialing on Pro).
  is_trialing: boolean;
  trial_end: string | null; // ISO
  current_period_end: string | null; // ISO
  cancel_at_period_end: boolean;
};

function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Returns the current user (with tier) or null if signed-out / Supabase
 * unconfigured. Never throws on missing config; the auth UI shows a
 * clear "auth not configured" message in dev.
 */
export async function getOptionalUser(): Promise<AuthUser | null> {
  if (!supabaseConfigured()) return null;
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return null;
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const sub = await supabase
    .from("subscriptions")
    .select(
      "tier, status, trial_end, current_period_end, cancel_at_period_end",
    )
    .eq("user_id", data.user.id)
    .maybeSingle();

  const subRow = sub.data;
  // Effective tier: a "trialing" or "active" Pro row counts as pro,
  // everything else (canceled, past_due, missing row) is free.
  const tier: Tier =
    subRow?.tier === "pro" &&
    (subRow.status === "trialing" || subRow.status === "active")
      ? "pro"
      : "free";

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    tier,
    is_trialing: subRow?.status === "trialing",
    trial_end: subRow?.trial_end ?? null,
    current_period_end: subRow?.current_period_end ?? null,
    cancel_at_period_end: subRow?.cancel_at_period_end ?? false,
  };
}

/**
 * Returns the user or throws a 401-style error. Use in route handlers
 * that require auth; let the framework surface the error to the client.
 */
export async function requireUser(): Promise<AuthUser> {
  const user = await getOptionalUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

/**
 * Tier check. Per-route guard: throw on free user accessing a Pro
 * feature. The route handler should catch and return 402 or a clean
 * "upgrade required" message.
 *
 * Behavior when Supabase is unconfigured: open. Lets dev work without
 * setup. Production logs a loud warning from the ratelimit module
 * when env vars are missing, so this open-fallback isn't silent there.
 */
export async function requireProTier(): Promise<AuthUser> {
  // When Supabase isn't wired, fall open so local dev keeps working.
  // Production requires env vars; absence is loud-logged elsewhere.
  if (!supabaseConfigured()) {
    return {
      id: "anonymous",
      email: null,
      tier: "pro",
      is_trialing: false,
      trial_end: null,
      current_period_end: null,
      cancel_at_period_end: false,
    };
  }
  const user = await getOptionalUser();
  if (!user) throw new Error("Unauthorized");
  if (user.tier !== "pro") throw new Error("Pro tier required");
  return user;
}

/**
 * Soft tier check. Returns the tier (or "anonymous"-equivalent free)
 * without throwing. Use in server components that need to render
 * different UI for free vs pro vs signed-out.
 */
export async function getTier(): Promise<{
  tier: Tier;
  user: AuthUser | null;
}> {
  const user = await getOptionalUser();
  if (!user) return { tier: "free", user: null };
  return { tier: user.tier, user };
}
