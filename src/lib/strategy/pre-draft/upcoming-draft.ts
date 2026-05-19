/**
 * Upcoming-draft summary. Answers the three things the founder asked
 * for explicitly:
 *   1. Which pick(s) do I own in the upcoming draft?
 *   2. Which of my picks did I trade away (and to whom)?
 *   3. Which opponent picks did I acquire (and from whom)?
 *
 * Reads canonical data from the snapshot (slot_to_roster_id +
 * traded_picks). For dynasty leagues in PRE_DRAFT status, this is the
 * data the Future Pick Cabinet hides (cabinet shows year+1 onward,
 * but the immediate upcoming rookie draft picks live in the same
 * snapshot.season). For active drafts the same data still works.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import { rosterAtPickNo } from "@/lib/sleeper/pick-resolution";

export type UpcomingPickRow = {
  pick_no: number;
  pick_label: string;
  round: number;
  slot: number;
  /** Original owner roster_id (whose pick this was before any trade). */
  original_owner: number;
  /** Current owner roster_id (whose pick this is now). */
  current_owner: number;
  /** True when the user's roster originally owned this pick. */
  was_originally_mine: boolean;
  /** True when the user's roster currently owns this pick. */
  is_currently_mine: boolean;
};

/**
 * Two or more back-to-back owned picks (consecutive pick_no). Powers
 * the "pair strategy" callout: when a user owns picks 7.5 + 7.6
 * back-to-back, they can lock a player AND their natural pairing
 * (e.g. RB + their handcuff, or two same-tier WRs) before the field
 * gets another shot.
 *
 * Per founder report 2026-05-19: "I'll know you nailed this when the
 * page is noticing I have upcoming 7.5 and 7.6 back to back picks
 * and something on the page suggests how to play that."
 */
export type ConsecutivePair = {
  first: UpcomingPickRow;
  second: UpcomingPickRow;
  /** Length of the run (2 for a pair, 3+ for a longer run). */
  length: number;
};

export type UpcomingDraftSummary = {
  season: string;
  total_teams: number;
  rounds: number;
  /** User's base slot (the slot their roster picks in, before trades). */
  my_slot: number | null;
  /** Picks the user currently owns (after applying trades). */
  my_owned: UpcomingPickRow[];
  /** Picks the user originally owned but has since traded away. */
  traded_away: Array<UpcomingPickRow & { sent_to_roster_id: number }>;
  /** Picks the user did NOT originally own but acquired through trade. */
  acquired: Array<UpcomingPickRow & { acquired_from_roster_id: number }>;
  /** Net change in R1 slots (negative = lost ground in R1, positive = gained). */
  r1_slot_delta: number;
  /** Sequences of 2+ owned consecutive pick numbers. */
  consecutive_pairs: ConsecutivePair[];
  /** Total count of pick trades in this draft's season (informational chip). */
  total_pick_trades_in_draft: number;
};

function labelForPickNo(pickNo: number, teams: number): string {
  const round = Math.ceil(pickNo / teams);
  const within = ((pickNo - 1) % teams) + 1;
  return `${round}.${within < 10 ? `0${within}` : within}`;
}

/**
 * Build the upcoming-draft summary. Inputs are read straight from the
 * snapshot; no Sleeper calls. Returns null when the snapshot lacks the
 * data needed to draw a slot map (e.g. preseason where slot_to_roster_id
 * has not been published yet).
 */
