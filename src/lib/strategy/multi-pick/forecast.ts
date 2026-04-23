/**
 * Multi-pick draft rollout. Walks the user's full pick schedule and
 * projects what's likely to be available at each pick after intervening
 * opponent picks deplete the pool.
 *
 * Depletion model (v1, pessimistic):
 *   Between user pick N and N+1, opponents will pick `gap_to_next`
 *   times. We assume opponents pick by descending dynasty value (top
 *   of search_rank tier). So between picks, drop the top
 *   `gap_to_next` candidates from the available pool.
 *
 * This is conservative: it assumes opponents are rational and on-the-
 * board top picks survive only via gap arithmetic. Real opponents
 * sometimes reach for a need or punt a tier, so the projection's
 * confidence drops the further out we go.
 *
 * Future improvements (v2):
 *   - Use opponent characterizations to skip future-leaning opponents
 *     past rookies, and win-now opponents past 23-and-unders.
 *   - Sample-and-aggregate (run 50 trials with stochastic opponents,
 *     report the player most likely to survive at each user pick).
 *   - LLM-narrated "thread" instead of templated.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type { AvailablePlayer } from "@/lib/players/available";
import type { MultiPickEntry, MultiPickPlan } from "./types";

// Hard cap dropped from 6 to 4 per assumption-auditor 2026-04-23: dynasty
// mock-draft data (RotoWire 200+ sims, DLF tiering, FantasyPoints ADP
// risers) shows top-6 stability collapses past pick 7. Anything past
// the 4th projected user pick is "directional" framing only.
const MAX_PICKS_PROJECTED = 4;
const HIGH_CONFIDENCE_PICKS = 1; // current pick gets 1 alt, mids get 2, late get 3
const MAX_ALTS = 3;

// Position-aware depletion (v1.5 per audit). Real dynasty drafters
// don't drain a global rank; they drain by position based on roster
// construction reality. RB and WR consume the bulk of early picks;
// QB only matters in superflex; TE rarely. Used to bias which
// candidates fall off the board between user picks instead of
// blindly slicing from the top of dynasty_rank.
//
// Source: Athlon Sports positional-run primer + dynasty community
// pick-distribution observation. Numbers are roughly the share of
// early-round picks each position absorbs in dynasty rookie + startup
// formats.
const POSITION_DRAIN_WEIGHT_1QB: Record<string, number> = {
  WR: 0.45,
  RB: 0.35,
  TE: 0.10,
  QB: 0.10,
};
const POSITION_DRAIN_WEIGHT_SF: Record<string, number> = {
  WR: 0.35,
  RB: 0.30,
  QB: 0.25, // SF demand bumps QB share substantially
  TE: 0.10,
};

/**
 * Build the projected plan. Returns null when the user has fewer than
 * 2 remaining picks (no rollout to forecast) or the available pool is
 * empty (nothing to project from).
 */
