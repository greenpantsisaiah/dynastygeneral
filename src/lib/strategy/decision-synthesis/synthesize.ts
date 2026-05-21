/**
 * Decision synthesizer. Composes the snapshot, ranked archetypes,
 * available pool, windows, and pick schedule into ONE Decision
 * object. Server-only.
 *
 * Algorithm (first cut):
 *   1. Enumerate candidates across rules: fill-starter-urgent,
 *      fill-starter, push-path, earned-value.
 *   2. Score each candidate. Urgency (scarcity vs gap-to-next-user-
 *      pick) is the biggest boost; path alignment matters next;
 *      earned value is the fallback.
 *   3. Winner drives recommendation. Runners-up feed the tradeoff.
 *   4. Build next-picks-plan from schedule[1..3] with projected
 *      survival at each.
 *   5. Scarcity callout: if we recommended a position, compute the
 *      gap until the next viable option at that position.
 *   6. Emergency trade-up: surfaces only when urgency is extreme
 *      (top option almost certainly gone by next user pick AND it's
 *      filling a real starter hole).
 */

import type { LeagueSnapshot, PickScheduleEntry } from "../league-state/snapshot";
import type {
  RankedArchetype,
  Position,
} from "../archetypes/schema";
import type { AvailablePlayer } from "@/lib/players/available";
import type { WindowsResult } from "../windows/compute";
import { rosterAtPickNo } from "@/lib/sleeper/pick-resolution";
import {
  buildPositionRoomHealth,
  getHardStarterReqs as effectiveStarterReqs,
} from "@/lib/engine/roster-fit";
import {
  buildTrajectory,
  classifyLane,
} from "@/lib/engine/build-trajectory";
import type {
  Decision,
  DecisionCandidate,
  DecisionRule,
  DecisionTopCandidate,
  DecisionQuadrantCandidate,
  DialInfluence,
  NextPickPlanItem,
  OpponentInGap,
  OpponentGapAnalysis,
  CandidateOpponentSignal,
  SynthesisDials,
} from "./types";
import { NEUTRAL_SYNTHESIS_DIALS } from "./types";
import { detectPlaysEnabledBy } from "../plays/detect";

const POSITION_LABEL: Record<Position, string> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  K: "K",
  DST: "DST",
};

// Format-aware starter requirement. The SUPER_FLEX slot is
// position-locked to QB in practice (always the highest scorer in
// PPR), so a 1-QB-on-roster team in superflex is 1/2 on QB starters,
// not 1/1. Imported from roster-fit.ts (canonical source). Re-exported
// here under the legacy name so existing imports from
// "decision-synthesis/synthesize" keep working without bulk rename.
export { effectiveStarterReqs };

// flexShareForPosition + realisticStarterMaxFor moved to canonical
// `roster-fit.ts` 2026-04-27. Imported below as getRealisticStarterMax.

// Position saturation. Returns the score penalty to apply to an
// earned_value or position_steal candidate at this position, plus a
// human-readable note for the WHY. The penalty fires only when ADDING
// the candidate would push the user PAST realistic starter use at
// that position.
//
// Why this exists: Rule 4 (earned_value) used to be roster-blind. It
// picked the top of the harmonized pool regardless of whether the
// user's roster needed that position. In a PPR superflex with
// hard.TE=1, a user with 2 TEs already would still get a 3rd-TE
// recommendation if a TE was the top KTC value on the board. The
// engine ignored that flex EV at TE peters out fast in PPR (TE3
// rarely sees lineup over a WR3) and surfaced a depth pick as the
// lean.
//
// Rule 1 (fill_starter) only checks HARD slots, so this rule covers
// the gap: a user who has filled all hard slots but is below realistic
// starter use at WR (in a 5-WR-eligible PPR superflex) gets WR
// candidates UN-PENALIZED (their natural earned_value score wins),
// while TE candidates get penalized for being over realistic max.
//
// Per founder analysis 2026-04-26 (Isaiah Likely as TE3 in PPR SF
// despite 2 WRs in 5-WR-eligible format).
// ADP-gap modifier. Rewards "buying past ADP" (you're getting the
// player at a discount because the market reached past him) and
// penalizes "reaching" (you'd be drafting earlier than consensus).
//
// Why this exists: the harmonized pool is ordered by KTC VALUE
// (descending). A high-VAL player whose ADP is well past the current
// pick used to win earned_value over a lower-VAL player whose ADP
// puts him at-the-cusp-of-gone. That inverts what a dynasty pro
// means by "value": value isn't "highest KTC number," it's "biggest
// gap between cost-to-acquire (current pick) and player tier."
//
// The modifier is bounded so it doesn't swamp the rule cascade: a
// max swing of ±10-12 points keeps fill_starter_urgent (100) and
// position_steal (70-85) hierarchy intact while still flipping
// close-call earned_value comparisons (Likely vs Kincaid in
// founder analysis 2026-04-26).
//
// Per founder analysis 2026-04-26: Kincaid (ADP 100, current 110,
// gap +10 = market reached past him) was the right call; Likely
// (ADP 127, current 110, gap -17 = reaching) won the rule because
// the engine valued raw KTC over ADP-implied scarcity.
function adpGapModifier(
  adp: number | null,
  currentPickNo: number,
): { adjustment: number; note: string | null } {
  if (adp == null) return { adjustment: 0, note: null };
  const gap = currentPickNo - adp;
  const clamped = Math.max(-12, Math.min(15, gap));
  const adjustment = clamped * 0.8;
  if (gap >= 8) {
    return {
      adjustment,
      note: `Market reached ${Math.round(gap)} picks past his ADP (${Math.round(adp)}); you're getting him below consensus.`,
    };
  }
  if (gap <= -8) {
    return {
      adjustment,
      note: `ADP says ${Math.round(adp)}; taking him here is reaching ${Math.abs(Math.round(gap))} picks before consensus.`,
    };
  }
  return { adjustment, note: null };
}

// Saturation modifier reads from canonical roster-fit. Does NOT
// re-derive realistic-max math; that lives in roster-fit.ts.
function positionSaturationModifier(
  snap: LeagueSnapshot,
  pos: Position,
): { penalty: number; note: string | null } {
  const health = buildPositionRoomHealth(snap, pos);
  if (health.surplus_after_one_more <= 0) {
    return { penalty: 0, note: null };
  }
  const have = health.current_count;
  const realisticMax = health.realistic_starters;
  if (health.surplus_after_one_more >= 2) {
    return {
      penalty: 30,
      note: `${POSITION_LABEL[pos]} is 2+ over realistic starter use (would be ${have + 1} after; this format typically starts ~${realisticMax}). Pure trade asset, unlikely to crack lineup.`,
    };
  }
  return {
    penalty: 30,
    note: `${POSITION_LABEL[pos]} would exceed realistic starter use (would be ${have + 1} after; this format typically starts ~${realisticMax}). Depth pick, low chance of starting.`,
  };
}

type ScoredCandidate = {
  player: AvailablePlayer;
  position: Position;
  rule: DecisionRule;
  // Raw rule-based score before window constraint penalty.
  raw_score: number;
  // Final score after constraint penalty. Drives sort order.
  score: number;
  primary_reason: string;
  // Human-readable note when window constraint penalized this pick.
  // Null when no penalty applies.
  constraint_note: string | null;
  // Which user dials nudged this candidate's score and by how much.
  // Populated only when synthesizeDecision was called with non-neutral
  // dials. Empty array when neutral (no effect).
  dial_influences: DialInfluence[];
};

// Map (age, is_rookie, pool stats) to a horizon score. -100 = full
// win-now, +100 = full future, 0 = balanced. Centered on the pool's
// median age and scaled by its spread, so the chart re-calibrates as
// the draft progresses: when only RB-age players are left, the
// youngest of THOSE is +100 within the pool (not a fixed absolute).
// Rookies still peg at +100 since they have no NFL data and the pool
// spread doesn't capture that asymmetry.
function horizonRelativeToPool(
  age: number | null,
  is_rookie: boolean | undefined,
  poolMedianAge: number,
  poolSpread: number,
): number {
  if (is_rookie) return 100;
  if (age == null) return 0;
  const raw = ((poolMedianAge - age) / Math.max(2, poolSpread)) * 100;
  return Math.max(-100, Math.min(100, raw));
}

// Map a synthesizer score to a 0-100 confidence percentage. The
// synthesizer uses 100 for fill_starter_urgent, 60 for fill_starter,
// 50-75 for push_path, and 30-45 for earned_value (after window
// constraint penalties). Clamp to 0-100.
function confidenceForScore(score: number): number {
  if (score <= 0) return 0;
  if (score >= 100) return 100;
  return score;
}

function toDecisionCandidate(
  p: AvailablePlayer,
  playerValues: Record<string, number>,
  ktcOverallRanks: Record<string, number>,
): DecisionCandidate {
  const v = playerValues[p.id];
  const r = ktcOverallRanks[p.id];
  return {
    player_id: p.id,
    name: p.name,
    position: p.position,
    team: p.team,
    age: p.age,
    search_rank: p.search_rank,
    adp: p.adp,
    adp_variant: p.adp_variant,
    adp_alternatives: p.adp_alternatives ?? [],
    is_rookie: p.is_rookie,
    value: typeof v === "number" ? Math.round(v) : null,
    ktc_overall_rank: typeof r === "number" ? r : null,
  };
}

function normalizePos(raw: string | null): Position | null {
  if (!raw) return null;
  const u = raw.toUpperCase();
  return ["QB", "RB", "WR", "TE", "K", "DST"].includes(u)
    ? (u as Position)
    : null;
}

function topAtPos(
  available: AvailablePlayer[],
  pos: Position,
  n = 1,
): AvailablePlayer[] {
  return available
    .filter((p) => normalizePos(p.position) === pos)
    .slice(0, n);
}

// Three-state availability classifier. Single source of truth for
// "will this player be on the board at slot N when we reach it?"
//
// Replaces the old binary `survivesToNextUserPick` per user feedback
// 2026-04-25: the engine had three different ADP filters using
// different buffers (+5 in survives check, -3 in next-picks-plan
// pool, <0 strict in counter-view). Same player at the same slot
// got labeled "probably gone" in one panel and "take him here" in
// another. Unified to one predicate so all surfaces tell the same
// story.
//
// ADP = market-average pick. Player going at his ADP exactly is a
// coin flip, not "gone." The buckets reflect the real shape of
// market noise: ADP standard deviation is roughly 3-5 picks for
// players in the meaningful tier zone.
//   LIKELY_HERE: gap >= +5 (ADP well after the slot). Take your
//     time, he's sitting.
//   COIN_FLIP: -2 < gap < +5. He's at or just past his ADP.
//     50/50 whether he survives. Not safe to skip without a backup.
//   PROBABLY_GONE: gap <= -2. ADP is at least 2 picks before slot.
//     He's past consensus and getting picked any pick now; treat as
//     fragile-to-gone.
export type Availability = "likely_here" | "coin_flip" | "probably_gone";

// ADP variance is slot-dependent: tight at the top of the draft
// (early picks have high consensus, SD ~2-3 picks) and wider deeper
// in the draft (late-round SD ~5-8 picks). Per dynasty community
// observation across DLF, FantasyPros, and KTC mock-draft datasets.
// The thresholds here pick "1-2 SD past consensus" as the tier
// breakpoints, scaled to the slot.
function availabilityThresholdsFor(slot: number): {
  here: number;
  gone: number;
} {
  if (slot <= 24) return { here: 3, gone: -1 }; // top of draft, tight
  if (slot <= 100) return { here: 5, gone: -2 }; // mid draft, baseline
  // Deep draft (slot > 100) ADP variance is 5-8 picks per the
  // dynasty-community SD estimate above. A player only 3 picks past
  // ADP at round 15+ is normal noise, not "probably gone." Widening
  // gone from -3 to -5 keeps the coin_flip band realistic for late
  // rounds (Bug 2026-04-27: ADP -3 in round 15 was rendering a red
  // 15% bar for what is in fact ~50/50).
  return { here: 7, gone: -5 };
}

