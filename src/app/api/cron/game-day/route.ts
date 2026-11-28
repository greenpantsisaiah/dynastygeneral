/**
 * Game Day email cron (BUILD_SPEC PR 3, first slice: the three-analyst
 * lineup panel), Sunday 10 AM CT with an 11 AM CT catch-up run (vercel.json).
 *
 * Gates (all must hold or the route sends nothing):
 * - RESEND_API_KEY, the mailing address, EMAIL_REPLY_TO and an unsubscribe
 *   signing secret are configured (same preflight as the weekly brief),
 * - the send guard (src/lib/email/send-guard.ts): users get the email only
 *   when EMAIL_GAME_DAY_APPROVED_VERSION equals the deployed
 *   GAME_DAY_TEMPLATE_VERSION. Otherwise every run sends a "[Preview]" copy
 *   to the admin list only (EMAIL_PREVIEW_TO, else EMAIL_REPLY_TO),
 * - flag weekly_brief_email on for the user (the email kill switch), not
 *   opted out of the brief list, not already sent this week's game-day
 *   email for this template version,
 * - the content lint is clean (a preview still goes out with the failures
 *   listed on top).
 *
 * `?mode=preview` forces a preview run; `&force=1` resends a preview.
 * `?dry=1` renders and counts without sending or writing. Games already
 * kicked off are treated as locked. Runs on demand from Vercel's Run button.
 */

import { withCronIncidents } from "@/lib/ops/incidents";
import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getNflState } from "@/lib/sleeper";
import { briefOwnerName } from "@/lib/email/build-brief";
import { resolveMailingAddress } from "@/lib/email/mailing-address";
import { briefFrom } from "@/lib/email/sender";
import { briefSendKind, honorForce, resolveSendMode } from "@/lib/email/send-guard";
import { OPT_OUT, WEEKLY_BRIEF_LIST, unsubscribeUrl } from "@/lib/email/unsubscribe";
import { flagOn } from "@/lib/flags/server";
import { loadLineupPanel } from "@/lib/email/game-day/load";
import { composeGameDayEmail, GAME_DAY_TEMPLATE_VERSION } from "@/lib/email/game-day/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Stop starting new users after this many ms; the catch-up run continues. */
const TIME_BUDGET_MS = 240_000;
/** Emails built and sent at once (Sleeper-bound; stays under Resend's 2 req/s). */
const SEND_CONCURRENCY = 3;

