/**
 * POST /api/account/wipe-data
 *
 * Right-to-be-forgotten control: wipes the user's persisted product
 * data across every league:
 *   - chat_history rows (Pro coach-chat mirror)
 *   - pinned_briefings rows (Pro War Room mirror)
 *
 * Does NOT delete:
 *   - profiles row (still needed for auth + connected leagues)
 *   - subscriptions row (Stripe retains its own record; independently
 *     managed via the billing portal)
 *   - leagues table (the user's connected league list; this endpoint
 *     wipes product DATA, not connections)
 *
 * If the user wants their account fully deleted, that's a separate
 * flow (Supabase Auth admin UI for now; no in-app endpoint until we
 * have the volume to need one).
 *
 * Auth required. Only acts on the authed user's own rows. RLS is the
 * defense in depth.
 */

import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Tight rate limit: this is a destructive operation. Three attempts
  // per minute is plenty for a confirmed-via-prompt UI flow and keeps
  // a stolen-session attacker from using this as a denial vector.
  const rate = await checkRateLimit("account-action", clientIpFrom(req));
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429 },
    );
  }

  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "auth_required" },
      { status: 401 },
    );
  }

  const supabase = await createClient();
  const errors: string[] = [];

  const chatRes = await supabase
    .from("chat_history")
    .delete()
    .eq("user_id", user.id);
  if (chatRes.error) errors.push(`chat: ${chatRes.error.message}`);

  const pinRes = await supabase
    .from("pinned_briefings")
    .delete()
    .eq("user_id", user.id);
  if (pinRes.error) errors.push(`pinned: ${pinRes.error.message}`);

  if (errors.length > 0) {
    console.error("[account:wipe]", user.id, errors.join(" / "));
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Try again in a moment." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
