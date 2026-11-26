/**
 * Game Day email cron, PREVIEW ONLY (BUILD_SPEC PR 3, first slice: the
 * three-analyst lineup panel). Every run sends a "[Preview]" copy to the
 * admin list (EMAIL_PREVIEW_TO, else EMAIL_REPLY_TO) and nobody else; there
 * is no broadcast path in this route yet. A broadcast lands only after
 * Isaiah approves a rendered GAME_DAY_TEMPLATE_VERSION, through the same
 * send guard the weekly brief uses.
 *
 * Runs Sunday 10 AM CT (vercel.json) and on demand from Vercel's Run
 * button (Thanksgiving week: Isaiah wanted it Thursday). Games already
 * kicked off are treated as locked. `?dry=1` renders without sending.
 */

import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getNflState } from "@/lib/sleeper";
import { briefOwnerName } from "@/lib/email/build-brief";
import { resolveMailingAddress } from "@/lib/email/mailing-address";
import { briefFrom } from "@/lib/email/sender";
import { parseEmailList } from "@/lib/email/send-guard";
import { WEEKLY_BRIEF_LIST, unsubscribeUrl } from "@/lib/email/unsubscribe";
import { loadLineupPanel } from "@/lib/email/game-day/load";
import { composeGameDayEmail, GAME_DAY_TEMPLATE_VERSION } from "@/lib/email/game-day/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function isProd(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
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
  const previewTo = parseEmailList(process.env.EMAIL_PREVIEW_TO);
  const admins = new Set(previewTo.length ? previewTo : parseEmailList(replyTo));
  if (admins.size === 0) {
    return NextResponse.json({ ok: false, error: "no_preview_address" }, { status: 503 });
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dynastygeneral.app";

  const nfl = await getNflState();
  if (!nfl || nfl.season_type !== "regular" || !nfl.week) {
    return NextResponse.json({ ok: true, note: "not_regular_season" });
  }

  const admin = getAdminClient();
  const { data: profiles, error } = await admin.from("profiles").select("id, sleeper_username, display_name").not("sleeper_username", "is", null);
  if (error) {
    console.error("[cron:game-day:profiles]", error.message);
    return NextResponse.json({ ok: false, error: "profiles_query_failed" }, { status: 500 });
  }
  const result = { ok: true, dry, mode: "preview", template: GAME_DAY_TEMPLATE_VERSION, week: nfl.week, sent: 0, failed: 0, not_admin: 0, no_read: 0 };
  const { Resend } = dry ? { Resend: null } : await import("resend");
  const resend = Resend && apiKey ? new Resend(apiKey) : null;
  const now = new Date();

  for (const profile of profiles ?? []) {
    const userId = profile.id as string;
    let email: string | null = null;
    try {
      const { data } = await admin.auth.admin.getUserById(userId);
      email = data?.user?.email?.toLowerCase() ?? null;
    } catch (err) {
      console.error("[cron:game-day:auth]", userId, err instanceof Error ? err.message : err);
    }
    if (!email || !admins.has(email)) {
      result.not_admin++;
      continue;
    }
    const username = profile.sleeper_username as string;
    const res = await loadLineupPanel({ username, season: nfl.season, week: nfl.week, now, logTag: "cron:game-day" });
    if ("error" in res) {
      result.no_read++;
      console.warn("[cron:game-day:read]", userId, res.error);
      continue;
    }
    const unsub = unsubscribeUrl(appUrl, userId, WEEKLY_BRIEF_LIST) ?? `${appUrl}/settings`;
    const out = composeGameDayEmail({
      ownerName: briefOwnerName(profile.display_name as string | null, username),
      panel: res.panel,
      userNames: res.userNames,
      unsubscribeUrl: unsub,
      mailingAddress: mailingAddress ?? "",
      sendDate: now,
      preview: true,
    });
    if (out.lint.length) console.warn("[cron:game-day:lint]", userId, JSON.stringify(out.lint));
    if (dry || !resend) continue;
    const { error: sendErr } = await resend.emails.send({
      from: briefFrom(),
      to: email,
      replyTo,
      subject: `[Preview] ${out.subject}`,
      html: out.html,
      text: out.text,
      headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    if (sendErr) {
      result.failed++;
      console.error("[cron:game-day:send]", userId, sendErr.name ?? "", sendErr.message);
    } else result.sent++;
  }
  console.log("[cron:game-day:result]", JSON.stringify(result));
  return NextResponse.json(result);
}