export function buildMultiPickPlan(args: {
  snap: LeagueSnapshot;
  available: AvailablePlayer[];
}): MultiPickPlan | null {
  const { snap, available } = args;
  const schedule = snap.draft.my_pick_schedule;
  if (schedule.length < 2) return null;
  if (available.length === 0) return null;

  // Format-aware drain weights: SF inflates QB demand. Picked once
  // per call; consumed by the depletion loop below.
  const isSuperflex = snap.format === "superflex" || snap.format === "2qb";
  const drainWeights = isSuperflex
    ? POSITION_DRAIN_WEIGHT_SF
    : POSITION_DRAIN_WEIGHT_1QB;

  // Sort once by dynasty rank (lower = better). The depletion loop
  // walks this list and removes a position-aware slice between user
  // picks rather than blindly slicing the top.
  const sorted = [...available].sort(
    (a, b) => a.dynasty_rank - b.dynasty_rank,
  );
  const remainingPool = [...sorted];

  const picks: MultiPickEntry[] = [];
  // Track positions added across the projected plan for the summary.
  const positionCounts = new Map<string, number>();

  for (let i = 0; i < schedule.length && i < MAX_PICKS_PROJECTED; i++) {
    const slot = schedule[i];

    // The pool at this pick = remainingPool. Categorical confidence
    // (HIGH / MEDIUM / DIRECTIONAL) replaces the prior numeric taper:
    // numeric implied precision the deterministic depletion model
    // hasn't earned. Alt count scales inversely with confidence so
    // late picks surface more options to absorb sniping.
    if (remainingPool.length === 0) break;
    const primary = remainingPool[0];
    const confidence: "high" | "medium" | "directional" =
      i < HIGH_CONFIDENCE_PICKS
        ? "high"
        : i < HIGH_CONFIDENCE_PICKS + 2
          ? "medium"
          : "directional";
    const altCount =
      confidence === "high" ? 1 : confidence === "medium" ? 2 : MAX_ALTS;
    const alts = remainingPool.slice(1, 1 + altCount);

    picks.push({
      pick_label: slot.pick_label,
      pick_no: slot.pick_no,
      picks_until: i === 0 ? 0 : slot.pick_no - schedule[0].pick_no,
      primary: {
        name: primary.name,
        position: primary.position ?? "?",
        team: primary.team,
        age: primary.age,
        reason: reasonFor(primary, i),
      },
      alternates: alts.map((p) => ({
        name: p.name,
        position: p.position ?? "?",
        team: p.team,
        age: p.age,
      })),
      confidence,
    });

    if (primary.position) {
      positionCounts.set(
        primary.position,
        (positionCounts.get(primary.position) ?? 0) + 1,
      );
    }

    // Deplete: remove the player we just "took" plus a position-aware
    // slice the opponents will likely take. If this is the last user
    // pick we model, no depletion needed.
    const next = schedule[i + 1];
    if (!next) break;
    const opponentPicksBetween = Math.max(0, slot.gap_to_next);

    // Always remove the user's primary first.
    remainingPool.shift();

    // For each opponent pick, remove the top candidate of the
    // position the drainWeights say is most likely to be drafted
    // next. We track a running budget per position so the drain
    // distribution converges to the weights over multiple picks.
    const positionDrained: Record<string, number> = {};
    for (let j = 0; j < opponentPicksBetween && remainingPool.length > 0; j++) {
      const targetPos = pickDrainTarget(
        drainWeights,
        positionDrained,
        j + 1,
      );
      const idx = targetPos
        ? remainingPool.findIndex(
            (p) => (p.position ?? "?").toUpperCase() === targetPos,
          )
        : -1;
      // If the target position isn't in the pool (or no target), fall
      // back to the top of the global pool. Keeps the model bounded.
      const removeIndex = idx >= 0 ? idx : 0;
      const removed = remainingPool.splice(removeIndex, 1)[0];
      const pos = (removed?.position ?? "?").toUpperCase();
      positionDrained[pos] = (positionDrained[pos] ?? 0) + 1;
    }
  }

  return {
    picks,
    thread: buildThread(picks, snap),
    position_summary: Array.from(positionCounts.entries())
      .map(([position, count]) => ({ position, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * Pick the position to drain next based on configured weights and
 * what's already been drained. Returns the position whose
 * weight-normalized share is most under-represented relative to its
 * target, so the running drain converges on the weights as N grows.
 *
 * Returns null only if all weights are zero (degenerate config).
 */
function pickDrainTarget(
  weights: Record<string, number>,
  drained: Record<string, number>,
  totalSoFar: number,
): string | null {
  let best: string | null = null;
  let bestDeficit = -Infinity;
  for (const [pos, weight] of Object.entries(weights)) {
    if (weight <= 0) continue;
    const expected = weight * totalSoFar;
    const actual = drained[pos] ?? 0;
    const deficit = expected - actual;
    if (deficit > bestDeficit) {
      bestDeficit = deficit;
      best = pos;
    }
  }
  return best;
}

function reasonFor(p: AvailablePlayer, pickIndex: number): string {
  // Different framings for the immediate pick vs the projected ones.
  // Immediate = "best available." Projected = "if this is still here."
  if (pickIndex === 0) {
    return `Best available (${p.position ?? "?"}, dynasty rank ${Math.round(p.dynasty_rank)}).`;
  }
  const ageNote = p.age != null ? `, age ${p.age}` : "";
  return `If still on the board: ${p.position ?? "?"}-${p.team ?? "?"}${ageNote}, dynasty rank ${Math.round(p.dynasty_rank)}.`;
}

function buildThread(
  picks: MultiPickEntry[],
  snap: LeagueSnapshot,
): string {
  if (picks.length === 0) return "";
  const first = picks[0];
  const last = picks[picks.length - 1];

  // Roster age signal frames whether the plan extends a young build
  // or props up an aging core. avg_age comes from the user's roster.
  const meAge =
    snap.rosters.find((r) => r.is_me)?.avg_age ?? null;
  const ageFrame =
    meAge != null
      ? meAge < 25
        ? "young roster"
        : meAge > 27
          ? "aging core"
          : "balanced roster"
      : null;

  // Position pattern across the plan
  const posSeq = picks.map((p) => p.primary.position).join(" / ");

  const head = `Take ${first.primary.name} at ${first.pick_label}. From there the chain runs ${posSeq} through ${last.pick_label}.`;
  const middle = ageFrame
    ? `Pattern fits a ${ageFrame}. The first pick is the only certain one; alternates listed at each step are what the engine drops to if the primary gets sniped.`
    : `The first pick is the only certain one; alternates listed at each step are what the engine drops to if the primary gets sniped.`;
  // Find the first DIRECTIONAL-confidence pick to anchor the honesty
  // sentence. Falls back to "late picks" when everything is HIGH/MEDIUM.
  const firstDir = picks.findIndex((p) => p.confidence === "directional");
  const tail =
    firstDir >= 0
      ? `Picks from ${picks[firstDir].pick_label} onward are directional, not contractual; treat them as a guide.`
      : "Past the immediate pick the projection is best-effort; alts are your safety net.";

  return `${head} ${middle} ${tail}`;
}
