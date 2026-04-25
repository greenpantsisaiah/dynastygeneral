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
import type { RankedArchetype, Position } from "../archetypes/schema";
import type { AvailablePlayer } from "@/lib/players/available";
import type { WindowsResult } from "../windows/compute";
import type { WindowWeightingId } from "../windows/types";
import {
  buildWindowConstraint,
  penalizeForConstraint,
  type WindowConstraint,
} from "./window-constraint";
import type {
  Decision,
  DecisionCandidate,
  DecisionRule,
  DecisionTopCandidate,
  DecisionQuadrantCandidate,
  NextPickPlanItem,
} from "./types";

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
// not 1/1. RB/WR/TE FLEX slots are NOT position-locked (a flex can be
// any of three positions), so we don't expand skill-position
// requirements here. This mirrors `qb_starters_max = hard.QB +
// superflex` in `web/src/lib/engine/llm-contract.ts` so the engine's
// fill-starter rule and the LLM contract's format_rules bind to the
// same number. Without this alignment the engine reports 1/1 QB while
// the Coach's format_rules reports 1/2, and the user gets a Decision
// card lean that ignores the second QB hole. Per dynasty-bug-
// investigator + ultrathink diagnosis 2026-04-24.
function effectiveStarterReqs(snap: LeagueSnapshot): Record<Position, number> {
  const ss = snap.starter_slots;
  return {
    QB: ss.hard.QB + ss.superflex,
    RB: ss.hard.RB,
    WR: ss.hard.WR,
    TE: ss.hard.TE,
    K: ss.hard.K,
    DST: ss.hard.DST,
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

function toDecisionCandidate(p: AvailablePlayer): DecisionCandidate {
  return {
    player_id: p.id,
    name: p.name,
    position: p.position,
    team: p.team,
    age: p.age,
    search_rank: p.search_rank,
    adp: p.adp,
    is_rookie: p.is_rookie,
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

function availabilityAt(
  player: AvailablePlayer,
  slot: number,
): Availability | null {
  if (player.adp == null) return null;
  const gap = player.adp - slot;
  if (gap >= 5) return "likely_here";
  if (gap <= -2) return "probably_gone";
  return "coin_flip";
}

function buildCandidates(
  snap: LeagueSnapshot,
  ranked: RankedArchetype[],
  available: AvailablePlayer[],
  nextUserPickNo: number,
  windowConstraint: WindowConstraint,
): ScoredCandidate[] {
  const me = snap.rosters.find((r) => r.is_me);
  if (!me) return [];
  const candidates: ScoredCandidate[] = [];
  const seenIds = new Set<string>();

  // Apply window constraint penalty + attach the note to each candidate.
  // Called right before each push so the stored score reflects both
  // rule-scoring and constraint correction in one number.
  const push = (raw: Omit<ScoredCandidate, "raw_score" | "score" | "constraint_note"> & { score: number }) => {
    if (seenIds.has(raw.player.id)) return;
    seenIds.add(raw.player.id);
    const { penalty, note } = penalizeForConstraint(
      raw.player,
      windowConstraint,
    );
    candidates.push({
      player: raw.player,
      position: raw.position,
      rule: raw.rule,
      primary_reason: raw.primary_reason,
      raw_score: raw.score,
      score: raw.score - penalty,
      constraint_note: note,
    });
  };

  // Rule 1: Fill-starter-hole, weighted by urgency.
  // Format-aware: super_flex counts as a QB hole in superflex.
  const reqs = effectiveStarterReqs(snap);
  for (const pos of ["QB", "RB", "WR", "TE"] as Position[]) {
    if (reqs[pos] <= 0) continue;
    if (me.position_counts[pos] >= reqs[pos]) continue;
    const top = topAtPos(available, pos, 1)[0];
    if (!top) continue;
    const availability = availabilityAt(top, nextUserPickNo);
    const have = me.position_counts[pos];
    const need = reqs[pos];
    // Survival copy graduated by gap. ADP is a central tendency, not
    // a wall. The three buckets mirror availabilityAt(): well-past
    // = likely sitting, at-or-just-past = coin flip, before-slot =
    // probably gone.
    const adp = top.adp;
    const gap =
      typeof adp === "number" ? Math.round(adp - nextUserPickNo) : null;
    const survival =
      gap == null
        ? "ADP unavailable; treat as fragile until you see him on the board."
        : gap >= 5
          ? `ADP ${Math.round(adp!)} puts him ${gap} picks past your next slot. Should still be there.`
          : gap >= 0
            ? `ADP ${Math.round(adp!)} lands right at your next slot (${nextUserPickNo}). Coin flip whether he survives; not safe to skip without a backup.`
            : gap >= -3
              ? `ADP ${Math.round(adp!)} is ${Math.abs(gap)} pick${Math.abs(gap) === 1 ? "" : "s"} past consensus. He's at risk now; could go any pick.`
              : `ADP ${Math.round(adp!)} is well past consensus (${Math.abs(gap)} picks). He'd have to fall hard to survive; treat as fragile-to-gone.`;
    if (availability !== "likely_here") {
      // COIN_FLIP and PROBABLY_GONE both fire urgent-fill scoring.
      // The user can't safely wait if the player might be gone.
      push({
        player: top,
        position: pos,
        rule: "fill_starter_urgent",
        score: 100,
        primary_reason: `${top.name} is the best ${POSITION_LABEL[pos]} on the board and you're ${have}/${need} on starters. ${survival}`,
      });
    } else {
      push({
        player: top,
        position: pos,
        rule: "fill_starter",
        score: 60,
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

  // Rule 3: Earned value. Consider top 8 by dynasty rank so the window
  // constraint has real alternatives to penalize toward. If the #1
  // earned-value player is a rookie under heavy-win-now, the #2 / #3
  // (proven vet in the ideal age band) can win after penalty. Scores
  // decay gently with rank so the #1 pick still wins absent a constraint.
  for (let i = 0; i < Math.min(available.length, 8); i++) {
    const p = available[i];
    const pos = normalizePos(p.position);
    if (!pos) continue;
    push({
      player: p,
      position: pos,
      rule: "earned_value",
      score: 45 - i * 1.5,
      primary_reason: `Dynasty value on the board (${p.name}, rank #${p.search_rank}).`,
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

  const futures = schedule.slice(1, 1 + MAX_NEXT_PICKS);
  const items: NextPickPlanItem[] = [];
  for (let idx = 0; idx < futures.length; idx++) {
    const future = futures[idx];
    // Bind to the same availability classifier the Top 3 card uses so
    // the engine never recommends a player it elsewhere flagged as
    // probably gone. Likely_here and coin_flip stay in the pool;
    // probably_gone is excluded.
    const survivor = (p: AvailablePlayer): boolean => {
      if (leanPlayerId && p.id === leanPlayerId) return false;
      const a = availabilityAt(p, future.pick_no);
      if (a == null) return true;
      return a !== "probably_gone";
    };
    const pool = available.filter(survivor);

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
      const top = pool.slice(0, 2);
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

    items.push({
      pick_label: future.pick_label,
      pick_no: future.pick_no,
      density: future.density_kind,
      target_position: targetPos,
      target_names: names,
      reason,
      confidence,
      alternates,
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
  declared_window: WindowWeightingId | null;
}): Decision | null {
  const { snap, ranked, available, windows, picks_until_me, declared_window } =
    args;
  const schedule = snap.draft.my_pick_schedule;
  if (schedule.length === 0) return null;
  if (available.length === 0) return null;

  const current = schedule[0];
  const nextUserPickNo =
    schedule.length > 1 ? schedule[1].pick_no : current.pick_no + 999;

  const windowConstraint = buildWindowConstraint(declared_window, windows);

  const candidates = buildCandidates(
    snap,
    ranked,
    available,
    nextUserPickNo,
    windowConstraint,
  );
  if (candidates.length === 0) return null;

  const winner = candidates[0];
  const runners = candidates.slice(1, 4);

  const why: string[] = [];
  why.push(winner.primary_reason);
  // If the window constraint is active and the winner violates it,
  // acknowledge that here instead of silently ignoring the signal.
  if (winner.constraint_note && windowConstraint.strength !== "none") {
    why.push(
      `Window says "${windowConstraint.label.toLowerCase()}" but this pick violates it (${winner.constraint_note.toLowerCase().replace(/\.$/, "")}). Rule score still wins on scarcity/path.`,
    );
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
    why.push(
      gap != null
        ? `Picks coming back ${gap} slots later (${nextUserPick.pick_label}). Safe to swing hard OR punt to the cluster.`
        : `Picks coming back soon after this. Safe to swing hard OR punt to the cluster.`,
    );
  }

  const tradeoff = buildTradeoff(winner, runners, nextUserPickNo);

  // Top 3 candidates side-by-side. The lean is the winner; runners are
  // the next two by score (already deduped by player_id in
  // buildCandidates via seenIds). Each carries its rule + survival hint
  // + constraint note so the card can show diverse lanes ("push_path"
  // next to "earned_value") and the user can choose the lane.
  const topThree: ScoredCandidate[] = [winner, ...runners].slice(0, 3);
  const top_candidates: DecisionTopCandidate[] = topThree.map((c) => ({
    ...toDecisionCandidate(c.player),
    primary_reason: c.primary_reason,
    rule: c.rule,
    is_lean: c.player.id === winner.player.id,
    availability_next_pick: availabilityAt(c.player, nextUserPickNo),
    constraint_note: c.constraint_note,
  }));

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
  for (const pos of ["QB", "RB", "WR", "TE"] as Position[]) {
    if ((snap.starter_slots.hard[pos] ?? 0) <= 0) continue;
    const top = available.find(
      (p) => normalizePos(p.position) === pos && !qSeen.has(p.id),
    );
    if (!top) continue;
    qSeen.add(top.id);
    const { penalty, note } = penalizeForConstraint(top, windowConstraint);
    qPool.push({
      player: top,
      rule: "earned_value",
      primary_reason: `Best available ${POSITION_LABEL[pos]} (${top.name}, rank #${top.search_rank}).`,
      score: Math.max(20, 35 - penalty),
      constraint_note: note,
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
    const { penalty, note } = penalizeForConstraint(extreme, windowConstraint);
    const ageLabel =
      extreme.id === youngestFirst[0]?.id ? "youngest" : "oldest";
    qPool.push({
      player: extreme,
      rule: "earned_value",
      primary_reason: `Horizon anchor: ${ageLabel} reasonable available (${extreme.name}, age ${extreme.age}).`,
      score: Math.max(15, 28 - penalty),
      constraint_note: note,
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

  const quadrant_candidates: DecisionQuadrantCandidate[] = qPool.map((q) => ({
    ...toDecisionCandidate(q.player),
    primary_reason: q.primary_reason,
    rule: q.rule,
    is_lean: q.player.id === winner.player.id,
    availability_next_pick: availabilityAt(q.player, nextUserPickNo),
    constraint_note: q.constraint_note,
    horizon_pct: horizonRelativeToPool(
      q.player.age,
      q.player.is_rookie,
      poolMedian,
      poolSpread,
    ),
    confidence_pct: confidenceForScore(q.score),
  }));

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

  return {
    pick_label: current.pick_label,
    pick_no: current.pick_no,
    picks_until_me,
    density: current.density_kind,
    window_frame: {
      direction: windowConstraint.direction,
      strength: windowConstraint.strength,
      label: windowConstraint.label,
      sentence: windowConstraint.sentence,
    },
    recommendation: {
      ...toDecisionCandidate(winner.player),
      primary_reason: winner.primary_reason,
      rule: winner.rule,
    },
    top_candidates,
    quadrant_candidates,
    why,
    tradeoff,
    next_picks_plan,
    scarcity_callout,
    emergency_trade_up,
    counter_view,
  };
}
