/**
 * Paywall response helpers for API routes that gate on tier. Returns a
 * 402 (Payment Required) with a structured body the client can use to
 * surface an upgrade modal.
 *
 * Usage:
 *   const guard = await checkProGate();
 *   if (!guard.ok) return guard.response;
 *   // ... continue ...
 */

import { NextResponse } from "next/server";
import { getOptionalUser, type AuthUser } from "./session";

export type ProGateResult =
  | { ok: true; user: AuthUser }
  | { ok: false; response: NextResponse };

/**
 * Returns ok+user if the caller is on Pro (including trial). Returns a
 * 401 / 402 response otherwise. Falls open in dev when Supabase is
 * unconfigured (returns ok with a synthetic anonymous Pro user) so
 * local development doesn't require auth setup.
 */
export async function checkProGate(): Promise<ProGateResult> {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (!supabaseConfigured) {
    return {
      ok: true,
      user: {
        id: "anonymous-dev",
        email: null,
        tier: "pro",
        is_trialing: false,
        trial_end: null,
        current_period_end: null,
        cancel_at_period_end: false,
      },
    };
  }

  const user = await getOptionalUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "unauthorized",
          message: "Sign in to use this feature.",
          action: "sign_in",
          login_url: "/login",
        },
        { status: 401 },
      ),
    };
  }
  if (user.tier !== "pro") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "pro_required",
          message:
            "This is a Pro feature. Start your 14-day free trial (no card required).",
          action: "upgrade",
          pricing_url: "/pricing",
        },
        { status: 402 },
      ),
    };
  }
  return { ok: true, user };
}
