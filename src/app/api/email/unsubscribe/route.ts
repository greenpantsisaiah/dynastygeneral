/**
 * Unsubscribe from the weekly brief.
 *
 * GET shows a confirm page with a button (link scanners prefetch GETs,
 * so a GET never unsubscribes on its own). POST records the opt-out:
 * from that button, or from a mail client's RFC 8058 one-click
 * (List-Unsubscribe-Post). The link is HMAC-signed per user, so it needs
 * no login and cannot unsubscribe someone else.
 *
 * Storage: a notifications row (league_id "*", kind "<list>_optout"),
 * which the weekly brief cron checks before every send. No migration.
 */

import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { OPT_OUT, WEEKLY_BRIEF_LIST, verifyUnsubscribeToken } from "@/lib/email/unsubscribe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LISTS = new Set([WEEKLY_BRIEF_LIST]);

function page(body: string, status = 200): Response {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;background:#0a0a0a;color:#e5e5e5">${body}</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function params(url: URL) {
  const u = url.searchParams.get("u") ?? "";
  const l = url.searchParams.get("l") ?? WEEKLY_BRIEF_LIST;
  const t = url.searchParams.get("t") ?? "";
  return { u, l, t, valid: LISTS.has(l) && /^[0-9a-f-]{36}$/i.test(u) && verifyUnsubscribeToken(u, t, l) };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const p = params(url);
  if (!p.valid) return page("<p>This unsubscribe link is not valid. Reply to any brief and we will remove you by hand.</p>", 400);
  const action = `/api/email/unsubscribe?${url.searchParams.toString()}`;
  return page(
    `<h1 style="font-size:20px">Stop the weekly brief?</h1><p style="color:#bbb">You will stop getting the Tuesday contend-or-sell email. Your account and leagues are not affected.</p><form method="post" action="${action.replace(/"/g, "&quot;")}"><button type="submit" style="padding:10px 16px;background:#f5a524;border:0;font-weight:600;cursor:pointer">Unsubscribe</button></form>`,
  );
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const p = params(url);
  if (!p.valid) return NextResponse.json({ ok: false, error: "invalid_link" }, { status: 400 });
  try {
    const admin = getAdminClient();
    const { error } = await admin.from("notifications").upsert(
      {
        user_id: p.u,
        league_id: OPT_OUT.league_id,
        kind: OPT_OUT.kind(p.l),
        status: "sent",
        error_message: null,
        sent_at: new Date().toISOString(),
      },
      { onConflict: "user_id,league_id,kind" },
    );
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("[email:unsubscribe]", err instanceof Error ? `${err.message}\n${err.stack}` : err);
    return page("<p>Unsubscribe failed on our side. Reply to any brief and we will remove you by hand.</p>", 500);
  }
  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("text/html")) return NextResponse.json({ ok: true });
  return page("<h1 style=\"font-size:20px\">Unsubscribed.</h1><p style=\"color:#bbb\">No more weekly briefs. Reply to any past brief if you want it back.</p>");
}
