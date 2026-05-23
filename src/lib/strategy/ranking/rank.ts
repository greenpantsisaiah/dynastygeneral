/**
 * Top-level ranker. Drift-based. never returns empty during an
 * active draft. Combines partial drift (fit) + opening boost into a
 * total score; sort by total. Includes trajectory so the UI can show
 * which paths are widening or narrowing.
 *
 * Filtering rule: include all archetypes with drift > MIN_DRIFT_VISIBLE
 * OR an active opening. This way a user with 1 QB sees QB Cartel
 * (partial drift), QB Volume Replacement (partial), WR Anchor (1 WR
 * partial), and so on. never an empty board.
 */

import { ARCHETYPES } from "../archetypes";
import type {
  Archetype,
  CompletionCheck,
  EvaluatedRequiredMove,
  Position,
  RankedArchetype,
} from "../archetypes/schema";
import { getMyRoster, type LeagueSnapshot } from "../league-state/snapshot";
import { getHardStarterReqs } from "@/lib/engine/roster-fit";
import { scoreFit } from "./fit";
import { enrichArchetypeLikelihoods } from "./likelihood";
import { detectOpenings } from "./opportunity";
import { computeTrajectory } from "./trajectory";

const TOP_N = 6;
const MIN_DRIFT_VISIBLE = 0.1; // hide noise; archetypes below this aren't even partially fitting
// Once drift is this strong AND all auto-checkable required moves are
// done, the archetype is in "executing" phase rather than "acquisition."
const EXECUTING_DRIFT_THRESHOLD = 0.85;

function evaluateCompletion(
  check: CompletionCheck,
  snap: LeagueSnapshot,
): boolean {
  const me = getMyRoster(snap);
  if (!me) return false;
  switch (check.kind) {
    case "min_position_count":
      return me.position_counts[check.position] >= check.min;
    case "max_position_count":
      return me.position_counts[check.position] <= check.max;
  }
}

function evaluateMoves(
  archetype: Archetype,
  snap: LeagueSnapshot,
): EvaluatedRequiredMove[] {
  return archetype.required_moves.map((m) => ({
    ...m,
    completed: m.completion_check
      ? evaluateCompletion(m.completion_check, snap)
      : false,
  }));
}

function primaryPositionForArchetype(a: Archetype): Position | null {
  if (a.id.startsWith("qb-") || a.category === "Positional Leverage")
    return "QB";
  if (a.id.startsWith("wr-") || a.category === "WR Strategy") return "WR";
  if (a.id.startsWith("rb-") || a.category === "RB Strategy") return "RB";
  if (a.id.startsWith("te-") || a.category === "TE Strategy") return "TE";
  return null;
}

// A path is considered POSITION-SATURATED when the user already owns
// enough players at the path's primary position that taking another
// doesn't advance the strategy. Threshold: starter_need + 1. One
// backup beyond starter need is enough unless the strategy explicitly
// hoards (and even then, diminishing returns).
function isPositionSaturated(
  archetype: Archetype,
  snap: LeagueSnapshot,
): boolean {
  const pos = primaryPositionForArchetype(archetype);
  if (!pos) return false;
  const me = getMyRoster(snap);
  if (!me) return false;
  const baseNeed = getHardStarterReqs(snap)[pos];
  if (baseNeed <= 0) return false;
  return me.position_counts[pos] >= baseNeed + 1;
}

function derivePhase(
  drift_score: number,
  evaluated_moves: EvaluatedRequiredMove[],
  archetype: Archetype,
  snap: LeagueSnapshot,
): "acquisition" | "executing" {
  // Position saturation is the strongest executing signal. If the user
  // already has starter + 1 at the path's position, more picks at that
  // position don't advance strategy regardless of drift.
  if (isPositionSaturated(archetype, snap)) return "executing";
  if (drift_score < EXECUTING_DRIFT_THRESHOLD) return "acquisition";
  // Auto-checkable moves only. A move with no completion_check can't
  // be auto-judged complete (e.g. "don't sell into the first offer"),
  // so we ignore it here. If every checkable move is complete AND
  // drift is at the executing threshold, we're in execution phase.
  const checkable = evaluated_moves.filter((m) => m.completion_check);
  if (checkable.length === 0) return "acquisition";
  const allDone = checkable.every((m) => m.completed);
  return allDone ? "executing" : "acquisition";
}

export function rankArchetypes(snap: LeagueSnapshot): RankedArchetype[] {
  const ranked: RankedArchetype[] = [];

  for (const a of ARCHETYPES) {
    const fit = scoreFit(a, snap);
    const openings = detectOpenings(a, snap);
    if (fit.drift_score < MIN_DRIFT_VISIBLE && openings.active.length === 0)
      continue;
    const total = Math.min(1, fit.drift_score + openings.boost);
    const likelihoods = enrichArchetypeLikelihoods(a, snap);
    const trajectory = computeTrajectory(a, snap);
    const evaluated_moves = evaluateMoves(a, snap);
    const phase = derivePhase(fit.drift_score, evaluated_moves, a, snap);
    ranked.push({
      archetype: a,
      drift_score: fit.drift_score,
      opening_boost: openings.boost,
      total_score: total,
      trajectory,
      live_gamble: likelihoods.live_gamble,
      live_risks: likelihoods.live_risks,
      active_openings: openings.active,
      evaluated_moves,
      phase,
    });
  }

  ranked.sort((a, b) => b.total_score - a.total_score);
  return ranked.slice(0, TOP_N);
}
