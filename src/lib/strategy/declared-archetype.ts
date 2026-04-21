/**
 * Client-side "working toward" archetype store. The user marks ONE
 * archetype as their primary direction per league. This is softer
 * than a lock. the framing throughout the UI emphasizes drift and
 * adjustability, not commitment.
 *
 * Naming: kept the file name `declared-archetype.ts` and the legacy
 * read/write helper names for backward compatibility with existing
 * call sites. New code should use the "working toward" semantic.
 */

const KEY_PREFIX = "dc:declared-archetype:";

export function declaredArchetypeKey(leagueId: string): string {
  return `${KEY_PREFIX}${leagueId}`;
}

export function readDeclaredArchetype(leagueId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(declaredArchetypeKey(leagueId));
  } catch {
    return null;
  }
}

export function writeDeclaredArchetype(
  leagueId: string,
  archetypeId: string | null,
): void {
  if (typeof window === "undefined") return;
  try {
    if (archetypeId === null) {
      window.localStorage.removeItem(declaredArchetypeKey(leagueId));
    } else {
      window.localStorage.setItem(declaredArchetypeKey(leagueId), archetypeId);
    }
  } catch {
    // storage disabled; nothing to do
  }
}
