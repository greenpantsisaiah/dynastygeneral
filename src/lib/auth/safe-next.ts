/**
 * Same-origin guard for `next` redirect params used in the magic-link
 * flow. Prevents open-redirect phishing where an attacker shares
 * `https://dynastygeneral.app/login?next=https://evil.example` and
 * the user lands on evil.example after a real magic-link sign-in.
 *
 * Rule: accept ONLY paths starting with "/" and not "//" (which would
 * be protocol-relative and resolve to a different origin). Everything
 * else falls back to the supplied default (typically "/account").
 *
 * Per security-auditor 2026-04-23: this exact vector was the only
 * HIGH finding in the auth flow.
 */

const PATH_RE = /^\/(?!\/)/;

export function safeNextPath(
  raw: string | null | undefined,
  fallback = "/account",
): string {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  if (raw.length > 256) return fallback; // bound the size too
  if (!PATH_RE.test(raw)) return fallback;
  return raw;
}
