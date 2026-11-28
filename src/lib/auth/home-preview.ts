/**
 * View-only /home preview for a homepage signup (no account session).
 *
 * The signup form verifies a Sleeper username, then sets this cookie so the
 * "Open my home" button shows that username's leagues right away. It is a
 * read of PUBLIC Sleeper data only: anyone can already look up any Sleeper
 * username's leagues. The cookie grants no Supabase session, no account
 * data (profile, Coach history, billing, export) and no writes. It is set the
 * same way for new and existing addresses, so it reveals nothing about
 * which emails have accounts.
 *
 * Format: `${base64url(username)}.${expiresAtMs}.${hmac}`. The HMAC only
 * stops a hand-edited cookie from becoming an open proxy for arbitrary
 * usernames on our compute; the data behind it is public either way.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const HOME_PREVIEW_COOKIE = "dg_home_preview";
/** How long the preview lasts before the visitor is asked to sign in. */
export const HOME_PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;

function secret(): string | null {
  return process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(`home_preview:${payload}`).digest("base64url");
}

export function homePreviewToken(username: string, now: number, key = secret()): string | null {
  if (!key || !username) return null;
  const payload = `${Buffer.from(username, "utf8").toString("base64url")}.${now + HOME_PREVIEW_TTL_MS}`;
  return `${payload}.${sign(payload, key)}`;
}

/** The previewed Sleeper username, or null when missing, forged or expired. */
export function readHomePreview(token: string | undefined | null, now: number, key = secret()): string | null {
  if (!key || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [u, exp, mac] = parts;
  const expected = Buffer.from(sign(`${u}.${exp}`, key));
  const got = Buffer.from(mac);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  const username = Buffer.from(u, "base64url").toString("utf8");
  return /^[A-Za-z0-9_.-]{1,64}$/.test(username) ? username : null;
}
