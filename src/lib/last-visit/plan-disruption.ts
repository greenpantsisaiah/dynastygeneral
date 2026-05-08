/**
 * Plan-disruption detection. Per memory project_emotional_continuity_
 * through_plan_disruption: when a player who was in the user's prior
 * plan (standing call, top_candidates, next-picks-plan targets) gets
 * drafted by another team between visits, the redesigned hub
 * surfaces a brief Voice A acknowledgment before the new standing
 * call refreshes silently.
 *
 * "Judkins gone, two picks before yours. Recalibrating the next-pick
 * math."
 *
 * Implementation: extends the last-visit fingerprint with a
 * plan_player_ids[] array, then on next render compares against
 * picks_made by other rosters. Snipes (prior-plan players now in
 * someone else's picks) drive the acknowledgment.
 */

import type { LastVisitFingerprint } from "./cookie";
import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";

export type PlanSnipe = {
  player_id: string;
  player_name: string;
  drafted_by_roster_id: number;
  drafted_by_owner: string | null;
  pick_no: number;
};

export type PlanDisruption = {
  // Players from the prior plan now in someone else's picks_made.
  snipes: PlanSnipe[];
  // Voice A acknowledgment text. Null when no snipes (caller
  // suppresses the line).
  acknowledgment: string | null;
};

const PLAN_PLAYER_IDS_CAP = 20;

/**
 * Build the plan_player_ids array to store in the cookie. Caller
 * passes in the player_ids referenced anywhere in the current
 * decision (recommendation + top_candidates + next_picks_plan
 * targets). Deduped, capped, ordered by relevance (recommendation
 * first).
 */
export function buildPlanPlayerIds(args: {
  recommendation_id: string | null;
  top_candidate_ids: string[];
  next_picks_plan_target_ids: string[];
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (id: string | null | undefined) => {
    if (!id) return;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  push(args.recommendation_id);
  for (const id of args.top_candidate_ids) push(id);
  for (const id of args.next_picks_plan_target_ids) push(id);
  return out.slice(0, PLAN_PLAYER_IDS_CAP);
}

export function detectPlanDisruption(args: {
  prior: LastVisitFingerprint | null;
  snap: LeagueSnapshot;
  // player_id -> { name, position }
  playerNameLookup: (id: string) => { name: string; position: string | null } | null;
}): PlanDisruption {
  const { prior, snap, playerNameLookup } = args;
  if (!prior?.plan_player_ids || prior.plan_player_ids.length === 0) {
    return { snipes: [], acknowledgment: null };
  }
  const myRoster = snap.rosters.find((r) => r.is_me);
  const myRosterId = myRoster?.roster_id ?? null;

  const planSet = new Set(prior.plan_player_ids);
  const snipes: PlanSnipe[] = [];
  for (const p of snap.draft.picks_made) {
    if (!planSet.has(p.player_id)) continue;
    if (myRosterId != null && p.roster_id === myRosterId) continue;
    // The cookie was written at last render. Picks_made entries that
    // existed at last render were presumably already filtered out of
    // the plan when it was built. But the cookie doesn't carry
    // pick_no per plan player, so we can't precisely distinguish
    // "drafted before last render" from "drafted between renders."
    // Heuristic: snipe-detection only fires on picks_made[i] whose
    // pick_no > prior.total_picks_made. That bounds the snipe set
    // to picks made strictly between visits.
    if (p.pick_no <= prior.total_picks_made) continue;
    const meta = playerNameLookup(p.player_id);
    const drafter = snap.rosters.find((r) => r.roster_id === p.roster_id);
    snipes.push({
      player_id: p.player_id,
      player_name: meta?.name ?? p.player_id,
      drafted_by_roster_id: p.roster_id,
      drafted_by_owner: drafter?.owner_name ?? null,
      pick_no: p.pick_no,
    });
  }

  return {
    snipes,
    acknowledgment: composeAcknowledgment(snipes, snap),
  };
}

function composeAcknowledgment(
  snipes: PlanSnipe[],
  snap: LeagueSnapshot,
): string | null {
  if (snipes.length === 0) return null;
  // Order by pick_no desc so most recent snipe leads.
  const ordered = [...snipes].sort((a, b) => b.pick_no - a.pick_no);
  // Single snipe: name the player + the drafter + recalibration.
  // Voice A: terse, decisive, no "dammit" or "the quiet part out
  // loud" affect.
  if (ordered.length === 1) {
    const s = ordered[0];
    const picksBefore = picksBeforeYou(s.pick_no, snap);
    const beforePart =
      picksBefore != null && picksBefore > 0
        ? `, ${picksBefore} pick${picksBefore === 1 ? "" : "s"} before yours`
        : "";
    if (s.drafted_by_owner) {
      return `${s.drafted_by_owner} took ${s.player_name}${beforePart}. Recalibrating the next-pick math.`;
    }
    return `${s.player_name} gone${beforePart}. Recalibrating the next-pick math.`;
  }
  // Multiple snipes: aggregate. Don't list more than 3 names; cap at
  // "and N more" when needed.
  const names = ordered.slice(0, 3).map((s) => s.player_name).join(", ");
  const more = ordered.length > 3 ? `, and ${ordered.length - 3} more` : "";
  return `Multiple plan players gone since you were last here: ${names}${more}. Recalibrating.`;
}

/**
 * How many picks before the user's next pick the snipe happened.
 * Returns null when we cannot resolve the user's next pick (no
 * schedule available).
 */
function picksBeforeYou(
  snipePickNo: number,
  snap: LeagueSnapshot,
): number | null {
  const myNext = snap.draft.my_pick_schedule?.[0]?.pick_no ?? null;
  if (myNext == null) return null;
  if (myNext <= snipePickNo) return null;
  return myNext - snipePickNo;
}