function isProd(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

async function handleCron(request: Request): Promise<Response> {
  const started = Date.now();
  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";
  const cronSecret = process.env.CRON_SECRET;
  if (isProd() && !cronSecret) {
    console.error("[cron:game-day:exit] CRON_SECRET missing in production; refusing to run.");
    return NextResponse.json({ ok: false, error: "cron_secret_unconfigured" }, { status: 503 });
  }
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const mailingAddress = resolveMailingAddress()?.value;
  const replyTo = process.env.EMAIL_REPLY_TO?.trim();
  if (!dry && (!apiKey || !mailingAddress || !replyTo)) {
    const missing = { RESEND_API_KEY: !apiKey, EMAIL_MAILING_ADDRESS: !mailingAddress, EMAIL_REPLY_TO: !replyTo };
    console.warn("[cron:game-day:exit] email_unconfigured", missing);
    return NextResponse.json({ ok: false, error: "email_unconfigured", missing }, { status: 503 });
  }
  if (!dry && !unsubscribeUrl("https://x", "preflight")) {
    console.warn("[cron:game-day:exit] unsubscribe_secret_unconfigured");
    return NextResponse.json({ ok: false, error: "unsubscribe_secret_unconfigured" }, { status: 503 });
  }
  const guard = resolveSendMode({
    templateVersion: GAME_DAY_TEMPLATE_VERSION,
    approvedVersion: process.env.EMAIL_GAME_DAY_APPROVED_VERSION,
    previewTo: process.env.EMAIL_PREVIEW_TO,
    replyTo,
    requestedMode: url.searchParams.get("mode"),
  });
  console.log("[cron:game-day:guard]", JSON.stringify({ ...guard, template: GAME_DAY_TEMPLATE_VERSION }));
  if (guard.mode === "refuse") {
    return NextResponse.json({ ok: false, error: "send_guard_refused", reason: guard.reason }, { status: 503 });
  }
  const preview = guard.mode === "preview" ? new Set(guard.to) : null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dynastygeneral.app";

  const nfl = await getNflState();
  if (!nfl || nfl.season_type !== "regular" || !nfl.week) {
    return NextResponse.json({ ok: true, note: "not_regular_season" });
  }
  const sendMode = preview ? "preview" : "broadcast";
  const sendKind = briefSendKind(`game_day_${nfl.season}_w${nfl.week}`, GAME_DAY_TEMPLATE_VERSION, sendMode);
  const forceResend = honorForce(force, sendMode);

  const admin = getAdminClient();
  const { data: profiles, error } = await admin.from("profiles").select("id, sleeper_username, display_name").not("sleeper_username", "is", null);
  if (error) {
    console.error("[cron:game-day:profiles]", error.message);
    return NextResponse.json({ ok: false, error: "profiles_query_failed" }, { status: 500 });
  }
  const ids = (profiles ?? []).map((p) => p.id as string);
  const { data: marks } = ids.length
    ? await admin
        .from("notifications")
        .select("user_id, kind, status")
        .in("user_id", ids)
        .eq("league_id", OPT_OUT.league_id)
        .in("kind", [OPT_OUT.kind(WEEKLY_BRIEF_LIST), sendKind])
    : { data: [] as Array<{ user_id: string; kind: string; status: string }> };
  const optedOut = new Set((marks ?? []).filter((m) => m.kind !== sendKind).map((m) => m.user_id as string));
  const done = new Set(
    (marks ?? []).filter((m) => m.kind === sendKind && m.status === "sent" && !forceResend).map((m) => m.user_id as string),
  );

  const result = { ok: true, dry, mode: guard.mode, template: GAME_DAY_TEMPLATE_VERSION, week: nfl.week, kind: sendKind, eligible: 0, sent: 0, failed: 0, skipped: 0, deferred: 0, flag_off: 0, not_admin: 0, no_read: 0, lint_blocked: 0 };
  const { Resend } = dry ? { Resend: null } : await import("resend");
  const resend = Resend && apiKey ? new Resend(apiKey) : null;
  const now = new Date();

  const handleProfile = async (profile: NonNullable<typeof profiles>[number]): Promise<void> => {
    const userId = profile.id as string;
    if (!preview && !flagOn("weekly_brief_email", userId)) {
      result.flag_off++;
      return;
    }
    if (optedOut.has(userId) || done.has(userId)) {
      result.skipped++;
      return;
    }
    if (Date.now() - started > TIME_BUDGET_MS) {
      result.deferred++;
      return;
    }
    let email: string | null = null;
    try {
      const { data } = await admin.auth.admin.getUserById(userId);
      email = data?.user?.email?.toLowerCase() ?? null;
    } catch (err) {
      console.error("[cron:game-day:auth]", userId, err instanceof Error ? err.message : err);
    }
    if (!email) {
      result.skipped++;
      return;
    }
    if (preview && !preview.has(email)) {
      result.not_admin++;
      return;
    }
    const unsub = unsubscribeUrl(appUrl, userId, WEEKLY_BRIEF_LIST);
    if (!unsub) {
      result.skipped++;
      return;
    }
    const username = profile.sleeper_username as string;
    const res = await loadLineupPanel({ username, season: nfl.season, week: nfl.week, now, logTag: "cron:game-day" });
    if ("error" in res) {
      result.no_read++;
      console.warn("[cron:game-day:read]", userId, res.error);
      return;
    }
    result.eligible++;
    const out = composeGameDayEmail({
      ownerName: briefOwnerName(profile.display_name as string | null, username),
      panel: res.panel,
      userNames: res.userNames,
      unsubscribeUrl: unsub,
      mailingAddress: mailingAddress ?? "",
      sendDate: now,
      preview: !!preview,
    });
    if (out.lint.length) {
      console.error("[cron:game-day:lint]", userId, JSON.stringify(out.lint));
      if (!preview) {
        result.lint_blocked++;
        return;
      }
    }
    if (dry || !resend) return;
    const { error: sendErr } = await resend.emails.send({
      from: briefFrom(),
      to: email,
      replyTo,
      subject: preview ? `[Preview] ${out.subject}` : out.subject,
      html: out.html,
      text: out.text,
      headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    await admin.from("notifications").upsert(
      {
        user_id: userId,
        league_id: OPT_OUT.league_id,
        kind: sendKind,
        status: sendErr ? "failed" : "sent",
        error_message: sendErr?.message ?? null,
        sent_at: new Date().toISOString(),
      },
      { onConflict: "user_id,league_id,kind" },
    );
    if (sendErr) {
      result.failed++;
      console.error("[cron:game-day:send]", userId, sendErr.name ?? "", sendErr.message);
    } else result.sent++;
  };
  const queue = [...(profiles ?? [])];
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      try {
        await handleProfile(p);
      } catch (err) {
        result.failed++;
        console.error("[cron:game-day:user]", p.id, err instanceof Error ? `${err.message}\n${err.stack}` : err);
      }
    }
  };
  await Promise.all(Array.from({ length: SEND_CONCURRENCY }, worker));
  console.log("[cron:game-day:result]", JSON.stringify({ ...result, profiles: (profiles ?? []).length }));
  return NextResponse.json(result);
}

// A throw or 5xx records a cron incident; a clean run stamps the heartbeat
// the hourly incident watch checks (docs/team/INCIDENTS.md).
export const GET = withCronIncidents("game-day", handleCron);