function availabilityAt(
  player: AvailablePlayer,
  slot: number,
): Availability | null {
  if (player.adp == null) return null;
  const gap = player.adp - slot;
  const t = availabilityThresholdsFor(slot);

  // Forward gap (ADP later than user's next pick): player typically
  // drafted after user picks; survival is high.
  if (gap >= t.here) return "likely_here";

  // At-or-near consensus (gap in [0, t.here)): real coin flip; the
  // player is being drafted right around now.
  if (gap >= 0) return "coin_flip";

  // Backward gap (ADP in the past): the player has ALREADY survived
  // past consensus AND is still in the available pool. Survival of
  // one more pick is conditional on this prior survival, which the
  // naive ADP-vs-slot math does not capture. Three regimes:
  //
  //   slightly past consensus (gap in (t.gone, 0)): market is
  //   reaching past this player right now; coin flip either way.
  //
  //   far past consensus AND late draft (gap <= t.gone, slot > 100):
  //   market has demonstrably dropped them, draft depth makes
  //   "still here" the expected state; survival is HIGH.
  //
  //   far past consensus AND early/mid draft (gap <= t.gone, slot
  //   <= 100): anomalous (top-tier player skipped through tight
  //   early ADP), the next opponent may correct the anomaly. Coin
  //   flip is the cautious call rather than "likely here."
  //
  // Bug 2026-04-29: prior version returned "probably_gone" for the
  // far-past branch unconditionally. At pick 25.11 with one opponent
  // before user's turn, every candidate with ADP 248-298 (already
  // past consensus by 30-50 picks) rendered 15 percent survival.
  // The available pool IS the conditional event; "still here past
  // consensus" means the market dropped them, not that they will
  // be drafted imminently. The opponent-signal layer downstream
  // can still amplify a coin flip to probably_gone when a specific
  // gap opponent has positional demand for the player.
  if (gap > t.gone) return "coin_flip";
  return slot > 100 ? "likely_here" : "coin_flip";
}

// Game-theory layer over the ADP-based survival predictor. The pure
// ADP classifier is opponent-blind; it only knows market-wide
// behavior. Real survival also depends on what the SPECIFIC
// opponents picking between the user's slots actually need.
//
// Per user feedback 2026-04-25: when the gap-filling opponent has 3
// WRs and 0 TEs, "Moore is at risk if I skip" is wrong (he doesn't
// want another WR) and "LaPorta is safe to wait on" is wrong (he
// wants a TE badly). The engine has the data; it just wasn't
// applying it.
//
/**
 * Survival window: the window of opponent picks survival is computed
 * across. Replaces the old hard-coded "user's first pick to user's
 * second pick" window that was correct only at-turn-with-spaced-picks.
 *
 * Pre-turn (live draft cursor is BEFORE the user's first upcoming
 * pick): the window walks live → user's first pick. The user is
 * watching the board; the meaningful survival question is "will this
 * player still be on the board when my turn comes."
 *
 * At-turn (live === user's first upcoming pick): the window walks
 * user's first pick → first CONTESTED next slot. Back-to-back
 * consecutive picks (snake wraparound, traded slots) are skipped
 * over because they contribute no opponent contention. The
 * meaningful question is "if I pass on this player here, will they
 * survive to my next REAL chance."
 *
 * Founder report 2026-05-19 (lincolnenglish + Finders Keepers): the
 * old implementation showed Skattebo at "coin flip 40%" with 37
 * picks until the user's turn (real survival ~3%), and DeVonta Smith
 * at "likely here 100%" with 2-3 opponents about to pick (real
 * survival ~70%). Same root cause both cases: gap walked the wrong
 * window.
 */
export type SurvivalWindow = {
  live_pick_no: number;
  target_pick_no: number;
  from_pick_no: number;
  to_pick_no: number;
  kind: "pre_turn" | "at_turn";
};

export function computeSurvivalWindow(
  snap: LeagueSnapshot,
  schedule: PickScheduleEntry[],
): SurvivalWindow {
  const userFirstPickNo = schedule[0].pick_no;
  const livePickNo = snap.draft.next_pick_no ?? userFirstPickNo;

  if (livePickNo < userFirstPickNo) {
    return {
      live_pick_no: livePickNo,
      target_pick_no: userFirstPickNo,
      from_pick_no: livePickNo - 1,
      to_pick_no: userFirstPickNo,
      kind: "pre_turn",
    };
  }

  // At-turn: skip past back-to-back consecutive picks to find the
  // first contested next slot. For a user with picks at 7.5, 7.6,
  // 8.5 the contested target is 8.5 (back-to-back at 7.5 / 7.6
  // contribute zero opponents).
  let nextContestedPickNo: number | null = null;
  for (let i = 1; i < schedule.length; i++) {
    if (schedule[i].pick_no - schedule[i - 1].pick_no > 1) {
      nextContestedPickNo = schedule[i].pick_no;
      break;
    }
  }
  const fallbackTarget =
    schedule[1]?.pick_no ?? userFirstPickNo + 999;
  const target = nextContestedPickNo ?? fallbackTarget;

  return {
    live_pick_no: livePickNo,
    target_pick_no: target,
    from_pick_no: userFirstPickNo,
    to_pick_no: target,
    kind: "at_turn",
  };
}

// `analyzeOpponentsInGap` walks opponent picks in a half-open window
// (fromPickNo, toPickNo), identifies each opponent, and computes
// their per-position demand (raw need-weighting then normalized to
// sum to 1.0 across QB/RB/WR/TE). Aggregate demand per position
// summed across all gap opponents drives the per-candidate signal.
//
// The window is configured by the caller via `computeSurvivalWindow`.
// Pre-turn the window is (live_pick - 1, user_first_pick); at-turn
// the window is (user_first_pick, first_contested_next_slot). The
// PRIOR implementation hard-coded `current.pick_no + 1` to
// `nextUserPickNo`, which answered the wrong question pre-turn
// (showed 100% on players that wouldn't survive the 37 opponents
// before the user's pick) and trivially collapsed for back-to-back
// consecutive picks (zero opponents in the gap).
function analyzeOpponentsInGap(args: {
  snap: LeagueSnapshot;
  fromPickNo: number;
  toPickNo: number;
}): OpponentGapAnalysis {
  const { snap, fromPickNo, toPickNo } = args;
  const totalTeams = snap.total_teams;

  // Trade-aware pick owner resolution lives in sleeper/pick-resolution.
  // Three callers (decision-card title, banner, this gap walk) all go
  // through one function; do not re-implement the override loop inline.
  const reqs = effectiveStarterReqs(snap);
  const skillPositions: Position[] = ["QB", "RB", "WR", "TE"];

  const opponentsMap = new Map<number, OpponentInGap>();
  const aggregate: Record<Position, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0,
  };

  // Walk pick numbers strictly inside the (fromPickNo, toPickNo) window.
  for (
    let pickNo = fromPickNo + 1;
    pickNo < toPickNo;
    pickNo++
  ) {
    const currentOwner = rosterAtPickNo({
      pickNo,
      totalTeams,
      season: snap.season,
      draft: snap.draft,
    });
    if (currentOwner == null) continue;

    let entry = opponentsMap.get(currentOwner);
    if (!entry) {
      const roster = snap.rosters.find((r) => r.roster_id === currentOwner);
      if (!roster) continue;
      // Per-position raw need score. Priors based on dynasty
      // community observation: opponents prioritize STARTER HOLES
      // ~50% of the time (rest is best-available override), add
      // depth at filled positions ~15% of the time, rarely take a
      // 4th+ at a surplus position. Calibrated against:
      //   - DLF mock-draft pick distributions (~55% holes-first)
      //   - Athlon Sports positional-run primer (~45-50% need)
      //   - FantasyPros dynasty draft trends (~45% need)
      // Three priors that sum to roughly the right shape; refine
      // later from actual user-draft data once the analytics layer
      // is wired.
      //
      // Shortfall (need not met): high demand 0.5 raw weight.
      // Just-met starter (have == reqs): depth demand 0.15 raw.
      // Surplus (have >= reqs + 2): low demand 0.05 raw.
      const rawDemand: Record<Position, number> = {
        QB: 0,
        RB: 0,
        WR: 0,
        TE: 0,
        K: 0,
        DST: 0,
      };
      for (const pos of skillPositions) {
        const need = reqs[pos] ?? 0;
        if (need <= 0) continue;
        const have = roster.position_counts[pos] ?? 0;
        if (have < need) {
          rawDemand[pos] = 0.5;
        } else if (have >= need + 2) {
          rawDemand[pos] = 0.05;
        } else {
          rawDemand[pos] = 0.15;
        }
      }
      // Normalize to sum to 1.0 across skill positions.
      const total = skillPositions.reduce(
        (s, p) => s + rawDemand[p],
        0,
      );
      const demand: Record<Position, number> = {
        QB: 0,
        RB: 0,
        WR: 0,
        TE: 0,
        K: 0,
        DST: 0,
      };
      if (total > 0) {
        for (const pos of skillPositions) {
          demand[pos] = rawDemand[pos] / total;
        }
      }
      entry = {
        roster_id: currentOwner,
        owner_name: roster.owner_name,
        pick_nos: [],
        position_counts: { ...roster.position_counts },
        position_demand: demand,
      };
      opponentsMap.set(currentOwner, entry);
    }
    entry.pick_nos.push(pickNo);
  }

  // Aggregate demand: each pick the opponent owns counts as one
  // independent draw on their demand distribution. Two back-to-back
  // wraparound picks from the same opponent count twice.
  for (const opp of opponentsMap.values()) {
    for (const pos of skillPositions) {
      aggregate[pos] += opp.position_demand[pos] * opp.pick_nos.length;
    }
  }

  // Pick the most-impactful opponent for the OPPONENT BETWEEN PICKS
  // line. Heuristic: most picks owned, then highest single-position
  // demand (creates the sharpest narrative).
  let primaryOpponent: OpponentInGap | null = null;
  for (const opp of opponentsMap.values()) {
    if (
      !primaryOpponent ||
      opp.pick_nos.length > primaryOpponent.pick_nos.length
    ) {
      primaryOpponent = opp;
    }
  }

  return {
    opponents: Array.from(opponentsMap.values()),
    total_demand_by_position: aggregate,
    primary_opponent: primaryOpponent,
  };
}

// Per-candidate opponent signal. Combines the position-aggregate
// gap demand with the candidate's position to produce one of three
// directional signals + a one-line note. The signal can shift the
// ADP-based availability up or down by one tier.
//
// Thresholds chosen to fire the signal only when the gap is
// meaningfully imbalanced. Mid-range demand stays neutral so we
// don't over-claim certainty.
function opponentSignalForCandidate(args: {
  player: AvailablePlayer;
  gap: OpponentGapAnalysis;
}): CandidateOpponentSignal | null {
  const { player, gap } = args;
  const pos = (player.position ?? "").toUpperCase() as Position;
  if (!["QB", "RB", "WR", "TE"].includes(pos)) return null;
  if (gap.opponents.length === 0) return null;
  const demand = gap.total_demand_by_position[pos] ?? 0;
  // Aggregate demand can exceed 1.0 when multiple opponents have
  // overlapping high-demand positions. Normalize against pick count.
  const totalPicksInGap = gap.opponents.reduce(
    (s, o) => s + o.pick_nos.length,
    0,
  );
  const perPickDemand =
    totalPicksInGap > 0 ? demand / totalPicksInGap : 0;
  if (perPickDemand >= 0.35) {
    // High demand: opponents need this position; player is at risk.
    const primary = gap.primary_opponent;
    const note = primary
      ? `${primary.owner_name ?? "Opp"} likely targets ${pos}`
      : `Gap opponents likely target ${pos}`;
    return { direction: "amplifies", note, per_pick_demand: perPickDemand };
  }
  if (perPickDemand <= 0.10) {
    // Low demand: opponents don't need this position; player likely safe.
    const primary = gap.primary_opponent;
    const havePos = primary?.position_counts[pos] ?? 0;
    const note = primary
      ? `${primary.owner_name ?? "Opp"} has ${havePos} ${pos}, no need`
      : `Gap opponents don't need ${pos}`;
    return { direction: "fades", note, per_pick_demand: perPickDemand };
  }
  return { direction: "neutral", note: null, per_pick_demand: perPickDemand };
}

// Within-position rank shares: when an opponent decides to draft
// position p, the conditional probability they take the Nth-ranked
// available player at that position. Calibrated against dynasty mock-
// draft observation that top-3 at any position absorb ~85-90% of
// position-specific picks, with a long tail of value-reaches.
//
// Rationale (so future readers can adjust the curve):
//   - DLF mock-draft data: top-3 RB/WR absorb 88% of RB/WR picks in
//     middle rounds.
//   - FantasyPros tier-break analysis: when an opponent signals
//     "need RB," the top-by-board RB is taken ~55% of the time.
//   - The remaining 10-15% goes to deeper-board reaches, which
//     happen but rarely move the survival math for top-3 candidates.
const WITHIN_POSITION_RANK_SHARES = [
  0.55, // rank 1 at position
  0.25, // rank 2
  0.10, // rank 3
  0.05, // rank 4
  0.03, // rank 5
  0.02, // rank 6+ (each)
];

