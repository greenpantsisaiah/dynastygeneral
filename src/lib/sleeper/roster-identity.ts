/**
 * Canonical roster-ownership check.
 *
 * A roster belongs to a user if they are the primary owner OR a
 * co-owner. Sleeper supports co-ownership (`roster.co_owners`);
 * resolving identity by `owner_id` alone silently mis-identifies
 * co-owned teams, a trust-breaking bug class (INVARIANTS.md "Roster
 * identity must be ground-truth verified"; `co_owners` is one of the
 * named Sleeper gotchas). In leagues without co-owners `co_owners` is
 * null/empty, so this behaves identically to a plain `owner_id` match;
 * it is a no-op there and a fix in co-owned leagues.
 *
 * Returns false for a null/absent user id, so orphan rosters
 * (`owner_id: null`) never produce a false positive.
 */
export function isRosterOwnedBy(
  roster:
    | { owner_id?: string | null; co_owners?: string[] | null }
    | null
    | undefined,
  sleeperUserId: string | null | undefined,
): boolean {
  if (!roster || !sleeperUserId) return false;
  if (roster.owner_id === sleeperUserId) return true;
  return roster.co_owners?.includes(sleeperUserId) ?? false;
}
