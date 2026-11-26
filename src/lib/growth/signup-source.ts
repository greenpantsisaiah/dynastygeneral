/**
 * Signup source attribution: which channel a homepage signup came from.
 *
 * The homepage form reads the landing URL's utm_* params (and the
 * referrer host) and posts them alongside the email + Sleeper username.
 * `/api/brief-signup` stores the parsed result on the new account's
 * `user_metadata.signup_utm`, so growth can count signups per channel
 * (traffic plan 2026-11-26: league chats, Reddit, podcasters, paid tests).
 *
 * The input is untrusted and optional. Parsing salvages per field (one
 * bad value drops that field, never the signup) and returns null when
 * nothing usable remains, so attribution can never block an account.
 */

export const SIGNUP_SOURCE_FIELDS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "ref",
  "referrer_host",
] as const;

export type SignupSourceField = (typeof SIGNUP_SOURCE_FIELDS)[number];
export type SignupSource = Partial<Record<SignupSourceField, string>>;

const MAX_LEN = 64;
const SAFE = /^[a-zA-Z0-9_.\-]+$/;

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase().slice(0, MAX_LEN);
  return v.length > 0 && SAFE.test(v) ? v : null;
}

/** Parse an untrusted attribution object. Null when no field survives. */
export function parseSignupSource(input: unknown): SignupSource | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const out: SignupSource = {};
  for (const field of SIGNUP_SOURCE_FIELDS) {
    const v = clean(raw[field]);
    if (v) out[field] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Build the attribution object from a landing URL's query string and the
 * document referrer. Pure, so the client form and tests share it. A
 * same-site referrer is dropped (it says nothing about the channel).
 */
export function signupSourceFromLanding(args: {
  search: string;
  referrer?: string | null;
  ownHost?: string | null;
}): SignupSource | null {
  const params = new URLSearchParams(args.search);
  const draft: Record<string, unknown> = {};
  for (const field of SIGNUP_SOURCE_FIELDS) {
    if (field === "referrer_host") continue;
    const v = params.get(field);
    if (v) draft[field] = v;
  }
  if (args.referrer) {
    try {
      const host = new URL(args.referrer).hostname.replace(/^www\./, "");
      const own = (args.ownHost ?? "").replace(/^www\./, "");
      if (host && host !== own) draft.referrer_host = host;
    } catch {
      // Unparseable referrer: no attribution from it.
    }
  }
  return parseSignupSource(draft);
}
