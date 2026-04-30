/**
 * AAR completion email scaffold. NOT WIRED YET.
 *
 * When ready to ship email alerts:
 *
 * 1. Provision a transactional email provider. Resend is the cheapest
 *    fit for low volume (free tier covers up to 3,000 emails/month).
 *    Other options: Postmark, SendGrid, AWS SES.
 *
 * 2. Add to .env / Vercel env:
 *      RESEND_API_KEY=re_xxx
 *      EMAIL_FROM=alerts@dynastygeneral.app  (verified domain)
 *
 * 3. Verify sending domain (DNS records: SPF, DKIM, DMARC).
 *
 * 4. Wire the trigger:
 *
 *    Option A (recommended): cron job checks active drafts every 15
 *    minutes. When draft.status flips to "complete" AND we haven't
 *    sent the email yet (check notifications table), send it.
 *
 *    Option B (cheaper): on hub render, if draft just completed and
 *    notification not sent, send it. Risk: only fires when user
 *    visits, defeating the "alert me" promise.
 *
 *    Option A is the right path. Cost: ~$0/month at our scale (Vercel
 *    cron runs are free up to 2 per day on Hobby; we'd need Pro for
 *    15-min cadence, ~$20/month if not already on Pro).
 *
 * 5. Notifications schema:
 *
 *      CREATE TABLE notifications (
 *        id          uuid primary key default gen_random_uuid(),
 *        user_id     uuid references auth.users(id),
 *        league_id   text,
 *        kind        text, -- 'aar_ready' | 'camp_alert' | etc.
 *        sent_at     timestamptz default now(),
 *        unique (user_id, league_id, kind)
 *      );
 *
 * 6. The function below is the email-send shape we'd call. Currently
 *    a no-op so it can be imported and called without errors when
 *    the trigger lands.
 */

export type AarNotifyArgs = {
  to: string;
  ownerName: string;
  leagueName: string;
  leagueId: string;
  appUrl: string; // base URL, e.g. https://dynastygeneral.app
};

export async function sendAarReadyEmail(
  args: AarNotifyArgs,
): Promise<{ ok: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "RESEND_API_KEY not configured" };
  }
  const from = process.env.EMAIL_FROM ?? "alerts@dynastygeneral.app";
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: args.to,
      subject: `Your After-Action Report is ready: ${args.leagueName}`,
      html: renderAarEmailHtml(args),
      text: renderAarEmailText(args),
    });
    if (error) {
      return { ok: false, reason: error.message ?? "resend_error" };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export function renderAarEmailText(args: AarNotifyArgs): string {
  return [
    `Your After-Action Report is ready.`,
    ``,
    `League: ${args.leagueName}`,
    `Manager: ${args.ownerName}`,
    ``,
    `Read it here: ${args.appUrl}/leagues/${args.leagueId}/aar`,
    ``,
    `What's inside:`,
    `  - Your relative grade across the league`,
    `  - Your three best picks and three to watch`,
    `  - The pattern of your team (build vs doctrine)`,
    `  - 90-day playbook for the trade window`,
    ``,
    `The dynasty offseason has predictable value-flow patterns.`,
    `The report names them so you can use them.`,
  ].join("\n");
}

export function renderAarEmailHtml(args: AarNotifyArgs): string {
  const url = `${args.appUrl}/leagues/${args.leagueId}/aar`;
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #0a0a0a; color: #e5e5e5;">
  <div style="border-left: 3px solid #f5a524; padding-left: 12px; margin-bottom: 24px;">
    <div style="font-family: monospace; text-transform: uppercase; letter-spacing: 0.18em; font-size: 10px; color: #f5a524;">After-Action Report</div>
    <div style="font-size: 12px; color: #888; margin-top: 4px;">${args.leagueName}</div>
  </div>
  <h1 style="font-size: 22px; margin: 0 0 12px;">Your draft is in the books, ${args.ownerName}.</h1>
  <p style="font-size: 14px; line-height: 1.6; color: #ccc;">
    The full breakdown is ready: relative grade, three best picks, three to watch, the shape of your team, and the 90-day playbook for the trade window between now and week 1.
  </p>
  <p style="margin: 24px 0;">
    <a href="${url}" style="display: inline-block; padding: 12px 20px; background: #f5a524; color: #0a0a0a; text-decoration: none; font-family: monospace; text-transform: uppercase; letter-spacing: 0.14em; font-size: 12px; font-weight: 600;">Read your report</a>
  </p>
  <p style="font-size: 12px; line-height: 1.5; color: #888;">
    Camp alerts, mid-season check-in, and the year-end retrospective are coming this offseason. Each builds on the same shell, refreshed with real production data as the season unfolds.
  </p>
</body>
</html>
  `.trim();
}
