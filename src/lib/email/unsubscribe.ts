/**
 * Signed one-click unsubscribe links for marketing-style email (the
 * weekly brief). CAN-SPAM requires a working opt-out honored within 10
 * business days; RFC 8058 one-click lets mail clients unsubscribe with a
 * POST. The token is an HMAC of the user id, so a link cannot be forged
 * for another user and needs no database row to verify.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const WEEKLY_BRIEF_LIST = "weekly_brief";
export const LINEUP_ALERTS_LIST = "lineup_alerts";

function secret(): string | null {
  return process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || null;
}

export function unsubscribeToken(userId: string, list = WEEKLY_BRIEF_LIST, key = secret()): string | null {
  if (!key) return null;
  return createHmac("sha256", key).update(`${list}:${userId}`).digest("base64url");
}

export function verifyUnsubscribeToken(
  userId: string,
  token: string,
  list = WEEKLY_BRIEF_LIST,
  key = secret(),
): boolean {
  const expected = unsubscribeToken(userId, list, key);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unsubscribeUrl(appUrl: string, userId: string, list = WEEKLY_BRIEF_LIST): string | null {
  const t = unsubscribeToken(userId, list);
  if (!t) return null;
  const q = new URLSearchParams({ u: userId, l: list, t });
  return `${appUrl.replace(/\/$/, "")}/api/email/unsubscribe?${q.toString()}`;
}

/** notifications row that records an opt-out (no migration needed). */
export const OPT_OUT = { league_id: "*", kind: (list: string) => `${list}_optout` };
