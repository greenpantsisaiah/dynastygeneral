/**
 * POST /api/league/[leagueId]/refresh
 *
 * Forces a fresh re-render of the league hub by busting the Next.js
 * data-fetch cache for that route. The hub itself is `force-dynamic`,
 * but its inner Sleeper fetches use `revalidate: 60-300s`. During the
 * NFL Draft window or right after a league pick lands, those windows
 * are too long: the user wants to see the new state NOW, not in 60s.
 *
 * The user reloads the page after a successful POST. We don't return
 * the new HTML; the client just calls router.refresh() once we ack.
 *
 * Light rate limit so a stuck client doesn't spam revalidations.
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isValidLeagueId } from "@/lib/sleeper/validate";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const rate = await checkRateLimit("feedback", clientIpFrom(req));
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429 },
    );
  }

  const { leagueId } = await params;
  if (!isValidLeagueId(leagueId)) {
    return NextResponse.json(
      { ok: false, error: "invalid_league_id" },
      { status: 400 },
    );
  }

  // Revalidates every page under /leagues/[leagueId]. Next.js uses the
  // path as the cache key; the inner Sleeper fetches with `revalidate:
  // N` are tied to this path's cache and get re-fetched on next render.
  revalidatePath(`/leagues/${leagueId}`, "layout");

  return NextResponse.json({
    ok: true,
    refreshed_at: new Date().toISOString(),
  });
}
