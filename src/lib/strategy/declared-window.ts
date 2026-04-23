/**
 * Client-side declared window-weighting store. One per league.
 * Parallel to declared-archetype.ts (archetype = strategy commitment;
 * window = ratio commitment). Both persist to localStorage.
 */

import type { WindowWeightingId } from "./windows/types";

const KEY_PREFIX = "dc:declared-window:";
const COOKIE_PREFIX = "dw_";
const VALID_IDS: ReadonlySet<WindowWeightingId> = new Set([
  "all-in",
  "lean-now",
  "balanced",
  "lean-future",
  "rebuild",
]);

export function declaredWindowKey(leagueId: string): string {
  return `${KEY_PREFIX}${leagueId}`;
}

export function declaredWindowCookieName(leagueId: string): string {
  return `${COOKIE_PREFIX}${leagueId}`;
}

// Parse a window id from arbitrary string; returns null if invalid.
// Used by server-side cookie read path.
export function parseDeclaredWindowId(
  raw: string | null | undefined,
): WindowWeightingId | null {
  if (!raw) return null;
  return VALID_IDS.has(raw as WindowWeightingId)
    ? (raw as WindowWeightingId)
    : null;
}

export function readDeclaredWindow(
  leagueId: string,
): WindowWeightingId | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(declaredWindowKey(leagueId));
    if (!raw) return null;
    return VALID_IDS.has(raw as WindowWeightingId)
      ? (raw as WindowWeightingId)
      : null;
  } catch {
    return null;
  }
}

export function writeDeclaredWindow(
  leagueId: string,
  id: WindowWeightingId | null,
): void {
  if (typeof window === "undefined") return;
  try {
    if (id === null) {
      window.localStorage.removeItem(declaredWindowKey(leagueId));
    } else {
      window.localStorage.setItem(declaredWindowKey(leagueId), id);
    }
  } catch {
    // storage disabled; nothing to do
  }
  // Mirror to cookie so the server can read it on the next request.
  // Server uses this for Decision Synthesis constraints. 180 days is
  // plenty; dynasty league windows rarely change mid-season.
  try {
    if (typeof document === "undefined") return;
    const name = declaredWindowCookieName(leagueId);
    if (id === null) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    } else {
      const maxAge = 60 * 60 * 24 * 180;
      document.cookie = `${name}=${encodeURIComponent(id)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
    }
  } catch {
    // cookies disabled; non-fatal. UI still reads localStorage.
  }
}
