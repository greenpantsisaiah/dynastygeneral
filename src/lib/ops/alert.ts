/**
 * Operational alerts for critical runtime conditions a solo founder
 * needs to know about immediately, not by scanning Vercel logs.
 *
 * Two sinks:
 *   1. console.error (always) so Vercel function logs always capture it.
 *   2. Email via Resend, when RESEND_API_KEY + a recipient are set.
 *
 * Email is deduped IN PROCESS per alert kind. We cannot dedupe via
 * Redis because the loudest alert (enforcement_unconfigured) fires
 * precisely when Upstash is unavailable. In-process dedupe means each
 * warm serverless instance sends at most one email per kind per window,
 * which is the right floor: a cold fleet booting without Upstash sends
 * a handful, not thousands.
 *
 * Recipients: OPS_ALERT_TO (comma-separated), else the first entry of
 * ADMIN_EMAILS. From: EMAIL_FROM, else alerts@dynastygeneral.app.
 */

export type OpsAlertArgs = {
  // Stable key. Used as the dedupe bucket and the subject tag.
  kind: string;
  // One-line headline. Leads with the condition.
  summary: string;
  // Optional longer body.
  detail?: string;
  // Optional structured context rendered into the body.
  values?: Record<string, string | number | boolean | null>;
};

const DEFAULT_DEDUPE_MS = 60 * 60 * 1000; // 1 hour per kind per instance

function dedupeWindowMs(): number {
  const raw = process.env.OPS_ALERT_DEDUPE_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DEDUPE_MS;
}

const lastEmailAt = new Map<string, number>();

function recipients(): string[] {
  const explicit = (process.env.OPS_ALERT_TO ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (explicit.length > 0) return explicit;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return admins.length > 0 ? [admins[0]!] : [];
}

/**
 * Fire an operational alert. Fire-and-forget: never throws, never
 * blocks the caller. Always logs; emails when configured and not
 * within the per-kind dedupe window.
 */
export function alertOps(args: OpsAlertArgs): void {
  const valuesStr = args.values ? " " + JSON.stringify(args.values) : "";
  console.error(`[ops-alert] ${args.kind}: ${args.summary}${valuesStr}`);
  void sendEmail(args).catch((err) => {
    console.error(
      `[ops-alert] email dispatch failed for ${args.kind}:`,
      err instanceof Error ? err.message : String(err),
    );
  });
}

async function sendEmail(args: OpsAlertArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const to = recipients();
  if (to.length === 0) return;

  const now = Date.now();
  const last = lastEmailAt.get(args.kind) ?? 0;
  if (now - last < dedupeWindowMs()) return;
  // Claim the window before the await so concurrent calls do not race
  // into duplicate sends.
  lastEmailAt.set(args.kind, now);

  const from = process.env.EMAIL_FROM ?? "alerts@dynastygeneral.app";
  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
  const subject = `Dynasty General ops · ${args.kind} · ${env}`;

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    text: renderText(args, env, now),
  });
  if (error) {
    // Roll back the dedupe stamp so a transient send failure can retry
    // on the next occurrence rather than swallowing the alert.
    lastEmailAt.set(args.kind, last);
    console.error(
      `[ops-alert] resend returned error for ${args.kind}:`,
      error.message ?? "unknown",
    );
  }
}

function renderText(args: OpsAlertArgs, env: string, nowMs: number): string {
  const lines = [
    "Dynasty General operational alert",
    "",
    `Kind:    ${args.kind}`,
    `Env:     ${env}`,
    `When:    ${new Date(nowMs).toISOString()}`,
    "",
    args.summary,
  ];
  if (args.detail) lines.push("", args.detail);
  if (args.values) {
    lines.push("", "Context:");
    for (const [k, v] of Object.entries(args.values)) {
      lines.push(`  ${k}: ${v ?? "null"}`);
    }
  }
  return lines.join("\n");
}