function withinPositionRankShare(rankIdx: number): number {
  if (rankIdx < 0) return 0;
  if (rankIdx < WITHIN_POSITION_RANK_SHARES.length) {
    return WITHIN_POSITION_RANK_SHARES[rankIdx];
  }
  return WITHIN_POSITION_RANK_SHARES[
    WITHIN_POSITION_RANK_SHARES.length - 1
  ];
}

// Real-deal survival probability. For each gap-picker, P(takes our
// player on a given pick) = position_demand[pos] × within-position-
// rank-share[player's rank at pos]. P(survives across the whole gap)
// = Π (1 - p_take) across every pick in the gap.
//
// Why this beats the prior 50/50 collapse:
//   - The prior implementation bucketed availability into 3 classes
//     (likely_here / coin_flip / probably_gone) then nudged ±5 from
//     a coarse signal threshold. Most candidates collapsed to 50%.
//   - This version exposes real variance: a top-RB with no RB-needy
//     opponents in a 3-pick gap reads ~94%; a top-QB with a QB-needy
//     opponent reads ~45%. The user gets information instead of
//     uniform coin-flips.
//   - When the gap is empty (user on the clock), survival = 1.0.
//   - Falls back to ADP-bucket pcts when the player is not in the
//     ranked-position pool (defensive default).
function survivalProbabilityFromOpponents(args: {
  player: AvailablePlayer;
  available: AvailablePlayer[];
  gap: OpponentGapAnalysis;
}): number | null {
  const { player, available, gap } = args;
  const pos = normalizePos(player.position);
  if (!pos || !["QB", "RB", "WR", "TE"].includes(pos)) return null;
  if (gap.opponents.length === 0) return 1.0;

  const atPos = available.filter((p) => normalizePos(p.position) === pos);
  const rankIdx = atPos.findIndex((p) => p.id === player.id);
  if (rankIdx < 0) return null;
  const playerRankShare = withinPositionRankShare(rankIdx);

  let pSurvives = 1.0;
  for (const opp of gap.opponents) {
    const positionDemand = opp.position_demand[pos] ?? 0;
    const pTakeOnSinglePick = positionDemand * playerRankShare;
    if (pTakeOnSinglePick <= 0) continue;
    for (let i = 0; i < opp.pick_nos.length; i++) {
      pSurvives *= 1 - pTakeOnSinglePick;
    }
  }
  return Math.max(0.02, Math.min(0.98, pSurvives));
}

// Combined survival pct: opponent-game-theory math first, ADP-bucket
// fallback when opponent math is unavailable (player not ranked at
// position, no skill position, etc).
function survivalPctFor(args: {
  player: AvailablePlayer;
  availability: Availability | null;
  signal: CandidateOpponentSignal | null;
  available: AvailablePlayer[];
  gap: OpponentGapAnalysis;
}): number | null {
  const oppPct = survivalProbabilityFromOpponents({
    player: args.player,
    available: args.available,
    gap: args.gap,
  });
  if (oppPct != null) return Math.round(oppPct * 100);

  // Fallback: ADP bucket + signal nudge (legacy path for non-skill
  // positions and edge cases).
  if (args.availability == null) return null;
  let base =
    args.availability === "likely_here" ? 90 :
    args.availability === "coin_flip" ? 50 : 15;
  if (args.signal && args.signal.direction === "fades") base += 5;
  if (args.signal && args.signal.direction === "amplifies") base -= 5;
  return Math.max(5, Math.min(95, base));
}

// Re-classify availability bucket from the survival probability.
// Keeps the bucket label consistent with the badge percentage so
// "fragile-to-gone" never appears next to "70%".
function availabilityFromPct(pct: number | null): Availability | null {
  if (pct == null) return null;
  if (pct >= 75) return "likely_here";
  if (pct >= 30) return "coin_flip";
  return "probably_gone";
}

export type SurvivalReadout = {
  pct: number;
  ci_low: number;
  ci_high: number;
  to_pick_no: number;
};

export type SurvivalResolver = (
  player: AvailablePlayer,
) => SurvivalReadout | null;

// Demand-sensitivity band: re-run the opponent survival math with the
// per-opponent position demand scaled +/- 25%. An honest CI (a stated
// modeling-input sensitivity), not a fabricated stat. Lower demand
// means higher survival and vice versa.
function scaleGapDemand(
  gap: OpponentGapAnalysis,
  factor: number,
): OpponentGapAnalysis {
  return {
    ...gap,
    opponents: gap.opponents.map((o) => {
      const scaled: Record<Position, number> = { ...o.position_demand };
      for (const k of Object.keys(scaled) as Position[]) {
        scaled[k] = Math.min(1, Math.max(0, scaled[k] * factor));
      }
      return { ...o, position_demand: scaled };
    }),
  };
}

/**
 * Build a reusable survival resolver for a snapshot + available pool.
 * Play detection consumes this to attach per-partner survival (the
 * canonical `survivalPctFor` math) so neither the per-pick decision
 * path nor the hub roster-suggestion path ships a hardcoded
 * "next N picks" window. Returns null for any player when there is no
 * live contested gap to compute survival across (no upcoming pick).
 *
 * CANONICAL_SOURCES.md "Play urgency (per-partner survival rolled up)".
 */
export function buildSurvivalResolver(
  snap: LeagueSnapshot,
  available: AvailablePlayer[],
): SurvivalResolver {
  const schedule = snap.draft.my_pick_schedule ?? [];
  if (schedule.length === 0) return () => null;

  const window = computeSurvivalWindow(snap, schedule);
  if (!window || window.target_pick_no <= 0) return () => null;

  const gap = analyzeOpponentsInGap({
    snap,
    fromPickNo: window.from_pick_no,
    toPickNo: window.to_pick_no,
  });
  const gapLessDemand = scaleGapDemand(gap, 0.75);
  const gapMoreDemand = scaleGapDemand(gap, 1.25);

  return (player: AvailablePlayer): SurvivalReadout | null => {
    const oppRaw = survivalProbabilityFromOpponents({ player, available, gap });
    if (oppRaw != null) {
      const pct = Math.round(oppRaw * 100);
      const hi = survivalProbabilityFromOpponents({
        player,
        available,
        gap: gapLessDemand,
      });
      const lo = survivalProbabilityFromOpponents({
        player,
        available,
        gap: gapMoreDemand,
      });
      const ci_high = hi != null ? Math.max(pct, Math.round(hi * 100)) : pct;
      const ci_low = lo != null ? Math.min(pct, Math.round(lo * 100)) : pct;
      return { pct, ci_low, ci_high, to_pick_no: window.target_pick_no };
    }

    // Fallback (non-skill / unranked): point estimate, no band claimed.
    const pct = survivalPctFor({
      player,
      availability: availabilityAt(player, window.target_pick_no),
      signal: null,
      available,
      gap,
    });
    if (pct == null) return null;
    return { pct, ci_low: pct, ci_high: pct, to_pick_no: window.target_pick_no };
  };
}

/**
 * Per-candidate age-curve component in signed [-1, +1] space. Positive
 * for young end of position's peak; negative for past-peak. Matches
 * the curve used on the public /rankings page so the same dial moves
 * the same direction across surfaces.
 */
function ageCurveSignedFor(
  position: Position,
  age: number | null,
): number {
  if (age == null) return 0;
  switch (position) {
    case "RB":
      if (age <= 22) return 1;
      if (age <= 24) return 0.7;
      if (age <= 26) return 0.3;
      if (age <= 28) return -0.2;
      if (age <= 30) return -0.7;
      return -1;
    case "WR":
      if (age <= 23) return 1;
      if (age <= 25) return 0.7;
      if (age <= 28) return 0.2;
      if (age <= 30) return -0.2;
      if (age <= 32) return -0.7;
      return -1;
    case "TE":
      if (age <= 24) return 1;
      if (age <= 26) return 0.5;
      if (age <= 29) return 0.1;
      if (age <= 31) return -0.4;
      return -1;
    case "QB":
      if (age <= 24) return 1;
      if (age <= 27) return 0.6;
      if (age <= 31) return 0.2;
      if (age <= 34) return -0.3;
      return -1;
    default:
      return 0;
  }
}

const DIAL_NOISE_FLOOR = 1.5; // contributions below this aren't surfaced

/**
 * Compute the additive score delta + per-dial influence list for a
 * candidate under the user's tuned dials. Pure function. Returns
 * { delta: 0, influences: [] } when dials are neutral so existing
 * eval fixtures (which don't pass dials) continue to produce
 * identical scores.
 *
 * Dial-to-rule wiring rationale:
 *   - youth_weight: scales the age-curve component for every candidate.
 *     Mirrors the /rankings page (same engine constant moved).
 *   - bellcow_pref: scales the workhorse-vs-committee read for RB
 *     candidates. Mirrors /rankings.
 *   - rookie_tilt: flat boost for is_rookie players, demote otherwise.
 *   - horizon: boosts push_path / future_stash when positive; boosts
 *     fill_starter rules when negative. The retired window-constraint
 *     penalty is replaced by an additive horizon term on the rules
 *     most-aligned with the direction.
 *
 * Continuity weight is intentionally not in this helper. The team-
 * signals calibration is mid-flight; we don't wire a dial that
 * doesn't do anything.
 */
function computeDialDeltas(args: {
  player: AvailablePlayer;
  position: Position;
  rule: DecisionRule;
  dials: SynthesisDials;
  /** Position rank within the available pool. 1-indexed; lower = better. */
  positionRank: number;
}): { delta: number; influences: DialInfluence[] } {
  const { player, position, rule, dials, positionRank } = args;
  const influences: DialInfluence[] = [];
  let delta = 0;

  function record(
    dial: DialInfluence["dial"],
    contribution: number,
    label: string,
  ) {
    if (Math.abs(contribution) < DIAL_NOISE_FLOOR) return;
    influences.push({
      dial,
      label,
      delta: Math.round(contribution * 10) / 10,
    });
    delta += contribution;
  }

  if (Math.abs(dials.youth) >= 5) {
    const y = ageCurveSignedFor(position, player.age ?? null);
    const c = (dials.youth / 100) * 18 * y;
    record(
      "youth_weight",
      c,
      `Youth ${dials.youth > 0 ? "+" : ""}${dials.youth}`,
    );
  }

  if (position === "RB" && Math.abs(dials.bellcow) >= 5) {
    // Bellcow proxy from positional rank in the available pool. Top-6
    // RBs at +1.0; tail at -1.0; mirrors the rankings-page heuristic.
    let b = 0;
    if (positionRank <= 6) b = 1;
    else if (positionRank <= 12) b = 0.5;
    else if (positionRank <= 18) b = 0.1;
    else if (positionRank <= 24) b = -0.3;
    else b = -1;
    const c = (dials.bellcow / 100) * 18 * b;
    record(
      "bellcow_pref",
      c,
      `Bellcow ${dials.bellcow > 0 ? "+" : ""}${dials.bellcow}`,
    );
  }

  if (Math.abs(dials.rookie) >= 10) {
    const isRookie = player.is_rookie === true;
    const sign = isRookie ? 1 : -0.4;
    const c = (dials.rookie / 100) * 14 * sign;
    record(
      "rookie_tilt",
      c,
      `Rookie tilt ${dials.rookie > 0 ? "+" : ""}${dials.rookie}`,
    );
  }

  if (Math.abs(dials.horizon) >= 10) {
    // Horizon weights the rule itself. Positive (future) lifts
    // push_path + future_stash; negative (win-now) lifts the
    // fill_starter family. earned_value + position_steal stay neutral
    // (they're not directional with respect to horizon).
    let direction = 0;
    if (rule === "push_path" || rule === "future_stash") direction = 1;
    else if (rule === "fill_starter_urgent" || rule === "fill_starter")
      direction = -1;
    if (direction !== 0) {
      const c = (dials.horizon / 100) * 12 * direction;
      record(
        "horizon",
        c,
        `Horizon ${dials.horizon > 0 ? "+" : ""}${dials.horizon}`,
      );
    }
  }

  // Sort influences by absolute magnitude so the dominant dial leads.
  influences.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { delta, influences };
}

