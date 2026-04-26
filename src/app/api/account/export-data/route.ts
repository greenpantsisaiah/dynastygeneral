/**
 * GET /api/account/export-data
 *
 * Right-to-data-portability control: returns a JSON file containing
 * everything Dynasty General has stored about the authenticated user
 * server-side. Streams as `Content-Disposition: attachment` so the
 * browser saves a file rather than rendering JSON in the address bar.
 *
 * Includes:
 *   - profile (display name, created_at)
 *   - subscription (tier, status, trial dates; NO Stripe internals
 *     beyond IDs that the user already sees in the billing portal)
 *   - leagues (the user's connected league list)
 *   - chat_history (every coach message across every league)
 *   - pinned_briefings (every War Room pin across every league)
 *
 * Excludes:
 *   - other users' data of any kind
 *   - server logs, Stripe webhook events, internal admin metadata
 *   - the user's auth.users row (Supabase manages it; the user can
 *     export from Supabase if they want the full record)
 *
 * Auth required. Service-role read on tables the user owns; RLS would
 * filter to user_id anyway, but we use the service role to keep this
 * endpoint working even if RLS is mis-targeted on a future migration.
 * The user_id filter is the authority.
 */

import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Tight rate limit. Building the export reads several tables; an
  // attacker spamming this on a stolen session would generate
  // disproportionate Supabase load. Five per minute is more than any
  // honest user needs.
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

  const admin = getAdminClient();

  const [profile, subscription, leagues, chats, pins] = await Promise.all([
    admin.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    admin
      .from("subscriptions")
      .select(
        "tier, status, trial_end, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id, stripe_price_id, created_at, updated_at",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("leagues")
      .select("sleeper_league_id, name, season, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    admin
      .from("chat_history")
      .select("league_id, role, content, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    admin
      .from("pinned_briefings")
      .select(
        "league_id, briefing_id, kind, severity, headline, body, data, pinned_at",
      )
      .eq("user_id", user.id)
      .order("pinned_at", { ascending: true }),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
    },
    profile: profile.data ?? null,
    subscription: subscription.data ?? null,
    leagues: leagues.data ?? [],
    chat_history: chats.data ?? [],
    pinned_briefings: pins.data ?? [],
  };

  const body = JSON.stringify(payload, null, 2);
  const filename = `dynasty-copilot-export-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
