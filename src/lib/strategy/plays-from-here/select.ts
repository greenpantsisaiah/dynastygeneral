/**
 * Selector. picks PlayFromHere entries that apply to the current
 * draft state. Sorted by chance_pays_off descending. Returns top N.
 */

import { getMyRoster, type LeagueSnapshot } from "../league-state/snapshot";
import type {
  AppliesWhen,
  PlayFromHere,
  RosterRequirement,
} from "./types";
import { EARLY_ROUND_PLAYS } from "./catalog/early-rounds";
import { slotForPickNo } from "@/lib/sleeper/snake";

const ALL_PLAYS: PlayFromHere[] = [...EARLY_ROUND_PLAYS];

// Bumped from 4 to 6 per user feedback 2026-04-24: Plays From Here
// is the highest-signal hot-take panel on the hub; surface a couple
// more when the catalog has them available without compromising
// quality (selector still filters by AppliesWhen, so weak fits drop).
const TOP_N = 6;

function userSlot(snap: LeagueSnapshot): number | null {
  // Authoritative: snapshot carries my_slot from slot_to_roster_id.
  if (snap.draft.my_slot != null) return snap.draft.my_slot;
  // Fallback: derive from a picks_made entry using reversal-aware math.
  const me = snap.rosters.find((r) => r.is_me);
  if (!me) return null;
  const myPick = snap.draft.picks_made.find((p) => p.roster_id === me.roster_id);
  if (!myPick) return null;
  return slotForPickNo(myPick.pick_no, snap.total_teams, {
    type: snap.draft.type ?? "snake",
    reversalRound: snap.draft.reversal_round,
  }).slot;
}

function currentRound(snap: LeagueSnapshot): number | null {
  if (snap.draft.next_pick_no == null) return null;
  return Math.ceil(snap.draft.next_pick_no / snap.total_teams);
}

function currentPickInRound(snap: LeagueSnapshot): number | null {
  if (snap.draft.next_pick_no == null) return null;
  return ((snap.draft.next_pick_no - 1) % snap.total_teams) + 1;
}

function rosterRequirementsMatch(
  reqs: RosterRequirement[] | undefined,
  snap: LeagueSnapshot,
): boolean {
  if (!reqs || reqs.length === 0) return true;
  const me = getMyRoster(snap);
  if (!me) return true; // no roster yet → don't filter; let plays show
  for (const r of reqs) {
    const have = me.position_counts[r.position];
    if (r.min != null && have < r.min) return false;
    if (r.max != null && have > r.max) return false;
  }
  return true;
}

function applies(rule: AppliesWhen, snap: LeagueSnapshot): boolean {
  if (rule.formats && !rule.formats.includes(snap.format)) return false;
  if (rule.slot_in) {
    const s = userSlot(snap);
    if (s == null || !rule.slot_in.includes(s)) return false;
  }
  if (rule.pick_in_round_in) {
    const p = currentPickInRound(snap);
    if (p == null || !rule.pick_in_round_in.includes(p)) return false;
  }
  if (rule.round_in) {
    const r = currentRound(snap);
    if (r == null || !rule.round_in.includes(r)) return false;
  }
  if (rule.total_picks_made_min != null) {
    if (snap.draft.picks_made.length < rule.total_picks_made_min) return false;
  }
  if (rule.total_picks_made_max != null) {
    if (snap.draft.picks_made.length > rule.total_picks_made_max) return false;
  }
  return true;
}

export function selectPlaysFromHere(snap: LeagueSnapshot): PlayFromHere[] {
  const matching = ALL_PLAYS.filter(
    (p) =>
      applies(p.applies_when, snap) &&
      rosterRequirementsMatch(p.roster_requirements, snap),
  );
  matching.sort((a, b) => b.chance_pays_off - a.chance_pays_off);
  return matching.slice(0, TOP_N);
}
