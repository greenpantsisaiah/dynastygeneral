/**
 * Canonical "which players does this roster own right now."
 *
 * Sleeper keeps two sources for roster membership and only one of them
 * is authoritative at any moment:
 *
 *   - `roster.players`: the server-of-record roster. Reflects every
 *     add / drop / trade / waiver claim. During a LIVE draft it is stale
 *     (Sleeper does not write picks onto rosters until the draft
 *     completes), so mid-draft it under-counts.
 *   - `draft.picks`: the pick log. The ONLY source of mid-draft
 *     ownership. Once the draft completes it is HISTORY, not ownership:
 *     a drafted player who was later dropped or traded still appears
 *     in the pick log under the drafting roster.
 *
 * So the merge rule is status-gated: union draft picks into the roster
 * ONLY while the draft is live (`drafting` / `paused`). For every other
 * status (`pre_draft`, `complete`, `no_draft`) `roster.players` alone
 * is the truth.
 *
 * Bug class avoided (founder report 2026-09-15, Finders Keepers): an
 * unconditional union resurrected five dropped draftees (Shedeur
 * Sanders, Anthony Richardson, Eli Stowers, Devin Neal, Dylan Sampson)
 * onto the user's in-season roster. Coach then insisted the user had
 * five QBs "confirmed in the snapshot" while Sleeper showed three.
 * Position counts, startable depth, and the named Coach roster all
 * read the same merged list, so the phantom players leaked into every
 * downstream surface at once.
 */

import type { DraftStatus } from "@/lib/sleeper/draft-state";

/** A draft is live when picks are still being made or can resume. */
export function isLiveDraft(status: DraftStatus | null | undefined): boolean {
  return status === "drafting" || status === "paused";
}

/**
 * The de-duplicated player ids a roster owns right now. Draft picks are
 * merged only while the draft is live; otherwise `rosterPlayers` is
 * returned as-is (de-duplicated, nulls dropped).
 */
export function ownedPlayerIds(args: {
  rosterPlayers: ReadonlyArray<string | null | undefined> | null | undefined;
  draftedForRoster: ReadonlyArray<string | null | undefined> | null | undefined;
  draftStatus: DraftStatus | null | undefined;
}): string[] {
  const owned = new Set<string>();
  for (const id of args.rosterPlayers ?? []) {
    if (id) owned.add(id);
  }
  if (isLiveDraft(args.draftStatus)) {
    for (const id of args.draftedForRoster ?? []) {
      if (id) owned.add(id);
    }
  }
  return [...owned];
}

/**
 * Group a pick log by drafting roster. Returns the ids each roster
 * DRAFTED (history), which `ownedPlayerIds` then gates by status.
 */
export function draftedIdsByRoster(
  picks: ReadonlyArray<{
    player_id?: string | null;
    roster_id?: number | null;
  }>,
): Map<number, string[]> {
  const byRoster = new Map<number, string[]>();
  for (const p of picks) {
    if (!p.player_id || typeof p.roster_id !== "number") continue;
    const list = byRoster.get(p.roster_id) ?? [];
    list.push(p.player_id);
    byRoster.set(p.roster_id, list);
  }
  return byRoster;
}
