/**
 * New-feedback email notification. Fires fire-and-forget from
 * /api/feedback after a successful insert so the founder knows when
 * users have submitted in-app feedback without having to remember to
 * check the admin page.
 *
 * Env required:
 *   RESEND_API_KEY  - Resend API key
 *   EMAIL_FROM      - From address (verified sending domain)
 *   FEEDBACK_NOTIFY_TO - Comma-separated recipients (defaults to
 *                       first entry of ADMIN_EMAILS, then a founder
 *                       fallback, when not set)
 *
 * When env is missing the helper returns `{ ok: false, reason }` and
 * the caller logs it without failing the request.
 */

export type FeedbackNotifyArgs = {
  rating: number | null;
  message: string;
  pageUrl: string | null;
  contactEmail: string | null;
  submitterEmail: string | null;
  submitterUserId: string | null;
  feedbackId: string;
  createdAtIso: string;
  appUrl: string;
};

export type FeedbackNotifyResult =
  | { ok: true }
  | { ok: false; reason: string };

const FALLBACK_FEEDBACK_RECIPIENT = "isaiah@greenpantsstudio.com";

function resolveRecipients(): string[] {
  const explicit = (process.env.FEEDBACK_NOTIFY_TO ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (explicit.length > 0) return explicit;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (admins.length > 0) return [admins[0]!];
  return [FALLBACK_FEEDBACK_RECIPIENT];
}

export async function sendFeedbackNotification(
  args: FeedbackNotifyArgs,
): Promise<FeedbackNotifyResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "RESEND_API_KEY not configured" };
  }
  const recipients = resolveRecipients();
  if (recipients.length === 0) {
    return {
      ok: false,
      reason:
        "no recipients (set FEEDBACK_NOTIFY_TO or ADMIN_EMAILS)",
    };
  }
  const from = process.env.EMAIL_FROM ?? "alerts@dynastygeneral.app";
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const ratingTag =
      args.rating != null ? `★${args.rating}` : "no-rating";
    const submitterTag = args.submitterEmail
      ? args.submitterEmail
      : args.submitterUserId
        ? "signed-in (no email shared)"
        : "anonymous";
    const subject = `Feedback · ${ratingTag} · ${submitterTag}`;
    const { error } = await resend.emails.send({
      from,
      to: recipients,
      subject,
      html: renderHtml(args, submitterTag),
      text: renderText(args, submitterTag),
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

function renderText(
  args: FeedbackNotifyArgs,
  submitterTag: string,
): string {
  return [
    `Dynasty General · new feedback`,
    ``,
    `Rating: ${args.rating != null ? `${args.rating}/5` : "no rating"}`,
    `Submitter: ${submitterTag}`,
    args.contactEmail ? `Contact: ${args.contactEmail}` : null,
    args.pageUrl ? `Page: ${args.pageUrl}` : null,
    `Received: ${args.createdAtIso}`,
    ``,
    `Message:`,
    args.message,
    ``,
    `Review queue: ${args.appUrl}/admin/feedback`,
  ]
    .filter(Boolean)
    .join("\n");
}

function renderHtml(
  args: FeedbackNotifyArgs,
  submitterTag: string,
): string {
  const queueUrl = `${args.appUrl}/admin/feedback`;
  const ratingLine =
    args.rating != null ? `${args.rating} / 5` : "no rating";
  const escapedMessage = escapeHtml(args.message).replace(/\n/g, "<br />");
  const contactLine = args.contactEmail
    ? `<div><strong>Contact:</strong> ${escapeHtml(args.contactEmail)}</div>`
    : "";
  const pageLine = args.pageUrl
    ? `<div><strong>Page:</strong> <a href="${escapeAttr(args.pageUrl)}" style="color:#f5a524">${escapeHtml(args.pageUrl)}</a></div>`
    : "";
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0a0a0a;color:#e5e5e5;">
  <div style="border-left:3px solid #f5a524;padding-left:12px;margin-bottom:24px;">
    <div style="font-family:monospace;text-transform:uppercase;letter-spacing:0.18em;font-size:10px;color:#f5a524;">New feedback</div>
    <div style="font-size:12px;color:#888;margin-top:4px;">${escapeHtml(args.createdAtIso)}</div>
  </div>
  <div style="margin-bottom:16px;font-size:13px;color:#ccc;line-height:1.7;">
    <div><strong>Rating:</strong> ${ratingLine}</div>
    <div><strong>Submitter:</strong> ${escapeHtml(submitterTag)}</div>
    ${contactLine}
    ${pageLine}
  </div>
  <div style="background:#111;border:1px solid #222;border-radius:6px;padding:16px;font-size:14px;line-height:1.6;color:#e5e5e5;">
    ${escapedMessage}
  </div>
  <p style="margin:24px 0;">
    <a href="${escapeAttr(queueUrl)}" style="display:inline-block;padding:10px 18px;background:#f5a524;color:#0a0a0a;text-decoration:none;font-family:monospace;text-transform:uppercase;letter-spacing:0.14em;font-size:12px;font-weight:600;">Open review queue</a>
  </p>
</body></html>
  `.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