function buildCandidates(
  snap: LeagueSnapshot,
  ranked: RankedArchetype[],
  available: AvailablePlayer[],
  nextUserPickNo: number,
  currentPickNo: number,
  gapAnalysis: OpponentGapAnalysis,
  dials: SynthesisDials,
): ScoredCandidate[] {
  const me = snap.rosters.find((r) => r.is_me);
  if (!me) return [];
  const candidates: ScoredCandidate[] = [];
  const seenIds = new Set<string>();

  // Declared-window constraint retired 2026-05-12 (lanes-as-declaration
  // architecture). buildCandidates now produces rule-scored candidates
  // without a window-aware penalty layer; lane-identity surfaces the
  // "fit" signal to the user separately. The user's tuned dials are
  // applied here additively (computeDialDeltas) so existing eval
  // fixtures with neutral dials produce identical scores.
  //
  // Precompute per-position rank in the available pool (1-indexed,
  // ordered by `available`'s native KTC-then-ADP cascade). Used by
  // the Bellcow dial so a top-12 RB consistently scores +1.0
  // regardless of which rule pushed him.
  const positionPoolRank = new Map<string, number>();
  {
    const counters: Partial<Record<Position, number>> = {};
    for (const p of available) {
      const pos = p.position as Position | null;
      if (!pos) continue;
      const next = (counters[pos] ?? 0) + 1;
      counters[pos] = next;
      positionPoolRank.set(p.id, next);
    }
  }
  const push = (
    raw: Omit<ScoredCandidate, "raw_score" | "score" | "constraint_note" | "dial_influences"> & {
      score: number;
    },
  ) => {
    if (seenIds.has(raw.player.id)) return;
    seenIds.add(raw.player.id);
    const dialResult = computeDialDeltas({
      player: raw.player,
      position: raw.position,
      rule: raw.rule,
      dials,
      positionRank: positionPoolRank.get(raw.player.id) ?? 999,
    });
    candidates.push({
      player: raw.player,
      position: raw.position,
      rule: raw.rule,
      primary_reason: raw.primary_reason,
      raw_score: raw.score,
      score: raw.score + dialResult.delta,
      constraint_note: null,
      dial_influences: dialResult.influences,
    });
  };

  // Rule 1: Fill-starter-hole, weighted by urgency.
  // Format-aware: super_flex counts as a QB hole in superflex.
  //
  // Window-aware selection (per audit 2026-04-25): with the
  // harmonized available ordering (KTC > ADP > heuristic), the top
  // player at a position may be a rookie whose KTC value is high
  // but who fits the user's declared window poorly. Without window
  // awareness, Rule 1 would push the top-by-KTC rookie at full
  // urgent score (100), the constraint penalty (40 for win-now)
  // would knock him to 60, and a vet who could have been the right
  // fill at score 100 (no penalty) wouldn't get a chance because
  // Rule 1 only pushes ONE candidate per position-hole.
  //
  // Fix: among the top 5 at position, pick the player whose POST-
  // PENALTY score is highest. In win-now, the penalty-free vet wins.
  // In future-build, the high-KTC rookie wins (low or zero penalty
  // under that window). Same code, window-correct outcome.
  const reqs = effectiveStarterReqs(snap);
  for (const pos of ["QB", "RB", "WR", "TE"] as Position[]) {
    if (reqs[pos] <= 0) continue;
    if (me.position_counts[pos] >= reqs[pos]) continue;
    const fillCandidates = topAtPos(available, pos, 5);
    if (fillCandidates.length === 0) continue;
    // Pick the top-by-position candidate weighted by survival. Window-
    // aware penalty layer retired 2026-05-12; rule scoring is now pure.
    let top: AvailablePlayer | null = null;
    let bestNetScore = -Infinity;
    for (const c of fillCandidates) {
      const cAvail = availabilityAt(c, nextUserPickNo);
      const baseScore = cAvail !== "likely_here" ? 100 : 60;
      if (baseScore > bestNetScore) {
        bestNetScore = baseScore;
        top = c;
      }
    }
    if (!top) continue;
    // Survival framing for the body text uses the SAME opponent-based
    // probability as the lane card badge. Single source of truth: the
    // text the user reads and the percentage they see come from one
    // computation. ADP gap is still used for narrative texture, but
    // the bucket label is derived from the survival pct.
    const survivalPct = survivalPctFor({
      player: top,
      availability: availabilityAt(top, nextUserPickNo),
      signal: opponentSignalForCandidate({ player: top, gap: gapAnalysis }),
      available,
      gap: gapAnalysis,
    });
    const availability = availabilityFromPct(survivalPct);
    const have = me.position_counts[pos];
    const need = reqs[pos];
    const adp = top.adp;
    // Two gaps with different semantics. gapToNext (adp vs next user
    // pick) drives "past your next slot" framing. gapToCurrent (adp vs
    // current pick) drives "past consensus" framing because consensus
    // is measured against the present moment, not the future. Bug
    // 2026-05-08: a single `gap` was conflated and produced "ADP 54 is
    // 11 picks past consensus" for a Judkins pick whose actual gap was
    // 2 picks. Coach correctly said "1 pick past consensus." Per
    // dynasty-bug-investigator triage, the body copy needs both gaps.
    const gapToNext =
      typeof adp === "number" ? Math.round(adp - nextUserPickNo) : null;
    const gapToCurrent =
      typeof adp === "number" ? Math.round(adp - currentPickNo) : null;
    const survival = (() => {
      if (availability == null || adp == null || gapToNext == null || gapToCurrent == null) {
        return "ADP unavailable; treat as fragile until you see him on the board.";
      }
      const adpRounded = Math.round(adp);
      const pastConsensus = Math.abs(gapToCurrent);
      const pctText = survivalPct != null ? ` (${survivalPct}% survives)` : "";
      if (availability === "likely_here") {
        if (gapToNext >= 0) {
          return `ADP ${adpRounded} puts him ${gapToNext} pick${gapToNext === 1 ? "" : "s"} past your next slot (${nextUserPickNo}). Gap opponents do not need this position; should still be there${pctText}.`;
        }
        return `ADP ${adpRounded} is ${pastConsensus} pick${pastConsensus === 1 ? "" : "s"} past consensus and gap opponents do not target his position; survival likely${pctText}.`;
      }
      if (availability === "coin_flip") {
        if (gapToNext >= 0) {
          return `ADP ${adpRounded} is at or near your next slot (${nextUserPickNo}). Coin flip whether he survives the gap${pctText}; not safe to skip without a backup.`;
        }
        return `ADP ${adpRounded} is ${pastConsensus} pick${pastConsensus === 1 ? "" : "s"} past consensus, but gap opponents target this position. Coin flip whether he survives${pctText}.`;
      }
      // probably_gone
      return `ADP ${adpRounded} is at-or-before your slot AND gap opponents target his position. Fragile-to-gone${pctText}.`;
    })();
    if (availability !== "likely_here") {
      // COIN_FLIP and PROBABLY_GONE both fire urgent-fill scoring.
      // The user can't safely wait if the player might be gone.
      //
      // Tiebreaker: when multiple positions all fire fill_starter_urgent
      // (e.g., user has both an empty RB slot and an empty TE slot),
      // a flat 100 used to leave the position iteration order
      // (QB,RB,WR,TE) as the only differentiator and stable sort would
      // pick RB regardless of relative value. Bug 2026-05-08: standing
      // call surfaced Judkins (RB, ADP 54, +2 past consensus, 35%
      // survives) over Warren (TE, ADP 35, +21 past consensus, 21%
      // survives) in a TE-premium SF league; user had to override via
      // Coach. Fix: incorporate adpGapModifier (same modifier
      // earned_value uses) so a player who is more extreme past ADP
      // ranks higher among fill_starter_urgent candidates. Adjustment
      // is bounded ±12 so the rule still dominates lower-priority
      // rules but no longer ignores the magnitude of the value drop.
      const adpUrgency = adpGapModifier(top.adp, currentPickNo).adjustment;
      push({
        player: top,
        position: pos,
        rule: "fill_starter_urgent",
        score: 100 + adpUrgency,
        primary_reason: `${top.name} is the best ${POSITION_LABEL[pos]} on the board and you're ${have}/${need} on starters. ${survival}`,
      });
    } else {
      // Same flat-score class as fill_starter_urgent above. Two
      // positions both firing fill_starter at score 60 would tie and
      // fall back to position iteration order. Use adpGapModifier so
      // a player past consensus outranks an at-ADP candidate within
      // the rule.
      const adpUrgency = adpGapModifier(top.adp, currentPickNo).adjustment;
      push({
        player: top,
        position: pos,
        rule: "fill_starter",
        score: 60 + adpUrgency,
        primary_reason: `Fills your ${POSITION_LABEL[pos]} starter hole (${have}/${need}). ${top.name} is the best available; ${survival.toLowerCase()}`,
      });
    }
  }

  // Rule 2: Push a path the user is currently in ACQUISITION phase on.
  // Skip paths in EXECUTE (drift = 100%, already maxed) since adding
  // more of that position doesn't advance strategy, just spends pick.
  for (const r of ranked.slice(0, 3)) {
    if (r.phase === "executing") continue;
    if (!r.top_candidates || r.top_candidates.length === 0) continue;
    for (const cand of r.top_candidates.slice(0, 2)) {
      const matching = available.find((p) => p.id === cand.player_id);
      if (!matching) continue;
      const pos = normalizePos(matching.position);
      if (!pos) continue;
      push({
        player: matching,
        position: pos,
        rule: "push_path",
        score: 50 + r.drift_score * 25,
        primary_reason: `Advances ${r.archetype.name} (${Math.round(r.drift_score * 100)}% drift, ${r.phase ?? "acquisition"} phase).`,
      });
    }
  }

  // Rule 3: Position-rank steal. Surfaces a top-3-at-position player
  // who has fallen significantly past their ADP. Catches the
  // value-falling moment that earned_value (top-8 OVERALL) misses
  // and that push_path (archetype-curated) doesn't model.
  //
  // Per user feedback 2026-04-25 (LaPorta scenario): a top-3 TE
  // available 14 picks past consensus is the kind of steal a sharp
  // dynasty pro spots immediately. Engine should surface it with the
  // reasoning so the user can decide whether to take it.
  //
  // RUNS BEFORE earned_value so the dedupe doesn't lock a steal at
  // earned_value's lower score and bump it out of the Top 3.
  //
  // Score: 80 for top-1-at-position, 75 for top-2, 70 for top-3.
  // Sits below fill_starter_urgent (100) so a real starter hole still
  // wins as the lean, but above push_path drift candidates so a steal
  // beats archetype-curated alternatives in the Top 3 ordering.
  // Rank by the harmonized `available` order (KTC > ADP > heuristic
  // dynasty_rank, applied at the hub-page layer). Top-3 at position
  // by harmonized ordering captures "best N at position by community
  // consensus." When one of those is available STEAL_GAP_PICKS past
  // their ADP, that's a value-falling steal worth surfacing.
  //
  // Threshold rationale: ~2 standard deviations of typical ADP
  // variance, which is slot-dependent. Tight thresholds at the top
  // of the draft (low variance) widen as drafts go deeper. A player
  // past their ADP by this much is materially past consensus, not
  // just normal noise.
  //
  // Score: 80 / 75 / 70 by position-rank. Sits below
  // fill_starter_urgent (100) so a real starter hole still wins as
  // the lean, but above push_path drift candidates so a value-
  // falling steal beats archetype-curated picks for #2 in Top 3.
  // Rule 4 (priority before position_steal + earned_value): future_stash.
  // Fires when ALL of QB / RB / WR / TE return a saturation penalty.
  // Surfaces young / rookie candidates at score 50 BEFORE position_steal
  // can claim the same young player at saturated cap (~38). Founder
  // bug 2026-04-27: this block previously ran AFTER position_steal,
  // and `push()` first-wins dedup meant Mason Taylor (TE age 21) got
  // claimed by position_steal at 38 before future_stash could bid 50.
  // Schultz (TE age 29) won the lean at saturated cap 34 vs Mason
  // Taylor's saturated cap 38 by stable-sort order. Moving future_stash
  // up the rule order means it claims young players first; saturated
  // older fallers go to position_steal afterwards as intended.
  //
  // Triggers when ALL of QB / RB / WR / TE return a saturation
  // penalty for the user's current roster. Surfaces the top young-
  // or-rookie candidate in the harmonized pool. Score 50 is chosen
  // to beat saturated position_steal (capped 34-38) and saturated
  // earned_value (15 - i*1.5), while losing to any unsaturated
  // fill_starter (60+) or fill_starter_urgent (100). So the rule is
  // a fall-through: only fires when nothing else has work to do.
  const allSaturated = (["QB", "RB", "WR", "TE"] as Position[]).every(
    (pos) => positionSaturationModifier(snap, pos).penalty > 0,
  );
  if (allSaturated) {
    const stashPool = available
      .filter((p) => {
        const pos = normalizePos(p.position);
        if (!pos || pos === "K" || pos === "DST") return false;
        if (p.is_rookie) return true;
        return p.age != null && p.age <= 23;
      })
      .slice(0, 5);
    for (let i = 0; i < stashPool.length; i++) {
      const p = stashPool[i];
      const pos = normalizePos(p.position)!;
      const ageFrame = p.is_rookie
        ? "incoming rookie"
        : `age ${p.age}`;
      push({
        player: p,
        position: pos,
        rule: "future_stash",
        score: 50 - i * 2,
        primary_reason: `Every starter slot is filled; surfacing future upside instead. ${p.name} (${ageFrame}, KTC #${p.search_rank}) is the top young/rookie stash on the board. Bench depth that can become a starter or trade asset.`,
      });
    }
  }

  const STEAL_GAP_PICKS =
    currentPickNo <= 24 ? 5 : currentPickNo <= 100 ? 10 : 15;
  for (const pos of ["QB", "RB", "WR", "TE"] as Position[]) {
    if (reqs[pos] <= 0) continue;
    // `available` is already harmonized at the hub-page layer
    // (KTC-first cascade), so slice(0, 3) of the position filter is
    // top-3 at position by community consensus.
    const top3 = available
      .filter((q) => normalizePos(q.position) === pos)
      .slice(0, 3);
    for (let i = 0; i < top3.length; i++) {
      const p = top3[i];
      if (seenIds.has(p.id)) continue;
      if (p.adp == null) continue;
      const gap = currentPickNo - p.adp;
      if (gap < STEAL_GAP_PICKS) continue;
      const positionRank = i + 1;
      const positionLabelOrdinal =
        positionRank === 1
          ? "best"
          : positionRank === 2
            ? "second-best"
            : "third-best";
      const sat = positionSaturationModifier(snap, pos);
      const reasonParts = [
        `${p.name} is the ${positionLabelOrdinal} ${POSITION_LABEL[pos]} on the board (ADP ${Math.round(p.adp)}). He fell ${Math.round(gap)} picks past consensus, so the market reached past him; rare to grab this profile this late.`,
      ];
      if (sat.note) reasonParts.push(sat.note);
      // SATURATION CAP (2026-04-27): a saturated position_steal cannot
      // win the lean over a non-saturated earned_value candidate.
      // Without this cap, a top-of-position TE steal scored 85 - 5 -
      // 30 = 50 and beat earned_value WRs at index 3+ (45 - 4.5 =
      // 40.5), pushing the engine to recommend a 3rd TE in a
      // 1-hard-TE format with the user's WR depth gap unfilled.
      // Mirrors the earned_value sat-gate in fb61c39.
      const baseScore = 85 - positionRank * 5;
      const stealScore =
        sat.penalty >= 30
          ? Math.min(baseScore - sat.penalty, 40 - positionRank * 2)
          : baseScore - sat.penalty;
      push({
        player: p,
        position: pos,
        rule: "position_steal",
        score: stealScore,
        primary_reason: reasonParts.join(" "),
      });
    }
  }

  // Rule 4: Earned value. Consider top 8 by dynasty rank so the window
  // constraint has real alternatives to penalize toward. If the #1
  // earned-value player is a rookie under heavy-win-now, the #2 / #3
  // (proven vet in the ideal age band) can win after penalty. Scores
  // decay gently with rank so the #1 pick still wins absent a constraint.
  //
  // ROSTER FIT (2026-04-26): apply position saturation penalty so the
  // engine doesn't recommend a 3rd-at-position when the user's flex
  // EV at that position has run out. Rule 1 (fill_starter) only catches
  // HARD slot holes; this rule covers flex-eligible position fit.
  // Without it, a TE at top-of-pool KTC value won the lean for a user
  // already 2-deep at TE in a 1-hard-TE PPR SF league.
  // Window widened from 8 to 15 (2026-04-26): WRs with weaker Sleeper
  // search_rank but real KTC value (Khalil Shakir incident) fell
  // outside the top-8 dynasty_rank window and never entered scoring,
  // leaving the user with TE-heavy candidates despite a clear WR hole.
  // Score decay (45 - i * 1.5) keeps top-of-pool advantage intact.
  for (let i = 0; i < Math.min(available.length, 15); i++) {
    const p = available[i];
    const pos = normalizePos(p.position);
    if (!pos) continue;
    const sat = positionSaturationModifier(snap, pos);
    // ADP-gap bonus is gated on position fit. A saturated position
    // (TE3, RB4) shouldn't earn a "market discount" bonus, because the
    // discount only matters if the player can crack your lineup. Bug
    // 2026-04-26: Mason Taylor TE3 ADP +32 cancelled an 18-point sat
    // penalty and won the lean despite the founder having a real WR
    // hole and the engine's own guards firing on the TE pick.
    const adpGap = sat.penalty > 0
      ? { adjustment: 0, note: null }
      : adpGapModifier(p.adp, currentPickNo);
    const reasonParts = [
      `Dynasty value on the board (${p.name}, rank #${p.search_rank}).`,
    ];
    if (adpGap.note) reasonParts.push(adpGap.note);
    if (sat.note) reasonParts.push(sat.note);
    push({
      player: p,
      position: pos,
      rule: "earned_value",
      score: 45 - i * 1.5 - sat.penalty + adpGap.adjustment,
      primary_reason: reasonParts.join(" "),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

// Build the "what would you be skipping?" lines. For each top runner-up,
// explain whether it's safe to punt (likely survives) or a real loss.
function buildTradeoff(
  winner: ScoredCandidate,
  runners: ScoredCandidate[],
  nextUserPickNo: number,
): { gains: string[]; losses: string[] } {
  const gains: string[] = [];
  const losses: string[] = [];

  switch (winner.rule) {
    case "fill_starter_urgent":
      gains.push(
        `Locks starter ${POSITION_LABEL[winner.position]} before the scarcity gap.`,
      );
      break;
    case "fill_starter":
      gains.push(
        `Fills ${POSITION_LABEL[winner.position]} starter hole while options are still here.`,
      );
      break;
    case "push_path":
      gains.push(`Advances your leading path, not just filling need.`);
      break;
    case "earned_value":
      gains.push(
        `Max dynasty value on the board regardless of position.`,
      );
      break;
    case "future_stash":
      gains.push(
        `Every starter slot is locked. Stash future upside while saturated assets sit at ceiling.`,
      );
      break;
    default:
      break;
  }

  for (const r of runners.slice(0, 2)) {
    if (r.player.id === winner.player.id) continue;
    const availability = availabilityAt(r.player, nextUserPickNo);
    const survivalReason =
      availability === "likely_here"
        ? `likely here next pick, can wait`
        : availability === "coin_flip"
          ? `coin flip at next pick, not safe to skip without a backup`
          : availability === "probably_gone"
            ? `probably gone by next pick`
            : `ADP unknown, unclear if survives`;
    const constraintReason = r.constraint_note
      ? ` · ${r.constraint_note.replace(/\.$/, "")}`
      : "";
    losses.push(
      `${r.player.name} (${POSITION_LABEL[r.position]}, ${r.rule.replace(/_/g, " ")}): ${survivalReason}${constraintReason}.`,
    );
  }

  return { gains, losses };
}

// Project what's likely to be around at the user's next 5 picks.
// Simple model: for each future pick, estimate the pool by removing
// players whose ADP puts them well before that pick. Then apply the
// same hole/path/value logic to pick a target.
//
// Cap at 5 chosen as 3 (the original) + 2 per user 2026-04-24
// ("wish it went 2 more picks down"), bounded by the
// assumption-auditor finding that top-6 pool stability collapses
// past pick 7. Anything past the 4th projected slot is labeled
// "directional" so the user sees the honesty band.
const MAX_NEXT_PICKS = 5;

function buildNextPicksPlan(
  snap: LeagueSnapshot,
  available: AvailablePlayer[],
  schedule: PickScheduleEntry[],
  // The lean for the CURRENT pick. Pre-incrementing simulated counts
  // for the lean's position keeps the future-pick narrative consistent:
  // if the lean is QB, the plan should not also recommend QB at the
  // very next slot under "fill QB hole (1/2)" framing. Without this,
  // a SF league with 1 QB on roster gets QB-leaned at 5.11 AND
  // QB-leaned at 6.2 with the same "1/2" label.
  leanPosition: Position | null,
  leanPlayerId: string | null,
): NextPickPlanItem[] {
  if (schedule.length <= 1) return [];
  const me = snap.rosters.find((r) => r.is_me);
  if (!me) return [];
  // Format-aware: super_flex counts as a QB hole in superflex so the
  // plan recommends a 2nd QB before falling through to depth.
  const reqs = effectiveStarterReqs(snap);

  // Simulate hole-fills as the user makes picks. For each future pick,
  // optimistically treat the hole as filled if the plan recommends
  // that position, so subsequent picks move to the next hole or value.
  // Seed with the lean's position so the chain reads consistently.
  const simulated: Record<Position, number> = { ...me.position_counts };
  if (leanPosition) simulated[leanPosition] = (simulated[leanPosition] ?? 0) + 1;

  // Track players projected to be taken at PRIOR future slots so
  // subsequent slots see them removed from the pool. Without this the
  // plan repeats the same top-2 names at every slot (founder report
  // 2026-05-19: Sadiq + Cooper appeared at 11.5, 12.2, 12.8, 13.5, 14.8).
  // Seed with the lean's player id so slot 1 doesn't suggest the lean.
  const projectedTaken = new Set<string>();
  if (leanPlayerId) projectedTaken.add(leanPlayerId);

  // Pre-filter the pool by survival to the user's FIRST upcoming pick
  // (the lane decision). Without this, the per-slot incremental gap
  // math reads "likely here" at slot 12.2 for a player who is already
  // probably_gone before the user even reaches their first pick at
  // 10.8. The integrity check (runAvailabilityCoherenceCheck) then
  // correctly fires AVAILABILITY_INCOHERENT (Higgins bug class).
  // Founder report 2026-05-19: KC Concepcion flagged "probably gone 2%"
  // in the Future lane at 10.8 but recommended in Next Picks Plan at
  // 12.2. Cumulative survival from LIVE through 12.2 was effectively
  // zero, but the engine only measured the short 11.5 -> 12.2 hop.
  const initialWindow = computeSurvivalWindow(snap, schedule);
  const initialGap = analyzeOpponentsInGap({
    snap,
    fromPickNo: initialWindow.from_pick_no,
    toPickNo: initialWindow.to_pick_no,
  });
  const firstPickNo = schedule[0].pick_no;
  const realisticAvailable = available.filter((p) => {
    const baseAvail = availabilityAt(p, firstPickNo);
    const pct = survivalPctFor({
      player: p,
      availability: baseAvail,
      signal: null,
      available,
      gap: initialGap,
    });
    const adjusted = availabilityFromPct(pct);
    if (adjusted == null) return true;
    return adjusted !== "probably_gone";
  });

  const futures = schedule.slice(1, 1 + MAX_NEXT_PICKS);
  const items: NextPickPlanItem[] = [];
  for (let idx = 0; idx < futures.length; idx++) {
    const future = futures[idx];
    // Per-slot gap analysis: the survival window for this future slot
    // is "between the previous user pick and THIS user pick." Reusing
    // the current-pick gap across all future slots (the prior behavior)
    // applied the wrong demand pattern far out from the call. Each
    // slot now computes its own opponent window.
    const slotFromPickNo =
      idx === 0 ? schedule[0].pick_no : futures[idx - 1].pick_no;
    const slotGapAnalysis = analyzeOpponentsInGap({
      snap,
      fromPickNo: slotFromPickNo,
      toPickNo: future.pick_no,
    });

    // Bind to the SAME canonical availability classifier the Top 3
    // card uses (survivalPctFor → availabilityFromPct), not the raw
    // ADP-gap heuristic. Per CANONICAL_SOURCES.md anti-pattern 2.
    // Operates on realisticAvailable (already pre-filtered above by
    // survival to user's first pick) so the per-slot incremental
    // survival math is consistent with the lane decision's view.
    const survivor = (p: AvailablePlayer): boolean => {
      if (projectedTaken.has(p.id)) return false;
      const baseAvail = availabilityAt(p, future.pick_no);
      const survivalPct = survivalPctFor({
        player: p,
        availability: baseAvail,
        signal: null,
        available: realisticAvailable,
        gap: slotGapAnalysis,
      });
      const adjusted = availabilityFromPct(survivalPct);
      if (adjusted == null) return true;
      return adjusted !== "probably_gone";
    };
    const pool = realisticAvailable.filter(survivor);

    let targetPos: Position | "any" = "any";
    let names: string[] = [];
    let primaryIds = new Set<string>();
    let reason = "";
    let isFillingHole = false;
    for (const pos of ["QB", "RB", "WR", "TE"] as Position[]) {
      if (reqs[pos] <= 0) continue;
      if (simulated[pos] >= reqs[pos]) continue;
      const top2 = topAtPos(pool, pos, 2);
      if (top2.length === 0) continue;
      targetPos = pos;
      names = top2.map((p) => p.name);
      primaryIds = new Set(top2.map((p) => p.id));
      reason = `Fill ${POSITION_LABEL[pos]} hole (${simulated[pos]}/${reqs[pos]}).`;
      simulated[pos] += 1;
      isFillingHole = true;
      break;
    }
    if (targetPos === "any") {
      // Apply the same position-saturation penalty here so the plan
      // doesn't recommend a 3rd-at-position when the user's flex EV
      // at that position is gone. Re-rank the pool by (rank-implied
      // base score) - saturation_penalty and pick the top 2.
      const ranked = pool
        .map((p, i) => {
          const pos = normalizePos(p.position);
          const sat = pos
            ? positionSaturationModifier(snap, pos)
            : { penalty: 0, note: null };
          return { p, pos, base: 45 - i * 1.5, score: 45 - i * 1.5 - sat.penalty };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      const top = ranked.slice(0, 2).map((x) => x.p);
      if (top.length === 0) continue;
      names = top.map((p) => p.name);
      primaryIds = new Set(top.map((p) => p.id));
      // earned_value labels honestly: if the top 2 span positions,
      // call it "best on board" rather than "RB depth" with a WR in
      // the names. Fixes a misleading-label bug per user 2026-04-25.
      const positions = top.map((p) => normalizePos(p.position)).filter(Boolean);
      const allSamePos = positions.every((p) => p === positions[0]);
      const headPos = positions[0];
      targetPos = allSamePos && headPos ? headPos : "any";
      reason = allSamePos && headPos
        ? `Earned value, ${POSITION_LABEL[headPos]} depth.`
        : `Earned value, best on board.`;
    }

    // Alternates surface the user's fallback shape if the primary
    // gets sniped. When filling a hole, prefer same-position fallbacks
    // (the user wants the next WR if WR primary is gone, not three
    // RBs) and only spill cross-lane after we exhaust same-position
    // depth. In earned_value mode, just take the next-best by overall
    // rank since position isn't the lane anyway.
    let alternates: Array<{ name: string; position: string | null }>;
    if (isFillingHole && targetPos !== "any") {
      const samePos = topAtPos(pool, targetPos as Position, 5)
        .filter((p) => !primaryIds.has(p.id))
        .slice(0, 2);
      const samePosIds = new Set(samePos.map((p) => p.id));
      const crossLane = pool
        .filter((p) => !primaryIds.has(p.id) && !samePosIds.has(p.id))
        .slice(0, Math.max(0, 3 - samePos.length));
      alternates = [...samePos, ...crossLane].map((p) => ({
        name: p.name,
        position: p.position,
      }));
    } else {
      alternates = pool
        .filter((p) => !primaryIds.has(p.id))
        .slice(0, 3)
        .map((p) => ({ name: p.name, position: p.position }));
    }

    // High = next user pick, medium = one after, directional = beyond
    // that. Slot-distance buckets (rather than ADP-survival) because
    // the unknown that compounds is roster state at future picks, not
    // just player availability. Folded in from the deleted multi-pick
    // rollout's confidence vocabulary.
    const confidence: "high" | "medium" | "directional" =
      idx === 0 ? "high" : idx === 1 ? "medium" : "directional";

    // Specificity degradation: past slot 2 ahead, named player
    // predictions are noise. Slot 0 + 1 keep named recommendations
    // (high / medium confidence). Slot 2+ pivots to positional /
    // profile language because the compounding uncertainty of roster
    // state + opponent contention makes specific names unreliable
    // four picks out. Founder direction 2026-05-19: "perhaps these
    // need to be as much positional as named players."
    const displayNames = idx >= 2 ? [] : names;
    const displayReason =
      idx >= 2
        ? targetPos === "any"
          ? "Earned value, best on board."
          : isFillingHole
            ? `Best available ${POSITION_LABEL[targetPos as Position]} (starter need).`
            : `Best available ${POSITION_LABEL[targetPos as Position]} (earned value).`
        : reason;
    const displayAlternates = idx >= 2 ? [] : alternates;

    // Record this slot's projected picks so subsequent slots see them
    // gone from the pool. Without this, the same top-2 keeps winning
    // at every slot.
    for (const id of primaryIds) projectedTaken.add(id);

    items.push({
      pick_label: future.pick_label,
      pick_no: future.pick_no,
      density: future.density_kind,
      target_position: targetPos,
      target_names: displayNames,
      reason: displayReason,
      confidence,
      alternates: displayAlternates,
    });
  }
  return items;
}

/**
 * Counter-view detector: tier-cliff at OTHER positions the lean ignored.
 *
 * Per cross-panel decision framework (gambler + dynasty pro voices,
 * 2026-04-24): positional scarcity overrides starter-fill cluster math
 * when the next-tier-down player at a starter-required position is
 * unlikely to survive to the user's next slot. The pure starter-fill
 * winner (Pickens at 4.2 in The Final Countdown) ignored a parallel
 * QB cliff (only 3 QB1s left, 20 picks to user's next slot). The
 * Coach raised this; Decision Card should surface it BEFORE Coach is
 * asked.
 *
 * v1 detector (deterministic, no Monte Carlo yet):
 *   - Position P is a starter requirement in the league format
 *   - User has 0 of P on roster (named anchors confirm this)
 *   - <= COUNTER_TIER_CAP players of P remain with ADP < user's next pick
 *   - Winner is NOT P (otherwise the lean is already P)
 *
 * Format-specific tier sizes from auditor framework:
 *   1QB startup: QB1 tier ≈ top-12; cliff at QB6-QB13
 *   Superflex:   QB1 cliff at picks 12-24, QB2 by 60-72
 *
 * v2 wires the Monte Carlo P(available) from MultiPickCard. v1 ships
 * the detector with deterministic ADP-survival counting; sufficient
 * to catch the Pickens/Mendoza failure pattern.
 */
const COUNTER_TIER_CAP = 4;

function buildCounterView(
  winner: ScoredCandidate,
  available: AvailablePlayer[],
  snap: LeagueSnapshot,
  nextUserPickNo: number,
): Decision["counter_view"] {
  const me = snap.rosters.find((r) => r.is_me);
  if (!me) return null;
  const isSuperflex = snap.format === "superflex" || snap.format === "2qb";
  const winnerPos = normalizePos(winner.player.position);
  // Format-aware starter requirements. In SF, having 1 QB still leaves
  // a starter hole (super_flex slot wants a 2nd QB), so the cliff
  // detector must compare against effective requirements, not raw
  // hard counts. Without this the QB cliff is suppressed for any
  // 1-QB-on-roster team in SF, even with 15 of 24 QBs gone.
  const reqs = effectiveStarterReqs(snap);
  // Starter-required positions worth checking. K and DST are excluded
  // (rarely cliff-shaped in dynasty; format gating handled elsewhere).
  const candidates: Position[] = isSuperflex
    ? ["QB", "RB", "WR", "TE"]
    : ["RB", "WR", "QB", "TE"];
  for (const pos of candidates) {
    if (pos === winnerPos) continue;
    const have = me.position_counts[pos] ?? 0;
    if (have >= reqs[pos]) continue; // already at starter floor; not a cliff
    // Use the same availability classifier as the rest of the engine
    // so the cliff narrative matches the survival badges. Endangered =
    // probably_gone OR coin_flip; both are at-risk before next pick.
    const endangered = available.filter((p) => {
      if (normalizePos(p.position) !== pos) return false;
      const a = availabilityAt(p, nextUserPickNo);
      return a === "probably_gone" || a === "coin_flip";
    });
    if (endangered.length === 0) continue;
    if (endangered.length > COUNTER_TIER_CAP) continue;
    endangered.sort((a, b) => (a.adp ?? 999) - (b.adp ?? 999));
    const top = endangered[0];
    const headline = `${POSITION_LABEL[pos]} cliff: ${endangered.length} starter-grade ${pos} at risk before your next pick.`;
    const detail =
      `${top.name} (ADP ${Math.round(top.adp ?? 0)}) is the best of the at-risk ${pos} group. ` +
      `If you take ${winner.player.name} here, every viable ${pos} starter is fragile or gone by pick ${nextUserPickNo}; ` +
      `you'll be the last one needing the position.`;
    return {
      kind: "tier_cliff",
      headline,
      detail,
      suggested_player: top.name,
    };
  }
  return null;
}

function buildScarcityCallout(
  winner: ScoredCandidate,
  available: AvailablePlayer[],
  nextUserPickNo: number,
): string | null {
  if (winner.rule !== "fill_starter_urgent" && winner.rule !== "fill_starter") {
    return null;
  }
  const atPos = topAtPos(available, winner.position, 3);
  if (atPos.length <= 1) {
    return `${POSITION_LABEL[winner.position]} tier is empty after ${winner.player.name}. No viable alternative before your next pick.`;
  }
  const nextViable = atPos[1];
  if (nextViable.adp == null) return null;
  const gap = nextViable.adp - nextUserPickNo;
  if (gap > 20) {
    return `If you skip, next ${POSITION_LABEL[winner.position]} worth starting is ${nextViable.name} (ADP ${Math.round(nextViable.adp)}). That's ~${Math.round(gap)} picks past your next slot.`;
  }
  return null;
}

function buildEmergencyTradeUp(
  winner: ScoredCandidate,
  current: PickScheduleEntry,
  picksUntilMe: number,
): Decision["emergency_trade_up"] {
  if (winner.rule !== "fill_starter_urgent") return null;
  if (picksUntilMe <= 0) return null;
  if (winner.player.adp == null) return null;
  // Slots between the player's ADP and the user's CURRENT pick. Positive
  // means ADP is BEFORE the user's pick (player goes earlier than user
  // picks); negative means ADP is AFTER the user's pick (player would
  // still be there if everyone behaved normally).
  const slotsAhead = current.pick_no - winner.player.adp;
  // Trade-up is only realistic in a NARROW window. Outside this window:
  //   slotsAhead <= 0  → player is at or after user's slot. No trade-up
  //                      needed; just take him.
  //   slotsAhead 1-5   → small swap up could lock him. Banner fires.
  //   slotsAhead > 5   → player is "buy a top-N pick" away. Multi-pick
  //                      capital required, which is a Coach-level
  //                      negotiation, not a one-line banner. The fact
  //                      that he's still in the available pool despite
  //                      ADP suggests the league reached less than
  //                      expected; he may simply still be there.
  // Per dynasty-bug-investigator 2026-04-23 (was firing on 17-slot gaps
  // with hardcoded "1-2 slots" copy that contradicted the Coach).
  const TRADE_UP_MIN_SLOTS = 1;
  const TRADE_UP_MAX_SLOTS = 5;
  if (slotsAhead < TRADE_UP_MIN_SLOTS || slotsAhead > TRADE_UP_MAX_SLOTS) {
    return null;
  }
  const slotsRounded = Math.max(1, Math.round(slotsAhead));
  const slotWord = slotsRounded === 1 ? "1 slot" : `${slotsRounded} slots`;
  return {
    reasoning: `${winner.player.name} (ADP ${Math.round(winner.player.adp)}) goes ~${slotsRounded} pick${slotsRounded === 1 ? "" : "s"} before your ${current.pick_label}. Real risk he's gone; trading up ${slotWord} locks him.`,
    target_picks: [],
  };
}

export function synthesizeDecision(args: {
  snap: LeagueSnapshot;
  ranked: RankedArchetype[];
  available: AvailablePlayer[];
  windows: WindowsResult;
  picks_until_me: number;
  // FantasyCalc-sourced KTC-equivalent values, normalized 0-100 by
  // top-3 average. Optional; empty record is fine and just leaves
  // candidate.value = null on every card. Already loaded by the
  // hub for Strategic Forks; we plumb the same map in.
  player_values?: Record<string, number>;
  // KTC overall rank per player (lower = better). Optional; surfaced
  // on Top 3 cards alongside ADP so the user sees both signals when
  // they diverge. Drives the trust-hierarchy callout in WHY THIS LEAN.
  ktc_overall_ranks?: Record<string, number>;
  // User's tuned doctrine from the Rankings Lab. Optional; defaults
  // to neutral (no effect on scoring) so existing eval fixtures pass
  // unchanged. When dials are non-default, each candidate gets a
  // `dial_influences` list naming which dial(s) nudged its score and
  // by how much.
  dials?: SynthesisDials;
}): Decision | null {
  const {
    snap,
    ranked,
    available,
    windows,
    picks_until_me,
    player_values: playerValues = {},
    ktc_overall_ranks: ktcOverallRanks = {},
    dials = NEUTRAL_SYNTHESIS_DIALS,
  } = args;
  const schedule = snap.draft.my_pick_schedule;
  if (schedule.length === 0) return null;
  if (available.length === 0) return null;

  const current = schedule[0];

  // Survival window: pre-turn walks live → user's first pick; at-turn
  // walks user's first pick → next contested slot (skipping back-to-
  // back). target_pick_no replaces the old `nextUserPickNo` as the
  // anchor for "what slot are we computing survival to."
  const survivalWindow = computeSurvivalWindow(snap, schedule);
  const nextUserPickNo = survivalWindow.target_pick_no;

  // Game-theory layer: identify gap-fillers + their position needs.
  // Drives the per-candidate opponent_signal and the OPPONENT BETWEEN
  // PICKS line at the top of the card. Computed once and passed
  // wherever availability is computed.
  const gapAnalysis = analyzeOpponentsInGap({
    snap,
    fromPickNo: survivalWindow.from_pick_no,
    toPickNo: survivalWindow.to_pick_no,
  });

  // Build trajectory for behavioral read on the user's actual picks
  // so far (lane-direction emerges from picks, not from a declared
  // window). Declared-window-driven constraint retired 2026-05-12.
  const trajectoryReadout = buildTrajectory(snap);

  const candidates = buildCandidates(
    snap,
    ranked,
    available,
    nextUserPickNo,
    current.pick_no,
    gapAnalysis,
    dials,
  );
  if (candidates.length === 0) return null;

  // Survival-weighted scoring. Pre-turn the user can't act on an
  // unreachable player; multiplying score by P(survives to user's
  // pick) formalizes "expected gain from recommending this pick" and
  // prevents unreachable high-EV players from winning THE CALL.
  // Founder report 2026-05-19: Skattebo +12.6 EV at "probably gone 2%"
  // beat DJ Moore +6.2 at "coin flip 48%" because the score didn't
  // account for the user's reach. At-turn semantics are different
  // (every available player is reachable now; survival there asks
  // "if you pass, will they survive" which is a different decision),
  // so the weighting is gated on pre_turn.
  //
  // Capture pre-weighting scores so we can surface the would-be lead
  // as a trade-up consideration if a high-EV unreachable player got
  // demoted.
  const rawScoresById = new Map<string, number>();
  for (const c of candidates) rawScoresById.set(c.player.id, c.score);
  let tradeUpConsideration: Decision["trade_up_consideration"] = null;

  if (survivalWindow.kind === "pre_turn") {
    for (const c of candidates) {
      const survPctRaw = survivalPctFor({
        player: c.player,
        availability: availabilityAt(c.player, nextUserPickNo),
        signal: null,
        available,
        gap: gapAnalysis,
      });
      if (survPctRaw != null) {
        c.score = c.score * (survPctRaw / 100);
      }
    }
    candidates.sort((a, b) => b.score - a.score);
  }

  const winner = candidates[0];
  const runners = candidates.slice(1, 4);

  // Trade-up consideration. Look for the highest unweighted-score
  // candidate that's probably_gone AND whose raw EV materially beats
  // the actual winner's raw EV. If found, surface "or trade up to
  // lock [name]" as a secondary path on The Call. Threshold: raw
  // score must exceed the winner's raw score by at least 5 points
  // (noise filter) so we don't surface marginal-EV alternates.
  if (survivalWindow.kind === "pre_turn") {
    const winnerRawScore = rawScoresById.get(winner.player.id) ?? 0;
    let bestUnreachable: { c: ScoredCandidate; survPct: number } | null = null;
    for (const c of candidates) {
      if (c.player.id === winner.player.id) continue;
      const rawScore = rawScoresById.get(c.player.id) ?? 0;
      if (rawScore < winnerRawScore + 5) continue;
      const pct = survivalPctFor({
        player: c.player,
        availability: availabilityAt(c.player, nextUserPickNo),
        signal: null,
        available,
        gap: gapAnalysis,
      });
      const bucket = availabilityFromPct(pct);
      if (bucket !== "probably_gone") continue;
      if (pct == null) continue;
      if (!bestUnreachable || rawScore > (rawScoresById.get(bestUnreachable.c.player.id) ?? 0)) {
        bestUnreachable = { c, survPct: pct };
      }
    }
    if (bestUnreachable) {
      const c = bestUnreachable.c;
      const adp = c.player.adp;
      const gapPicks =
        typeof adp === "number"
          ? Math.max(0, Math.round(current.pick_no - adp))
          : null;
      const framingParts: string[] = [];
      framingParts.push(`${c.player.name} would be your top call by value`);
      if (gapPicks != null && gapPicks > 0) {
        framingParts.push(
          `(${c.position}, ADP ${Math.round(adp as number)}, ${gapPicks} pick${gapPicks === 1 ? "" : "s"} past consensus)`,
        );
      } else {
        framingParts.push(`(${c.position}, ADP ${adp != null ? Math.round(adp) : "?"})`);
      }
      framingParts.push(
        `. Survival to your slot is ${bestUnreachable.survPct}%. If you want him, the lever is a trade-up, not a wait.`,
      );
      tradeUpConsideration = {
        player_id: c.player.id,
        player_name: c.player.name,
        position: c.position,
        adp: adp ?? null,
        survival_pct: bestUnreachable.survPct,
        framing: framingParts.join(""),
      };
    }
  }

  const why: string[] = [];
  why.push(winner.primary_reason);
  // Trust-hierarchy callout. When the lean has materially worse ADP
  // than a runner-up Top 3 candidate (i.e., Sleeper's ADP would
  // suggest the runner-up over the lean), surface the divergence so
  // the user understands why we picked against the ADP signal.
  // Per founder feedback 2026-04-26: "I'd have loved 'Even though
  // Kincaid is showing higher by ADP in Sleeper, [the lean] is
  // actually ranked higher on KTC crowdsourced expertise.'" The
  // user's natural mental model is ADP (Sleeper UI shows it); we
  // need to acknowledge their model AND explain the override.
  // Threshold: 10+ pick ADP gap qualifies. Smaller gaps are noise.
  const winnerAdp = winner.player.adp;
  if (typeof winnerAdp === "number") {
    let earliestRunner: ScoredCandidate | null = null;
    for (const r of runners) {
      const rAdp = r.player.adp;
      if (typeof rAdp !== "number") continue;
      if (rAdp >= winnerAdp - 10) continue; // not materially earlier
      if (!earliestRunner || rAdp < (earliestRunner.player.adp ?? Infinity)) {
        earliestRunner = r;
      }
    }
    if (earliestRunner && typeof earliestRunner.player.adp === "number") {
      const winnerVal = playerValues[winner.player.id];
      const runnerVal = playerValues[earliestRunner.player.id];
      const winnerKtcRank = ktcOverallRanks[winner.player.id];
      const runnerKtcRank = ktcOverallRanks[earliestRunner.player.id];
      // Build the most honest line we can given which signals are present.
      const parts: string[] = [
        `By Sleeper ADP alone, ${earliestRunner.player.name} (ADP ${Math.round(earliestRunner.player.adp)}) would go earlier than ${winner.player.name} (ADP ${Math.round(winnerAdp)}).`,
      ];
      if (
        typeof winnerVal === "number" &&
        typeof runnerVal === "number" &&
        winnerVal > runnerVal
      ) {
        parts.push(
          `KTC dynasty value puts ${winner.player.name} higher (VAL ${Math.round(winnerVal)} vs ${Math.round(runnerVal)}); we weight KTC for dynasty futures.`,
        );
      } else if (
        typeof winnerKtcRank === "number" &&
        typeof runnerKtcRank === "number" &&
        winnerKtcRank < runnerKtcRank
      ) {
        parts.push(
          `KTC overall rank puts ${winner.player.name} higher (#${winnerKtcRank} vs #${runnerKtcRank}); we weight KTC for dynasty futures.`,
        );
      } else {
        parts.push(
          `Our rule cascade (scarcity, path-fit, roster context) outweighed the ADP signal here.`,
        );
      }
      why.push(parts.join(" "));
    }
  }
  // Density framing. Always names the NEXT user pick by label so the
  // "you wait N picks" number is unambiguous. Without the label this
  // collides with the header's "picks_until_me" (which is the wait
  // BEFORE the current pick, not AFTER).
  const nextUserPick = schedule[1] ?? null;
  if (current.density_kind === "wraparound" && nextUserPick) {
    why.push(
      `You own ${nextUserPick.pick_label} back-to-back after this. Take the scarcer asset here; the back-to-back refills.`,
    );
  } else if (current.density_kind === "isolated") {
    const gap = Number.isFinite(current.gap_to_next)
      ? current.gap_to_next
      : null;
    const dest = nextUserPick ? ` (${nextUserPick.pick_label})` : "";
    why.push(
      gap != null
        ? `After this pick you wait ${gap} picks until your next slot${dest}. Defensive play: grab fragile now.`
        : `This is your last pick of the draft. No refill; take whatever you value most.`,
    );
  } else if (current.density_kind === "cluster" && nextUserPick) {
    const gap = Number.isFinite(current.gap_to_next)
      ? current.gap_to_next
      : null;
    // Cluster bullet rewritten 2026-04-25 to remove dynasty-veteran
    // jargon ("swing hard", "punt to the cluster") that the user
    // explicitly didn't understand. Now states the strategy: the
    // cluster gives you a refill window, so you have two real
    // options. Names both.
    why.push(
      gap != null
        ? `Cluster: ${nextUserPick.pick_label} is ${gap} pick${gap === 1 ? "" : "s"} away. You can lock the more fragile asset now and fill the other hole at ${nextUserPick.pick_label}, OR take the safer earned-value play and fill positions at ${nextUserPick.pick_label}.`
        : `Cluster: refill window opens at ${nextUserPick.pick_label}. You can lock the more fragile asset now and fill the other hole at ${nextUserPick.pick_label}, OR take the safer earned-value play and fill positions at ${nextUserPick.pick_label}.`,
    );
    // Cluster sequencing bullet. Fires when the lean and the next
    // runner-up are BOTH urgent fills at DIFFERENT positions: the
    // cluster lets the user grab both endangered assets in sequence
    // (lock the lean now, hunt the runner-up at the next pick). This
    // is the kind of multi-step game-theory reasoning the Coach
    // surfaces ("Lock Love. Hunt Higgins at 6.2.") that the panel
    // didn't articulate before. Per user analysis 2026-04-25.
    const runner = runners[0];
    if (
      runner &&
      runner.position !== winner.position &&
      (runner.rule === "fill_starter_urgent" ||
        runner.rule === "fill_starter") &&
      (winner.rule === "fill_starter_urgent" ||
        winner.rule === "fill_starter" ||
        winner.rule === "push_path")
    ) {
      why.push(
        `Cluster handles both. Lock ${winner.player.name} now, hunt ${runner.player.name} (${POSITION_LABEL[runner.position]}) at ${nextUserPick.pick_label}.`,
      );
    }
  }

  const tradeoff = buildTradeoff(winner, runners, nextUserPickNo);

  // Top 3 candidates side-by-side. The lean is the winner; runners are
  // the next two by score (already deduped by player_id in
  // buildCandidates via seenIds). Each carries its rule + survival hint
  // + constraint note so the card can show diverse lanes ("push_path"
  // next to "earned_value") and the user can choose the lane.
  const topThree: ScoredCandidate[] = [winner, ...runners].slice(0, 3);
  const top_candidates: DecisionTopCandidate[] = topThree.map((c) => {
    const baseAvail = availabilityAt(c.player, nextUserPickNo);
    const opponentSignal = opponentSignalForCandidate({
      player: c.player,
      gap: gapAnalysis,
    });
    const survival_pct = survivalPctFor({
      player: c.player,
      availability: baseAvail,
      signal: opponentSignal,
      available,
      gap: gapAnalysis,
    });
    // Bucket label is derived from the same survival probability that
    // drives the badge. Single source of truth eliminates the prior
    // bug class where text said "fragile-to-gone" and badge said 50%.
    const availability_next_pick = availabilityFromPct(survival_pct);
    return {
      ...toDecisionCandidate(c.player, playerValues, ktcOverallRanks),
      dial_influences: c.dial_influences,
      primary_reason: c.primary_reason,
      rule: c.rule,
      timeline_lane: classifyLane({
        age: c.player.age,
        years_exp: c.player.yearsExp ?? null,
      }),
      is_lean: c.player.id === winner.player.id,
      availability_next_pick,
      survival_pct,
      opponent_signal: opponentSignal,
      constraint_note: c.constraint_note,
    };
  });

  // Quadrant candidates. The synthesizer's rule-based scoring tends to
  // surface candidates clustered in similar position+age (e.g. all RBs
  // age 23-28). The user wants picks across the chart, not all in one
  // corner. Build a diversified pool by:
  //   1. Top 8 by composite rule score (the lean + serious alternatives)
  //   2. Best available at each rostered position not already pulled
  //   3. Youngest reasonable + oldest reasonable available not already
  //      pulled (so horizon extremes always have a dot)
  // Then compute the horizon coordinate RELATIVE to this pool's median
  // and spread, so the X-axis re-calibrates as the draft progresses.
  type QPoolEntry = {
    player: AvailablePlayer;
    rule: DecisionRule;
    primary_reason: string;
    score: number;
    constraint_note: string | null;
  };
  const qPool: QPoolEntry[] = [];
  const qSeen = new Set<string>();
  for (const c of candidates.slice(0, 8)) {
    if (qSeen.has(c.player.id)) continue;
    qSeen.add(c.player.id);
    qPool.push({
      player: c.player,
      rule: c.rule,
      primary_reason: c.primary_reason,
      score: c.score,
      constraint_note: c.constraint_note,
    });
  }
  // Best available at each rostered position not already in the pool.
  // Uses effectiveStarterReqs so superflex correctly gates QB even
  // when hard.QB = 0 (unusual but valid: leagues with only an SF
  // slot and no dedicated QB slot).
  const qReqs = effectiveStarterReqs(snap);
  for (const pos of ["QB", "RB", "WR", "TE"] as Position[]) {
    if ((qReqs[pos] ?? 0) <= 0) continue;
    const top = available.find(
      (p) => normalizePos(p.position) === pos && !qSeen.has(p.id),
    );
    if (!top) continue;
    qSeen.add(top.id);
    // Score = base 35 minus a search-rank decay so multiple positions
    // firing this rule produce differentiated scores (no flat-literal
    // anti-pattern). Floor at 20 so even rank-150 best-at-position
    // stays above future-stash fallback territory.
    const rankDecay = Math.min(top.search_rank, 150) / 10;
    qPool.push({
      player: top,
      rule: "earned_value",
      primary_reason: `Best available ${POSITION_LABEL[pos]} (${top.name}, rank #${top.search_rank}).`,
      score: Math.max(20, Math.round(35 - rankDecay)),
      constraint_note: null,
    });
  }
  // Horizon extremes: youngest + oldest in the top-30 available, so
  // the X-axis always has anchor dots at both ends. Skip if already in.
  const top30WithAge = available
    .slice(0, 30)
    .filter((p) => p.age != null) as Array<AvailablePlayer & { age: number }>;
  const youngestFirst = [...top30WithAge].sort((a, b) => a.age - b.age);
  const oldestFirst = [...top30WithAge].sort((a, b) => b.age - a.age);
  for (const extreme of [youngestFirst[0], oldestFirst[0]]) {
    if (!extreme || qSeen.has(extreme.id)) continue;
    qSeen.add(extreme.id);
    const ageLabel =
      extreme.id === youngestFirst[0]?.id ? "youngest" : "oldest";
    // Differentiate youngest vs oldest with a small candidate-specific
    // delta keyed on search_rank. Anti-pattern lint requires per-rule
    // candidates to have differentiated scores.
    const rankDelta = Math.min(extreme.search_rank, 100) / 25;
    qPool.push({
      player: extreme,
      rule: "earned_value",
      primary_reason: `Horizon anchor: ${ageLabel} reasonable available (${extreme.name}, age ${extreme.age}).`,
      score: Math.max(15, Math.round(28 - rankDelta)),
      constraint_note: null,
    });
  }
  // Pool stats for relative horizon. Median + half-range as spread,
  // floored at 2 so very-tight pools don't divide by near-zero.
  const ages = qPool
    .map((q) => q.player.age)
    .filter((a): a is number => typeof a === "number")
    .sort((a, b) => a - b);
  const poolMedian = ages.length > 0 ? ages[Math.floor(ages.length / 2)] : 25;
  const poolSpread =
    ages.length >= 2 ? Math.max(2, (ages[ages.length - 1] - ages[0]) / 2) : 3;

  const quadrant_candidates: DecisionQuadrantCandidate[] = qPool.map((q) => {
    const baseAvail = availabilityAt(q.player, nextUserPickNo);
    const oppSignal = opponentSignalForCandidate({
      player: q.player,
      gap: gapAnalysis,
    });
    const survival_pct = survivalPctFor({
      player: q.player,
      availability: baseAvail,
      signal: oppSignal,
      available,
      gap: gapAnalysis,
    });
    const availability_next_pick = availabilityFromPct(survival_pct);
    return {
      ...toDecisionCandidate(q.player, playerValues, ktcOverallRanks),
      primary_reason: q.primary_reason,
      rule: q.rule,
      timeline_lane: classifyLane({
        age: q.player.age,
        years_exp: q.player.yearsExp ?? null,
      }),
      is_lean: q.player.id === winner.player.id,
      availability_next_pick,
      survival_pct,
      opponent_signal: oppSignal,
      constraint_note: q.constraint_note,
      horizon_pct: horizonRelativeToPool(
        q.player.age,
        q.player.is_rookie,
        poolMedian,
        poolSpread,
      ),
      confidence_pct: confidenceForScore(q.score),
    };
  });

  const next_picks_plan = buildNextPicksPlan(
    snap,
    available,
    schedule,
    winner.position,
    winner.player.id,
  );
  const scarcity_callout = buildScarcityCallout(
    winner,
    available,
    nextUserPickNo,
  );
  const emergency_trade_up = buildEmergencyTradeUp(
    winner,
    current,
    picks_until_me,
  );
  // Counter-view: surfaces the strongest dissenting frame inline so
  // the user doesn't have to ask Coach to discover the parallel
  // argument the lean ignored. Per cross-panel decision framework.
  const counter_view = buildCounterView(
    winner,
    available,
    snap,
    nextUserPickNo,
  );

  // Counterintuitive-pick disclaimer. When the standing call is a
  // sharp lock (taken 10+ picks before ADP), the redesigned UI shows
  // a Voice A line above the call: "Counterintuitive lock. Mahomes
  // would normally fall 14 more picks. Survival to your next slot
  // is 35%. Trust the math." Null when the call is at-or-past ADP
  // (a market discount, not a sharp lock).
  const feel_weird_disclaimer = composeFeelWeirdDisclaimer({
    winner,
    currentPickNo: current.pick_no,
    nextUserPickNo,
  });

  // Plays this pick enables. Surfaces multi-pick intentional sequences
  // (stacks, handcuffs, bridge-QB succession) so the user sees how to
  // make this pick "genius" instead of average. Detection is hardcoded
  // per archetype for Phase 1; library lives at src/lib/strategy/plays.
  const plays_this_enables = detectPlaysEnabledBy({
    winner: winner.player,
    snap,
    available,
    ktcValues: playerValues,
    survival: buildSurvivalResolver(snap, available),
  });

  return {
    pick_label: current.pick_label,
    pick_no: current.pick_no,
    picks_until_me,
    density: current.density_kind,
    recommendation: {
      ...toDecisionCandidate(winner.player, playerValues, ktcOverallRanks),
      dial_influences: winner.dial_influences,
      primary_reason: winner.primary_reason,
      rule: winner.rule,
    },
    top_candidates,
    quadrant_candidates,
    why,
    tradeoff,
    opponent_between_picks: gapAnalysis.opponents.length > 0 ? gapAnalysis : null,
    next_picks_plan,
    scarcity_callout,
    emergency_trade_up,
    counter_view,
    feel_weird_disclaimer,
    trade_up_consideration: tradeUpConsideration,
    plays_this_enables,
  };
}

/**
 * "This will feel weird, hear me out" disclaimer. Triggers when the
 * standing call is a sharp lock: taken 10+ picks before ADP. Voice
 * A: terse, evidence-cited, no preamble.
 *
 * Returns null when the call is at-or-past ADP (a market discount,
 * not a sharp lock; the user is getting the asset, not reaching for
 * it).
 */
const SHARP_LOCK_GAP_THRESHOLD = 10;

// Two flavors of counterintuitive disclaimer, both Voice A.
//
// Sharp lock: standing call taken 10+ picks BEFORE ADP. The user
// is "reaching" by market terms; we are recommending the lock
// because survival to their next slot is low.
//
// Counterintuitive value: standing call FELL 15+ picks past ADP and
// is still on the board. The user's gut may want to fill a position
// hole instead; we are recommending the value asset because the EV
// math says taking the rare market gift outweighs the depth fill.
//
// Both directions deserve language because both feel weird to a
// founder who is reading Sleeper's UI ADP and pattern-matching on
// "the obvious play." 2026-05-08 izzydabomb session named the value-
// side gap explicitly: "I'm thinking Jordan Mason, Kaytron Allen,
// Jonathan Brooks, Zach Charbonnet here. You're going super
// youngsters for some reason. What am I missing?" The model was
// right; the disclaimer was missing.
const VALUE_FALL_DISCLAIMER_GAP = 15;

function composeFeelWeirdDisclaimer(args: {
  winner: ScoredCandidate;
  currentPickNo: number;
  nextUserPickNo: number;
}): string | null {
  const { winner, currentPickNo, nextUserPickNo } = args;
  const adp = winner.player.adp;
  if (typeof adp !== "number") return null;
  // gap = adp - currentPickNo.
  //   Positive >= SHARP_LOCK_GAP_THRESHOLD: player normally goes
  //     LATER (we're reaching for a sharp lock).
  //   Negative <= -VALUE_FALL_DISCLAIMER_GAP: player would normally
  //     already be gone (rare market gift; counterintuitive value).
  const gap = adp - currentPickNo;

  const survivalPct = survivalPctFor({
    player: winner.player,
    availability: availabilityAt(winner.player, nextUserPickNo),
    signal: { direction: "neutral", note: null, per_pick_demand: 0 },
    available: [],
    gap: {
      opponents: [],
      total_demand_by_position: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 },
      primary_opponent: null,
    },
  });
  const survivalText =
    survivalPct != null
      ? `Survival to your next slot is ${survivalPct}%.`
      : "Survival math unavailable.";

  if (gap >= SHARP_LOCK_GAP_THRESHOLD) {
    return `Counterintuitive lock. ${winner.player.name} would normally fall ${Math.round(gap)} more picks. ${survivalText} Trust the math.`;
  }
  if (gap <= -VALUE_FALL_DISCLAIMER_GAP) {
    const fellBy = Math.abs(Math.round(gap));
    return `Counterintuitive value. ${winner.player.name} normally goes ${fellBy} picks earlier (ADP ${Math.round(adp)}). The conventional play here is filling a position hole; the math says take the asset the market left on the floor.`;
  }
  return null;
}
