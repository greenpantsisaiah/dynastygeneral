/**
 * GET /api/account/usage
 *
 * Returns the authed user's current daily usage across tracked
 * features: Coach turns, Briefings batches, Multi-pick rollouts.
 * Plus the configured cap and remaining count for the user's tier.
 *
 * Used by the visible "X of Y today" meter in the Coach panel and
 * on /account. Powers the "transparent budget" UX so users see what
 * they have left, never get walled by surprise.
 *
 * Quietly returns zeros for anonymous users (no caps to display).
 * Does not enforce; that's the endpoints' job. This is read-only.
 */

import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { getUsageSummary } from "@/lib/consumption/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({
      authenticated: false,
      tier: "free",
      features: [],
    });
  }
  const features = await getUsageSummary(user.id, user.tier);
  return NextResponse.json({
    authenticated: true,
    tier: user.tier,
    features,
  });
}
