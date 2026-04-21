/**
 * Client-side declared window-weighting store. One per league.
 * Parallel to declared-archetype.ts (archetype = strategy commitment;
 * window = ratio commitment). Both persist to localStorage.
 */

import type { WindowWeightingId } from "./windows/types";

const KEY_PREFIX = "dc:declared-window:";
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
}
