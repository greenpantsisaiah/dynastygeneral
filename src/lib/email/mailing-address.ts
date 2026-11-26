/**
 * The CAN-SPAM postal address for every email footer, read from the
 * environment. Isaiah set it in Vercel when he set up Resend, and the
 * exact variable name was never pinned down, so this reads our name first,
 * then the common alternates, then any *ADDRESS* variable whose value
 * looks like a US postal address (a street number and a 5-digit ZIP), never
 * an email address or a URL. The address itself never lives in code,
 * commits or memory (founder rule).
 */

const KNOWN_KEYS = [
  "EMAIL_MAILING_ADDRESS",
  "MAILING_ADDRESS",
  "POSTAL_ADDRESS",
  "PHYSICAL_ADDRESS",
  "BUSINESS_ADDRESS",
  "COMPANY_ADDRESS",
  "RESEND_MAILING_ADDRESS",
  "EMAIL_POSTAL_ADDRESS",
  "EMAIL_PHYSICAL_ADDRESS",
  "EMAIL_ADDRESS_POSTAL",
  "CAN_SPAM_ADDRESS",
  "MAILING_ADDRESS_LINE",
];

export function looksLikePostalAddress(v: string): boolean {
  const t = v.trim();
  if (!t || t.includes("@") || /^https?:/i.test(t)) return false;
  return /\b\d+\s+[A-Za-z]/.test(t) && /\b\d{5}(-\d{4})?\b/.test(t);
}

export interface MailingAddress {
  value: string;
  /** The env var it came from (the name only, safe to log). */
  source: string;
}

export function resolveMailingAddress(env: Record<string, string | undefined> = process.env): MailingAddress | null {
  for (const k of KNOWN_KEYS) {
    const v = env[k]?.trim();
    if (v) return { value: v, source: k };
  }
  for (const [k, raw] of Object.entries(env)) {
    if (!/ADDRESS/i.test(k) || !raw) continue;
    if (looksLikePostalAddress(raw)) return { value: raw.trim(), source: k };
  }
  return null;
}
