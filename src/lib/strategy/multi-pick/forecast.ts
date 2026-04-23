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

  // Sort once by dynasty rank (lower = better). The depletion loop
  // walks this list and slices off the top entries between user picks.
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

    // Deplete: remove the player we just "took" plus the gap_to_next
    // top candidates the opponents will likely take. If this is the
    // last user pick we model, no depletion needed.
    const next = schedule[i + 1];
    if (!next) break;
    const opponentPicksBetween = Math.max(0, slot.gap_to_next);
    // 1 user pick + opponentPicksBetween from the pool head. Cap so
    // we don't go negative.
    const drop = Math.min(remainingPool.length, 1 + opponentPicksBetween);
    remainingPool.splice(0, drop);
  }

  return {
    picks,
    thread: buildThread(picks, snap),
    position_summary: Array.from(positionCounts.entries())
      .map(([position, count]) => ({ position, count }))
      .sort((a, b) => b.count - a.count),
  };
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
