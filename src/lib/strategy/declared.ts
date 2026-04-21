/**
 * Client-side declared-strategy store (localStorage).
 *
 * Users can declare a strategy per league. The choice persists across
 * sessions in the browser. Until Supabase auth is wired, this is the only
 * persistence layer. When auth lands, mirror writes to the server.
 */

import type { StrategyState } from "@/lib/engine/schemas";

const KEY_PREFIX = "dc:declared-strategy:";

export function declaredKey(leagueId: string): string {
  return `${KEY_PREFIX}${leagueId}`;
}

export function readDeclared(leagueId: string): StrategyState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(declaredKey(leagueId));
    if (!raw) return null;
    if (
      raw === "contender" ||
      raw === "rebuild" ||
      raw === "balanced" ||
      raw === "undetermined"
    ) {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeDeclared(
  leagueId: string,
  state: StrategyState | null,
): void {
  if (typeof window === "undefined") return;
  try {
    if (state === null) {
      window.localStorage.removeItem(declaredKey(leagueId));
    } else {
      window.localStorage.setItem(declaredKey(leagueId), state);
    }
  } catch {
    // storage disabled; nothing to do
  }
}