export function summarizeUpcomingDraft(args: {
  snap: LeagueSnapshot;
  myRosterId: number;
}): UpcomingDraftSummary | null {
  const { snap, myRosterId } = args;
  const totalTeams = snap.total_teams;
  const slotToRosterId = snap.draft.slot_to_roster_id ?? {};
  const slotEntries = Object.entries(slotToRosterId);
  if (slotEntries.length === 0) {
    // Pre-draft snapshots sometimes ship without slot_to_roster_id
    // published yet. Summary is not renderable in that state.
    return null;
  }

  // The "upcoming draft season" is snap.season for an upcoming rookie
  // draft (Sleeper assigns the rookie draft to the active season).
  const season = snap.season;
  const rounds = snap.draft.rounds || 4;

  let mySlot: number | null = null;
  for (const [slotKey, rid] of slotEntries) {
    if (rid === myRosterId) {
      mySlot = Number(slotKey);
      break;
    }
  }
  // Index slot_to_roster_id by numeric slot. The snapshot ships it as
  // Record<number, number>; using a Map avoids string/number mismatch
  // when TypeScript infers the index signature.
  const slotMap = new Map<number, number>();
  for (const [k, v] of slotEntries) {
    const n = Number(k);
    if (Number.isFinite(n) && typeof v === "number") slotMap.set(n, v);
  }

  const myOwned: UpcomingPickRow[] = [];
  const tradedAway: Array<UpcomingPickRow & { sent_to_roster_id: number }> = [];
  const acquired: Array<UpcomingPickRow & { acquired_from_roster_id: number }> =
    [];

  // Enumerate every (round, slot) cell of the upcoming rookie draft.
  // Most rookie drafts run 4 rounds; we read snap.draft.rounds when
  // available so 5-round leagues + custom configs work.
  // Walk every cell of the upcoming rookie draft. For each pick_no we
  // resolve the current owner through the canonical rosterAtPickNo
  // helper, which applies the trade-override map AND snake / linear
  // draft-type logic in one place. We compute the original owner
  // separately from slot_to_roster_id (canonical resolver only returns
  // the EFFECTIVE owner, but we want to flag picks the user originally
  // owned but has since traded away).
  const isSnake = snap.draft.type !== "linear" && snap.draft.type !== "auction";
  for (let round = 1; round <= rounds; round++) {
    for (let slot = 1; slot <= totalTeams; slot++) {
      const originalOwner = slotMap.get(slot);
      if (typeof originalOwner !== "number") continue;
      // Pick_no using draft-type-aware slot math. Snake reverses even
      // rounds; linear and auction don't. Mirrors slotForPickNo without
      // recomputing it from inside the canonical resolver (we already
      // have slot here from the outer iteration).
      const effectiveSlot =
        isSnake && round % 2 === 0 ? totalTeams + 1 - slot : slot;
      const pickNo = (round - 1) * totalTeams + effectiveSlot;
      const currentOwner =
        rosterAtPickNo({
          pickNo,
          totalTeams,
          season,
          draft: snap.draft,
        }) ?? originalOwner;

      const row: UpcomingPickRow = {
        pick_no: pickNo,
        pick_label: labelForPickNo(pickNo, totalTeams),
        round,
        slot: effectiveSlot,
        original_owner: originalOwner,
        current_owner: currentOwner,
        was_originally_mine: originalOwner === myRosterId,
        is_currently_mine: currentOwner === myRosterId,
      };

      if (row.is_currently_mine) {
        myOwned.push(row);
      }
      if (row.was_originally_mine && !row.is_currently_mine) {
        tradedAway.push({ ...row, sent_to_roster_id: currentOwner });
      }
      if (!row.was_originally_mine && row.is_currently_mine) {
        acquired.push({ ...row, acquired_from_roster_id: originalOwner });
      }
    }
  }

  // Sort all lists by pick_no ascending.
  myOwned.sort((a, b) => a.pick_no - b.pick_no);
  tradedAway.sort((a, b) => a.pick_no - b.pick_no);
  acquired.sort((a, b) => a.pick_no - b.pick_no);

  // R1 slot delta: did the user move up or down in round 1 net?
  // Compare baseline (my_slot) against the actual R1 slot they hold.
  // When the user traded their R1 away entirely with no R1 acquired,
  // r1_slot_delta represents "fully lost R1" with a sentinel of
  // -totalTeams (effectively at the back of the round, then gone).
  let r1SlotDelta = 0;
  const myR1 = myOwned.find((p) => p.round === 1);
  const baselineR1Slot = mySlot;
  if (baselineR1Slot != null) {
    if (myR1) {
      r1SlotDelta = baselineR1Slot - myR1.slot;
    } else {
      r1SlotDelta = -totalTeams;
    }
  }

  // During active draft, filter my_owned to FUTURE picks only.
  // Already-made picks live in snap.draft.picks_made and shouldn't
  // appear as "upcoming you own." The canonical my_pick_schedule
  // already does this filter at the snapshot layer; we mirror it here
  // so the banner doesn't surface picks the user has already used.
  const nextPickNo = snap.draft.next_pick_no;
  const upcomingOnly = (rows: UpcomingPickRow[]): UpcomingPickRow[] =>
    typeof nextPickNo === "number"
      ? rows.filter((r) => r.pick_no >= nextPickNo)
      : rows;
  const myOwnedUpcoming = upcomingOnly(myOwned);

  // Consecutive-pair detection runs against UPCOMING owned picks only;
  // pairs that already resolved (both picks made) are not actionable.
  // Walk myOwnedUpcoming sorted by pick_no; any run of 2+ picks where
  // each pick_no === previous + 1 is a back-to-back.
  const consecutivePairs: ConsecutivePair[] = [];
  for (let i = 0; i < myOwnedUpcoming.length; i++) {
    let runLength = 1;
    while (
      i + runLength < myOwnedUpcoming.length &&
      myOwnedUpcoming[i + runLength].pick_no ===
        myOwnedUpcoming[i + runLength - 1].pick_no + 1
    ) {
      runLength++;
    }
    if (runLength >= 2) {
      consecutivePairs.push({
        first: myOwnedUpcoming[i],
        second: myOwnedUpcoming[i + 1],
        length: runLength,
      });
      // Skip past the consumed run so we don't double-count.
      i += runLength - 1;
    }
  }

  // Trade-count chip. Only count trades matching this draft's season.
  const totalTradesInDraft = snap.draft.traded_picks.filter(
    (tp) => tp.season === season,
  ).length;

  return {
    season,
    total_teams: totalTeams,
    rounds,
    my_slot: mySlot,
    my_owned: myOwnedUpcoming,
    traded_away: tradedAway,
    acquired,
    r1_slot_delta: r1SlotDelta,
    consecutive_pairs: consecutivePairs,
    total_pick_trades_in_draft: totalTradesInDraft,
  };
}
