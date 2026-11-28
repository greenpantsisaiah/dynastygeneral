/**
 * GET /api/admin/welcome-preview: the exact welcome brief a signup would
 * get, from the live data path.
 *
 *   ?username=<sleeper name>   required
 *   ?format=html|text|json     default html (opens in the browser as the email)
 *   ?send=1                    send a "[Preview]" copy to the admin preview
 *                              list (EMAIL_PREVIEW_TO, else EMAIL_REPLY_TO) and
 *                              nobody else
 *
 * Admin-only: ADMIN_EMAILS session or the CRON_SECRET bearer. This is how a
 * new welcome template reaches Isaiah before EMAIL_WELCOME_APPROVED_VERSION
 * lets it reach signups (email broadcast rule, 2026-11-25).
 */

import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth/admin";
import { resolveMailingAddress } from "@/lib/email/mailing-address";
import { parseEmailList } from "@/lib/email/send-guard";
import { briefFrom } from "@/lib/email/sender";
import { WELCOME_BRIEF_TEMPLATE_VERSION } from "@/lib/email/welcome-brief";
import { buildWelcomeBrief } from "@/lib/email/welcome-send";

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
  const username = url.searchParams.get("username")?.trim().replace(/^@/, "");
  if (!username || !/^[A-Za-z0-9_.-]{2,60}$/.test(username)) {
    return NextResponse.json({ ok: false, error: "pass ?username=<sleeper name>" }, { status: 400 });
  }
  const format = url.searchParams.get("format") ?? "html";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dynastygeneral.app";
  const address = resolveMailingAddress();
  const brief = await buildWelcomeBrief({
    username,
    tier: "pro",
    appUrl,
    unsubscribeUrl: `${appUrl}/api/email/unsubscribe?preview=1`,
    mailingAddress: address?.value || "(mailing address)",
    logTag: "admin:welcome-preview",
    preview: true,
  });
  if ("error" in brief) return NextResponse.json({ ok: false, error: brief.error }, { status: 502 });

  if (url.searchParams.get("send") === "1") {
    const apiKey = process.env.RESEND_API_KEY;
    const replyTo = process.env.EMAIL_REPLY_TO?.trim();
    const to = parseEmailList(process.env.EMAIL_PREVIEW_TO);
    const list = to.length > 0 ? to : parseEmailList(replyTo);
    if (!apiKey || list.length === 0) {
      return NextResponse.json({ ok: false, error: "email_unconfigured", missing: { RESEND_API_KEY: !apiKey, preview_list: list.length === 0 } }, { status: 503 });
    }
    const { Resend } = await import("resend");
    const { error } = await new Resend(apiKey).emails.send({
      from: briefFrom(),
      to: list,
      replyTo,
      subject: `[Preview] ${brief.subject}`,
      html: brief.html,
      text: brief.text,
    });
    if (error) {
      console.error("[admin:welcome-preview:send]", error.name ?? "", error.message);
      return NextResponse.json({ ok: false, error: "send_failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sent_to: list.length, template: WELCOME_BRIEF_TEMPLATE_VERSION, subject: brief.subject, lint: brief.lint });
  }

  if (format === "text") {
    return new Response(`Subject: ${brief.subject}\n\n${brief.text}`, { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (format === "json") {
    return NextResponse.json({
      ok: true,
      template: WELCOME_BRIEF_TEMPLATE_VERSION,
      subject: brief.subject,
      lint: brief.lint,
      tiles: brief.tiles,
      first_call: brief.firstCall,
    });
  }
  return new Response(brief.html, {
    headers: { "content-type": "text/html; charset=utf-8", "x-template-version": WELCOME_BRIEF_TEMPLATE_VERSION },
  });
}
