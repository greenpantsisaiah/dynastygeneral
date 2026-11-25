/**
 * Weekly brief cron (Tuesday). For every account: the contend-or-sell
 * verdict for each in-season league, rendered by renderWeeklyBrief* and
 * sent through Resend. Free gets the verdict and who to sell; Pro also
 * gets who to sell TO. Accounts without a Sleeper username get the
 * connect nudge.
 *
 * Gates (all must hold or the route sends nothing):
 * - flag weekly_brief_email on for the user (dark by default; a bulk
 *   send is red tier in the team charter, so the first real send needs
 *   Isaiah's yes),
 * - RESEND_API_KEY, EMAIL_MAILING_ADDRESS (CAN-SPAM postal address) and an
 *   unsubscribe signing secret are configured,
 * - the user has not opted out, and has not been sent this week's brief.
 *
 * `?dry=1` renders and counts without sending or writing (preview use).
 * Runs hourly on Tuesday (vercel.json) with a time budget, so a run that
 * cannot finish leaves the rest to the next hour; idempotent per week.
 */

import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  getLeagueUsers,
  getLeaguesForUser,
  getNflState,
  getRosters,
  getUserByUsername,
} from "@/lib/sleeper";
import { resolveDraftState } from "@/lib/sleeper/draft-state";
import { buildLeagueContext } from "@/lib/engine/league-context";
import { loadContendOrSellVerdict } from "@/lib/strategy/verdict/load";
import { flagOn } from "@/lib/flags/server";
import { effectiveTier } from "@/lib/auth/session";
import {
  briefSubject,
  renderWeeklyBriefHtml,
  renderWeeklyBriefText,
  type BriefLeague,
} from "@/lib/email/weekly-brief";
import { OPT_OUT, WEEKLY_BRIEF_LIST, unsubscribeUrl } from "@/lib/email/unsubscribe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Stop starting new users after this many ms; the next hourly run continues. */
const TIME_BUDGET_MS = 240_000;
/** Leagues per brief. Pro covers more leagues (volume gate, not a feature gate). */
const LEAGUE_CAP = { free: 3, pro: 10 } as const;

