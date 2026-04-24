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

// Scarcity test: will this player survive to the user's NEXT pick?
// Sleeper ADP is "market average pick position." If adp <= nextUserPickNo,
// the player is statistically likely to be gone. Returns null if no ADP.
function survivesToNextUserPick(
  player: AvailablePlayer,
  nextUserPickNo: number,
): boolean | null {
  if (player.adp == null) return null;
  // Modest margin: ADP is an average, not a ceiling. 5-pick buffer.
  return player.adp > nextUserPickNo + 5;
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
  const reqs = snap.starter_slots.hard;
  for (const pos of ["QB", "RB", "WR", "TE"] as Position[]) {
    if (reqs[pos] <= 0) continue;
    if (me.position_counts[pos] >= reqs[pos]) continue;
    const top = topAtPos(available, pos, 1)[0];
    if (!top) continue;
    const survives = survivesToNextUserPick(top, nextUserPickNo);
    const have = me.position_counts[pos];
    const need = reqs[pos];
    if (survives === false) {
      // Branch fires when ADP says this player is GONE before the user's
      // NEXT pick. Old copy ("likely to survive to your next pick") read
      // as the opposite of the truth and contradicted the surrounding
      // urgency framing. Per dynasty-bug-investigator 2026-04-23.
      push({
        player: top,
        position: pos,
        rule: "fill_starter_urgent",
        score: 100,
        primary_reason: `${top.name} (ADP ${top.adp ?? "?"}) is the best ${POSITION_LABEL[pos]} on the board and goes before your next pick. Take him now or you get nothing here. You're ${have}/${need}.`,
      });
    } else {
      push({
        player: top,
        position: pos,
        rule: "fill_starter",
        score: 60,
        primary_reason: `Fills your ${POSITION_LABEL[pos]} starter hole (${have}/${need}). ${top.name} is the best available.`,
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
    const survives = survivesToNextUserPick(r.player, nextUserPickNo);
    const survivalReason =
      survives === true
        ? `likely survives to next pick, can take then`
        : survives === false
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

// Project what's likely to be around at the user's next 2-3 picks.
// Simple model: for each future pick, estimate the pool by removing
// players whose ADP puts them well before that pick. Then apply the
// same hole/path/value logic to pick a target.
function buildNextPicksPlan(
  snap: LeagueSnapshot,
  available: AvailablePlayer[],
  schedule: PickScheduleEntry[],
): NextPickPlanItem[] {
  if (schedule.length <= 1) return [];
  const me = snap.rosters.find((r) => r.is_me);
  if (!me) return [];
  const reqs = snap.starter_slots.hard;

  // Simulate hole-fills as the user makes picks. For each future pick,
  // optimistically treat the hole as filled if the plan recommends
  // that position, so subsequent picks move to the next hole or value.
  const simulated: Record<Position, number> = { ...me.position_counts };

  const items: NextPickPlanItem[] = [];
  for (const future of schedule.slice(1, 4)) {
    const survivor = (p: AvailablePlayer): boolean => {
      if (p.adp == null) return true;
      return p.adp > future.pick_no - 3;
    };
    const pool = available.filter(survivor);

    let targetPos: Position | "any" = "any";
    let names: string[] = [];
    let reason = "";
    for (const pos of ["QB", "RB", "WR", "TE"] as Position[]) {
      if (reqs[pos] <= 0) continue;
      if (simulated[pos] >= reqs[pos]) continue;
      const top2 = topAtPos(pool, pos, 2);
      if (top2.length === 0) continue;
      targetPos = pos;
      names = top2.map((p) => p.name);
      reason = `Fill ${POSITION_LABEL[pos]} hole (${simulated[pos]}/${reqs[pos]}).`;
      simulated[pos] += 1;
      break;
    }
    if (targetPos === "any") {
      const top = pool.slice(0, 2);
      if (top.length === 0) continue;
      names = top.map((p) => p.name);
      const pos = normalizePos(top[0].position);
      targetPos = pos ?? "any";
      reason = `Earned value, ${pos ? POSITION_LABEL[pos] + " " : ""}depth.`;
    }

    items.push({
      pick_label: future.pick_label,
      pick_no: future.pick_no,
      density: future.density_kind,
      target_position: targetPos,
      target_names: names,
      reason,
    });
  }
  return items;
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
    survives_to_next_pick: survivesToNextUserPick(c.player, nextUserPickNo),
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
    survives_to_next_pick: survivesToNextUserPick(q.player, nextUserPickNo),
    constraint_note: q.constraint_note,
    horizon_pct: horizonRelativeToPool(
      q.player.age,
      q.player.is_rookie,
      poolMedian,
      poolSpread,
    ),
    confidence_pct: confidenceForScore(q.score),
  }));

  const next_picks_plan = buildNextPicksPlan(snap, available, schedule);
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
  };
}
