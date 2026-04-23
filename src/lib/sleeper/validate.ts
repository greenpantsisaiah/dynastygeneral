/**
 * Input validators for user-supplied identifiers that compose into Sleeper
 * URLs or Redis cache keys. Per SECURITY.md "External-data routes": IDs
 * must match a strict regex BEFORE they touch a fetcher or cache key.
 *
 * `sleeperGet` does `encodeURIComponent` on the path, which neutralizes
 * URL injection. These regexes add a layer of defense for cache-key
 * poisoning, schema-validation crashes from oversized inputs, and to make
 * SSRF impossible if any future fetcher omits encoding.
 */

const LEAGUE_ID_RE = /^[a-zA-Z0-9_-]{1,32}$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{1,60}$/;
const SLEEPER_USER_ID_RE = /^[0-9]{1,32}$/;
const DRAFT_ID_RE = /^[a-zA-Z0-9_-]{1,32}$/;

export function isValidLeagueId(value: unknown): value is string {
  return typeof value === "string" && LEAGUE_ID_RE.test(value);
}

export function isValidUsername(value: unknown): value is string {
  return typeof value === "string" && USERNAME_RE.test(value);
}

export function isValidSleeperUserId(value: unknown): value is string {
  return typeof value === "string" && SLEEPER_USER_ID_RE.test(value);
}

export function isValidDraftId(value: unknown): value is string {
  return typeof value === "string" && DRAFT_ID_RE.test(value);
}