function isProd(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

export async function GET(request: Request): Promise<Response> {
  const started = Date.now();
  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";

  const cronSecret = process.env.CRON_SECRET;
  if (isProd() && !cronSecret) {
    console.error("[cron:weekly-brief:exit] CRON_SECRET missing in production; refusing to run.");
    return NextResponse.json({ ok: false, error: "cron_secret_unconfigured" }, { status: 503 });
  }
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    console.warn("[cron:weekly-brief:exit] unauthorized");
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const mailingAddress = process.env.EMAIL_MAILING_ADDRESS?.trim();
  // The brief asks for replies, so it never sends from a dead inbox.
  const replyTo = process.env.EMAIL_REPLY_TO?.trim();
  if (!dry && (!apiKey || !mailingAddress || !replyTo)) {
    const missing = { RESEND_API_KEY: !apiKey, EMAIL_MAILING_ADDRESS: !mailingAddress, EMAIL_REPLY_TO: !replyTo };
    console.warn("[cron:weekly-brief:exit] email_unconfigured", missing);
    return NextResponse.json(
      { ok: false, error: "email_unconfigured", missing },
      { status: 503 },
    );
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dynastygeneral.app";
  const from = process.env.EMAIL_FROM ?? "brief@dynastygeneral.app";

  const nfl = await getNflState();
  if (!nfl || nfl.season_type !== "regular" || !nfl.week) {
    console.warn("[cron:weekly-brief:exit] not_regular_season", nfl?.season_type, nfl?.week);
    return NextResponse.json({ ok: true, note: "not_regular_season" });
  }
  const weekKind = `${WEEKLY_BRIEF_LIST}_${nfl.season}_w${nfl.week}`;
  const weekLabel = `Week ${nfl.week}`;

  const admin = getAdminClient();
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, sleeper_username, display_name");
  if (error) {
    console.error("[cron:weekly-brief:profiles]", error.message);
    return NextResponse.json({ ok: false, error: "profiles_query_failed" }, { status: 500 });
  }
  const ids = (profiles ?? []).map((p) => p.id as string);
  const [{ data: subs }, { data: marks }] = await Promise.all([
    admin.from("subscriptions").select("user_id, tier, status").in("user_id", ids),
    admin
      .from("notifications")
      .select("user_id, kind, status")
      .in("user_id", ids)
      .eq("league_id", OPT_OUT.league_id)
      .in("kind", [OPT_OUT.kind(WEEKLY_BRIEF_LIST), weekKind]),
  ]);
  const tierBy = new Map((subs ?? []).map((s) => [s.user_id as string, effectiveTier(s)]));
  const optedOut = new Set((marks ?? []).filter((m) => m.kind !== weekKind).map((m) => m.user_id as string));
  const doneThisWeek = new Set((marks ?? []).filter((m) => m.kind === weekKind && m.status === "sent").map((m) => m.user_id as string));

  const result = { ok: true, dry, week: weekKind, eligible: 0, sent: 0, failed: 0, skipped: 0, deferred: 0, flag_off: 0 };
  const { Resend } = dry ? { Resend: null } : await import("resend");
  const resend = Resend && apiKey ? new Resend(apiKey) : null;

  for (const profile of profiles ?? []) {
    const userId = profile.id as string;
    if (!flagOn("weekly_brief_email", userId)) {
      result.flag_off++;
      continue;
    }
    if (optedOut.has(userId) || doneThisWeek.has(userId)) {
      result.skipped++;
      continue;
    }
    if (Date.now() - started > TIME_BUDGET_MS) {
      result.deferred++;
      continue;
    }
    const unsub = unsubscribeUrl(appUrl, userId);
    if (!unsub) {
      console.warn("[cron:weekly-brief:exit] unsubscribe_secret_unconfigured");
      return NextResponse.json({ ok: false, error: "unsubscribe_secret_unconfigured" }, { status: 503 });
    }
    let email: string | null = null;
    try {
      const { data } = await admin.auth.admin.getUserById(userId);
      email = data?.user?.email ?? null;
    } catch (err) {
      console.error("[cron:weekly-brief:auth]", userId, err instanceof Error ? err.message : err);
    }
    if (!email) {
      result.skipped++;
      continue;
    }
    result.eligible++;
    const tier = tierBy.get(userId) ?? "free";
    const username = (profile.sleeper_username as string | null) ?? null;
    const leagues: BriefLeague[] = [];
    if (username) {
      try {
        const su = await getUserByUsername(username);
        const all = su ? await getLeaguesForUser(su.user_id, nfl.season) : [];
        for (const lg of all.slice(0, LEAGUE_CAP[tier])) {
          try {
            const [rosters, users, draftState] = await Promise.all([
              getRosters(lg.league_id),
              getLeagueUsers(lg.league_id),
              resolveDraftState(lg.league_id, su!.user_id),
            ]);
            const ctx = await buildLeagueContext({ league: lg, rosters, users, draftState, mySleeperUserId: su!.user_id });
            const res = await loadContendOrSellVerdict({
              league: lg,
              snapshot: ctx.snapshot,
              nflWeek: nfl.week,
              seasonType: nfl.season_type,
              playerValuesById: ctx.pricedPool.playerValuesById,
            });
            leagues.push({
              leagueId: lg.league_id,
              leagueName: lg.name,
              verdict: res.ok ? res.verdict : null,
              note: res.ok ? undefined : `No verdict this week: ${res.reason}.`,
            });
          } catch (err) {
            console.error("[cron:weekly-brief:league]", lg.league_id, err instanceof Error ? `${err.message}\n${err.stack}` : err);
          }
        }
      } catch (err) {
        console.error("[cron:weekly-brief:sleeper]", userId, err instanceof Error ? err.message : err);
      }
    }
    const args = {
      ownerName: (profile.display_name as string | null) ?? username ?? "",
      tier,
      leagues,
      appUrl,
      unsubscribeUrl: unsub,
      mailingAddress: mailingAddress ?? "",
      weekLabel,
    };
    if (dry || !resend) continue;
    const { error: sendErr } = await resend.emails.send({
      from,
      to: email,
      replyTo,
      subject: briefSubject(args),
      html: renderWeeklyBriefHtml(args),
      text: renderWeeklyBriefText(args),
      headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    await admin.from("notifications").upsert(
      {
        user_id: userId,
        league_id: OPT_OUT.league_id,
        kind: weekKind,
        status: sendErr ? "failed" : "sent",
        error_message: sendErr?.message ?? null,
        sent_at: new Date().toISOString(),
      },
      { onConflict: "user_id,league_id,kind" },
    );
    if (sendErr) {
      result.failed++;
      // Surface the provider's reason (e.g. unverified sender domain) in
      // the Vercel function log, not just the notifications row.
      console.error("[cron:weekly-brief:send]", userId, sendErr.name ?? "", sendErr.message);
    } else result.sent++;
  }
  // One summary line per run so the Vercel log answers "why zero sent"
  // (flag_off = override not live, skipped = opted out / already sent).
  console.log("[cron:weekly-brief:result]", JSON.stringify({ ...result, profiles: (profiles ?? []).length, from }));
  return NextResponse.json(result);
}
