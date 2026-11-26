/**
 * GET /api/admin/email-preview: render the exact weekly brief a user would
 * get, from the live data path, WITHOUT sending or writing anything.
 *
 *   ?user=<auth user id>      the brief for that account (its tier, name, leagues)
 *   ?username=<sleeper name>  any Sleeper username (pairs with ?tier=free|pro)
 *   ?format=html|text|json    default html (opens in the browser as the email)
 *
 * Admin-only: ADMIN_EMAILS session (Isaiah in a browser) or the
 * CRON_SECRET bearer (ops scripts). Exists because the first weekly brief
 * reached users before anyone saw it rendered with real league data
 * (docs/team/postmortems/2026-11-25-weekly-brief.md).
 */

import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth/admin";
import { getAdminClient } from "@/lib/supabase/admin";
import { effectiveTier } from "@/lib/auth/session";
import { getNflState } from "@/lib/sleeper";
import { briefOwnerName, buildBriefLeagues } from "@/lib/email/build-brief";
import { WEEKLY_BRIEF_TEMPLATE_VERSION, composeWeeklyBrief, type BriefTier } from "@/lib/email/weekly-brief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function authorized(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  return (await getAdminUser()) != null;
}

export async function GET(request: Request): Promise<Response> {
  if (!(await authorized(request))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const userId = url.searchParams.get("user");
  const format = url.searchParams.get("format") ?? "html";

  let username = url.searchParams.get("username");
  let displayName: string | null = null;
  let tier: BriefTier = url.searchParams.get("tier") === "pro" ? "pro" : "free";
  if (userId) {
    const admin = getAdminClient();
    const [{ data: profile }, { data: sub }] = await Promise.all([
      admin.from("profiles").select("sleeper_username, display_name").eq("id", userId).maybeSingle(),
      admin.from("subscriptions").select("tier, status").eq("user_id", userId).maybeSingle(),
    ]);
    if (!profile) return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
    username = (profile.sleeper_username as string | null) ?? null;
    displayName = (profile.display_name as string | null) ?? null;
    tier = effectiveTier(sub ?? null);
  }
  if (!userId && !username) {
    return NextResponse.json({ ok: false, error: "pass ?user=<id> or ?username=<sleeper name>" }, { status: 400 });
  }

  const nfl = await getNflState();
  if (!nfl || !nfl.week) return NextResponse.json({ ok: false, error: "nfl_state_unavailable" }, { status: 502 });

  const { leagues, resultsWeek } = username
    ? await buildBriefLeagues({ username, season: nfl.season, nflWeek: nfl.week, seasonType: nfl.season_type, logTag: "admin:email-preview" })
    : { leagues: [], resultsWeek: nfl.week - 1 };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dynastygeneral.app";
  const brief = composeWeeklyBrief({
    ownerName: briefOwnerName(displayName, username),
    tier,
    leagues,
    resultsWeek,
    nflWeek: nfl.week,
    seasonStartDate: nfl.season_start_date,
    season: nfl.season,
    appUrl,
    unsubscribeUrl: `${appUrl}/api/email/unsubscribe?preview=1`,
    mailingAddress: process.env.EMAIL_MAILING_ADDRESS?.trim() || "(mailing address)",
    preview: true,
  });

  if (format === "text") {
    return new Response(brief.text, { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (format === "json") {
    return NextResponse.json({
      ok: true,
      template: WEEKLY_BRIEF_TEMPLATE_VERSION,
      subject: brief.subject,
      tier,
      lint: brief.lint,
      items: brief.items,
      digest: brief.digest,
      leagues: leagues.map((l) => ({ id: l.leagueId, name: l.leagueName, has_verdict: !!l.verdict, note: l.note ?? null })),
    });
  }
  return new Response(brief.html, {
    headers: { "content-type": "text/html; charset=utf-8", "x-template-version": WEEKLY_BRIEF_TEMPLATE_VERSION },
  });
}
