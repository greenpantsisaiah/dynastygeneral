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
import {
  WEEKLY_BRIEF_TEMPLATE_VERSION,
  briefSubject,
  renderWeeklyBriefHtml,
  renderWeeklyBriefText,
  type BriefArgs,
  type BriefTier,
} from "@/lib/email/weekly-brief";

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

  const leagues = username
    ? await buildBriefLeagues({ username, season: nfl.season, nflWeek: nfl.week, seasonType: nfl.season_type, tier, logTag: "admin:email-preview" })
    : [];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dynastygeneral.app";
  const args: BriefArgs = {
    ownerName: briefOwnerName(displayName, username),
    tier,
    leagues,
    appUrl,
    unsubscribeUrl: `${appUrl}/api/email/unsubscribe?preview=1`,
    mailingAddress: process.env.EMAIL_MAILING_ADDRESS?.trim() || "(mailing address)",
    weekLabel: `Week ${nfl.week}`,
  };

  if (format === "text") {
    return new Response(renderWeeklyBriefText(args), { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (format === "json") {
    return NextResponse.json({
      ok: true,
      template: WEEKLY_BRIEF_TEMPLATE_VERSION,
      subject: briefSubject(args),
      tier,
      leagues: leagues.map((l) => ({ id: l.leagueId, name: l.leagueName, has_verdict: !!l.verdict, note: l.note ?? null })),
    });
  }
  return new Response(renderWeeklyBriefHtml(args), {
    headers: { "content-type": "text/html; charset=utf-8", "x-template-version": WEEKLY_BRIEF_TEMPLATE_VERSION },
  });
}
