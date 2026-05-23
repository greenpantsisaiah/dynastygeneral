/**
 * Reconstruct the "you took Y over the call X" debate beat from the
 * last-visit cookie. This is the honest-first gate that keeps the
 * companion from chiding a user who actually took the call.
 *
 * The crux (founder report 2026-05-23, "I picked Elijah because it was
 * the call, then I felt chided for it"): the cookie's standing_call_id is
 * the call at the user's LAST HUB RENDER, which equals the call they
 * faced at their pick ONLY when two things hold:
 *
 *   1. Freshness. The pick followed the render closely. After several
 *      intervening picks the board churned and the engine's call shifted,
 *      so the cookie call no longer describes the board the user saw. A
 *      "divergence" against it is an artifact, not a choice.
 *   2. Corroboration. The current engine still surfaces the cookie call
 *      as a real alternative. This re-points the beat at the new Decision
 *      Board (REDESIGN_INTENTIONS.md "Companion <-> Plays/Call
 *      integration") and filters pre-refactor / stale calls the user
 *      never actually faced.
 *
 * Honest-first: when either fails we return null and the caller refreshes
 * the expectation silently. A missed debate is benign; a false chide
 * kills trust (Principle 13, the anti-slime guarantee).
 *
 * Names resolve through a lookup that MUST cover the available pool: a
 * real divergence is available-vs-available, so a rostered-only lookup
 * leaves a raw player id in the copy (the "13320" leak, 2026-05-23). If
 * either name is unresolved we suppress rather than ship an id.
 */

import type {
  WhatIfReadout,
  WhatIfEvEntry,
} from "../decision-synthesis/whatif";

/**
 * The user's pick must follow the render within this many picks for the
 * cookie call to still describe the board they faced. Beyond this the
 * board churned and the call shifted; honest-first, we stay silent.
 */
export const COMPANION_DEBATE_FRESH_PICKS = 3;

export interface DebatePickRef {
  roster_id: number | null;
  player_id: string;
  pick_no: number;
}

export interface ResolvedName {
  name: string;
  position: string | null;
}

export function reconstructPickDebate(args: {
  /** The standing-call player_id from the last-visit cookie. */
  priorStandingCallId: string | null;
  /** Total league picks made at the last visit (the render baseline). */
  priorTotalPicksMade: number;
  myRosterId: number | null;
  picksMade: DebatePickRef[];
  /** Recommendation + top_candidates ids from the CURRENT decision. */
  currentCandidateIds: Set<string>;
  /** Pool-aware name resolver (available pool + rostered + drafted). */
  resolveName: (id: string) => ResolvedName | null;
  resolveValue: (id: string) => number | null | undefined;
  resolveAdp: (id: string) => number | null;
}): { whatIf: WhatIfReadout; chosenId: string } | null {
  const {
    priorStandingCallId,
    priorTotalPicksMade,
    myRosterId,
    picksMade,
    currentCandidateIds,
    resolveName,
    resolveValue,
    resolveAdp,
  } = args;
  if (!priorStandingCallId || myRosterId == null) return null;

  // Anchor to the user's FIRST pick after the visit. The cookie call was
  // advising THAT pick, not whatever they took several picks later.
  const firstPick = picksMade
    .filter(
      (p) => p.roster_id === myRosterId && p.pick_no > priorTotalPicksMade,
    )
    .sort((a, b) => a.pick_no - b.pick_no)[0];
  if (!firstPick) return null;
  if (firstPick.player_id === priorStandingCallId) return null; // took the call

  // Freshness: the pick must have followed the render closely.
  const elapsedPicks = firstPick.pick_no - priorTotalPicksMade;
  if (elapsedPicks > COMPANION_DEBATE_FRESH_PICKS) return null;

  // Corroboration: the engine must still surface the cookie call as a
  // real alternative (aligns the beat with the current Decision Board).
  if (!currentCandidateIds.has(priorStandingCallId)) return null;

  // Names from a pool-aware lookup; suppress on any raw id.
  const callInfo = resolveName(priorStandingCallId);
  const chosenInfo = resolveName(firstPick.player_id);
  if (!callInfo || !chosenInfo) return null;

  const evOf = (id: string): number | null => {
    const value = resolveValue(id);
    const adp = resolveAdp(id);
    if (typeof value !== "number" || typeof adp !== "number") return null;
    return round2((value / 100) * (firstPick.pick_no - adp));
  };

  const callEntry: WhatIfEvEntry = {
    player_id: priorStandingCallId,
    player_name: callInfo.name,
    position: callInfo.position,
    ev_if_chosen: evOf(priorStandingCallId),
    delta_vs_standing_call: 0,
    survival_pct: null,
    is_standing_call: true,
    narrative: "",
  };
  const chosenEntry: WhatIfEvEntry = {
    player_id: firstPick.player_id,
    player_name: chosenInfo.name,
    position: chosenInfo.position,
    ev_if_chosen: evOf(firstPick.player_id),
    delta_vs_standing_call: null,
    survival_pct: null,
    is_standing_call: false,
    narrative: "",
  };
  chosenEntry.delta_vs_standing_call =
    chosenEntry.ev_if_chosen != null && callEntry.ev_if_chosen != null
      ? round2(chosenEntry.ev_if_chosen - callEntry.ev_if_chosen)
      : null;

  return {
    whatIf: {
      standing_call_id: priorStandingCallId,
      standing_call_ev: callEntry.ev_if_chosen,
      entries: [callEntry, chosenEntry],
    },
    chosenId: firstPick.player_id,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
