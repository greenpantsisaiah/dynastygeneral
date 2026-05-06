/**
 * Canonical "who owns this pick?" resolver. ONE implementation, used
 * by every surface that needs to attribute a pick number to a roster.
 *
 * History (the reason this file exists):
 *   - draft-state.ts had `effectiveRosterIdForPickNo` (banner + on-the-clock).
 *   - predict.ts had `rosterAtSlot` (opponent prediction + Decision title).
 *   - synthesize.ts had an inline trade-override loop in `analyzeOpponentsInGap`.
 *
 * Three independent implementations of the same concept gave us the
 * 2026-05-06 "4.5 · 2 ahead" bug: we patched two of them at different
 * times and the third quietly drifted.
 *
 * Per INVARIANTS Meta-principle: tuning capacity is the reason to
 * consolidate. One file = one place to fix when something feels off.
 */

import { slotForPickNo } from "@/lib/sleeper/snake";
import type { TradedPick } from "@/lib/sleeper/draft-state";
import type { DraftPickRecord } from "@/lib/strategy/league-state/snapshot";

export type PickResolutionDraft = {
  // Snapshot widens the Sleeper draft type field to `string | null`
  // since Sleeper occasionally returns formats outside our enum.
  // Anything other than "linear" or "auction" is treated as snake.
  type: string | null;
  reversal_round: number | null;
  slot_to_roster_id: Record<number, number>;
  // Optional. Used as fallback when slot_to_roster_id is empty
  // (rare pre-draft state where Sleeper has not populated the map).
  picks_made?: DraftPickRecord[];
  traded_picks: TradedPick[];
};

/**
 * Resolve the EFFECTIVE owner of a pick after applying trade overrides.
 *
 *   - Returns the trade-override owner if the pick has been traded.
 *   - Otherwise returns the original slot owner.
 *   - Returns null when the slot cannot be resolved (no map entry,
 *     no picks_made fallback, or unowned slot).
 *
 * Trade matching is keyed by (season, round, original_owner_roster_id).
 * The same (round, original_owner) tuple can only be traded once per
 * season; pick chains in Sleeper resolve to a single current_owner.
 */
export function rosterAtPickNo(args: {
  pickNo: number;
  totalTeams: number;
  season: string;
  draft: PickResolutionDraft;
}): number | null {
  const { pickNo, totalTeams, season, draft } = args;
  const draftType =
    draft.type === "linear" || draft.type === "auction"
      ? draft.type
      : "snake";
  const { slot } = slotForPickNo(pickNo, totalTeams, {
    type: draftType,
    reversalRound: draft.reversal_round,
  });

  // Authoritative slot → roster mapping from Sleeper draft metadata.
  const direct = draft.slot_to_roster_id[slot];
  let originalRoster: number | null =
    typeof direct === "number" ? direct : null;

  // Fallback: sample picks_made when the metadata map is empty. Useful
  // in pre-draft states where Sleeper has not yet populated the map but
  // picks_made already records the slot assignments.
  if (originalRoster == null && draft.picks_made && draft.picks_made.length > 0) {
    const sample = draft.picks_made.find((p) => {
      const s = slotForPickNo(p.pick_no, totalTeams, {
        type: draftType,
        reversalRound: draft.reversal_round,
      });
      return s.slot === slot;
    });
    originalRoster = sample?.roster_id ?? null;
  }

  if (originalRoster == null) return null;

  const round = Math.ceil(pickNo / totalTeams);
  for (const t of draft.traded_picks) {
    if (t.season !== season) continue;
    if (t.round !== round) continue;
    if (t.original_owner !== originalRoster) continue;
    return t.current_owner;
  }
  return originalRoster;
}
