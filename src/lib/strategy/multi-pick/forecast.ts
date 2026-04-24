/**
 * Multi-pick draft rollout. Walks the user's full pick schedule and
 * projects what's likely to be available at each pick after intervening
 * opponent picks deplete the pool.
 *
 * Depletion model (v2 Monte Carlo, per assumption-auditor 2026-04-23):
 *   Run N trials. In each trial, opponents draw stochastically from a
 *   position-weighted top-K window: position is sampled by drainWeights,
 *   then the player is sampled within that position from the top-K of
 *   the pool with softmax weights (top of pool is most likely but not
 *   certain). Aggregate: per user pick, find the modal primary across
 *   trials and surface the next 2 most-frequently-also-available as
 *   alternates. Survival % becomes the basis for the confidence band.
 *
 * Why this beats v1:
 *   - Real opponents reach, punt tiers, and prioritize roster need.
 *     Deterministic top-of-rank doesn't capture any of that.
 *   - The modal-survivor-across-trials is a much more honest "what's
 *     likely to be there" than the deterministic primary.
 *   - Confidence becomes a real probability (% of trials this player
 *     was the user's top option) instead of a linear taper.
 *
 * v3 candidates:
 *   - Use opponent_characterizations to differentiate the per-opponent
 *     preference distribution (win-now opponents skip rookies, etc.)
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

// Monte Carlo trial count. Per assumption-auditor 2026-04-23 HIGH:
// 50 trials gave a binomial SE of ~6-7pp at p≈0.5, which is wider
// than the survival-pct buckets we care about and let two refreshes
// flip the modal primary. Bumped to 500 (SE ~2pp at p=0.5; ~1.5pp
// at p=0.78). Per-trial cost is O(picks × opponents), so 500 trials
// is ~25k ops per buildMultiPickPlan, still negligible against the
// LLM calls elsewhere on the page.
const MONTE_CARLO_TRIALS = 500;
// Top-K window from which opponents sample within a position.
// DIRECTIONAL PRIOR: K=5 reflects the dynasty community observation
// that opponents reach 1-2 tiers regularly but rarely drop 5+ ranks.
// Not measured against held-out mock data; revisit when calibration
// data is available (per audit MEDIUM #4).
const SAMPLE_WINDOW_SIZE = 5;
// Softmax sharpness for the within-position sampling. Higher =
// closer to "always pick top of pool"; lower = more uniform across
// the window. DIRECTIONAL PRIOR: 1.5 is a moderate prior that
// respects the rank order without making it deterministic. Not
// fitted to data.
const SOFTMAX_TEMP = 1.5;

/**
 * Mulberry32 PRNG. We seed deterministically from the input snapshot
 * so two refreshes of the same draft state produce the same modal
 * primary, instead of nondeterministically flipping (per audit
 * 2026-04-23 HIGH).
 */
function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  // FNV-1a 32-bit; collision-tolerant since we only need stability,
  // not cryptographic uniqueness.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Confidence band buckets for the survival % displayed to users. The
 * raw point estimate (e.g. 78%) carries false precision against ~3
 * layers of unmeasured prior; bucketing aligns the forecast voice
 * with the system-prompt confidence vocabulary (lock / lean /
 * coin-flip / fade) and prevents users from over-reading deciles.
 * Per audit 2026-04-23 HIGH.
 */
function survivalBucket(pct: number): {
  label: string;
  hint: string;
} {
  if (pct >= 0.85) return { label: "lock", hint: "very likely available" };
  if (pct >= 0.65) return { label: "lean", hint: "likely available" };
  if (pct >= 0.45) return { label: "coin-flip", hint: "roughly even odds" };
  if (pct >= 0.25)
    return { label: "fade", hint: "more often gone than not" };
  return { label: "fade", hint: "usually gone by your pick" };
}

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

  // Sort once by dynasty rank (lower = better). Each Monte Carlo
  // trial works against a copy of this list.
  const sorted = [...available].sort(
    (a, b) => a.dynasty_rank - b.dynasty_rank,
  );

  // Seeded PRNG keyed by the draft state. Same input -> same modal
  // primary across hot reloads. Per audit 2026-04-23 HIGH.
  const seedKey = [
    snap.league_id,
    String(snap.draft.next_pick_no ?? 0),
    String(snap.draft.picks_made.length),
    schedule.map((s) => `${s.round}.${s.pick_no}`).join(","),
    sorted
      .slice(0, 40)
      .map((p) => p.id)
      .join(","),
  ].join("|");
  const rng = createRng(hashString(seedKey));

  const picksToProject = Math.min(schedule.length, MAX_PICKS_PROJECTED);
  // Tally per user-pick: how many trials picked each player as the
  // user's primary. Modal player (highest count) becomes the surfaced
  // primary; survival % becomes the confidence basis.
  const trialPicks: Array<Map<string, number>> = Array.from(
    { length: picksToProject },
    () => new Map<string, number>(),
  );
  // Track which player ids belong to which AvailablePlayer so the
  // aggregator can produce metadata-rich primaries + alts at the end.
  const playerById = new Map(sorted.map((p) => [p.id, p]));

  for (let trial = 0; trial < MONTE_CARLO_TRIALS; trial++) {
    const pool = [...sorted];
    for (let i = 0; i < picksToProject; i++) {
      if (pool.length === 0) break;
      const slot = schedule[i];
      // User picks the top of pool deterministically (we're modeling
      // the OPTIMAL user, the engine's recommendation; opponent
      // randomness is what we sample). Record the pick for the tally.
      const primary = pool[0];
      const tally = trialPicks[i];
      tally.set(primary.id, (tally.get(primary.id) ?? 0) + 1);
      pool.shift();

      // Stochastic opponent picks for the gap.
      const next = schedule[i + 1];
      if (!next) break;
      const opponentPicksBetween = Math.max(0, slot.gap_to_next);
      for (let j = 0; j < opponentPicksBetween && pool.length > 0; j++) {
        const targetPos = sampleOpponentPosition(drainWeights, rng);
        const removed = sampleOpponentPlayer(pool, targetPos, rng);
        if (removed) {
          const idx = pool.indexOf(removed);
          if (idx >= 0) pool.splice(idx, 1);
        }
      }
    }
  }

  // Aggregate trials into final per-pick recommendations.
  const picks: MultiPickEntry[] = [];
  const positionCounts = new Map<string, number>();
  for (let i = 0; i < picksToProject; i++) {
    const tally = trialPicks[i];
    const slot = schedule[i];
    const ranked = Array.from(tally.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({
        player: playerById.get(id),
        count,
      }))
      .filter((x): x is { player: AvailablePlayer; count: number } =>
        Boolean(x.player),
      );
    if (ranked.length === 0) break;

    const primaryEntry = ranked[0];
    const survivalPct = primaryEntry.count / MONTE_CARLO_TRIALS;
    const confidence: "high" | "medium" | "directional" =
      i < HIGH_CONFIDENCE_PICKS || survivalPct >= 0.7
        ? "high"
        : survivalPct >= 0.4
          ? "medium"
          : "directional";
    const altCount =
      confidence === "high" ? 1 : confidence === "medium" ? 2 : MAX_ALTS;
    const alts = ranked.slice(1, 1 + altCount);

    picks.push({
      pick_label: slot.pick_label,
      pick_no: slot.pick_no,
      picks_until: i === 0 ? 0 : slot.pick_no - schedule[0].pick_no,
      primary: {
        name: primaryEntry.player.name,
        position: primaryEntry.player.position ?? "?",
        team: primaryEntry.player.team,
        age: primaryEntry.player.age,
        reason: reasonFor(primaryEntry.player, i, survivalPct),
      },
      alternates: alts.map((a) => ({
        name: a.player.name,
        position: a.player.position ?? "?",
        team: a.player.team,
        age: a.player.age,
      })),
      confidence,
    });

    const pos = primaryEntry.player.position;
    if (pos) {
      positionCounts.set(pos, (positionCounts.get(pos) ?? 0) + 1);
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
 * Sample which position the next opponent will draft, weighted by
 * drainWeights. Pure stochastic; no deficit-tracking memory between
 * calls (the law of large numbers + N=50 trials handles convergence).
 */
function sampleOpponentPosition(
  weights: Record<string, number>,
  rng: () => number,
): string {
  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  if (total <= 0) return "WR"; // degenerate fallback
  let r = rng() * total;
  for (const [pos, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return pos;
  }
  return "WR"; // shouldn't reach; satisfies type
}

/**
 * Sample a player from the top of the pool at a given position using
 * softmax-weighted draws across SAMPLE_WINDOW_SIZE candidates. Top of
 * pool is most likely to be picked but not certain; lower temp ->
 * sharper toward top, higher temp -> more uniform. Falls back to
 * top-of-pool when the position has no candidates in the window.
 */
function sampleOpponentPlayer(
  pool: AvailablePlayer[],
  position: string,
  rng: () => number,
): AvailablePlayer | null {
  const positional = pool.filter(
    (p) => (p.position ?? "?").toUpperCase() === position,
  );
  if (positional.length === 0) {
    // No one at this position; opponent reaches across to next-best
    // overall. Models the "best player available" reach pattern.
    return pool[0] ?? null;
  }
  const window = positional.slice(0, SAMPLE_WINDOW_SIZE);
  // Softmax weights: rank 0 (top of window) gets highest weight,
  // descending. weight = exp(-rank / temp) so temp=1.5 gives ~50/30/15/3/2.
  const weights = window.map((_, i) => Math.exp(-i / SOFTMAX_TEMP));
  const totalW = weights.reduce((s, v) => s + v, 0);
  let r = rng() * totalW;
  for (let i = 0; i < window.length; i++) {
    r -= weights[i];
    if (r <= 0) return window[i];
  }
  return window[0];
}

function reasonFor(
  p: AvailablePlayer,
  pickIndex: number,
  survivalPct: number,
): string {
  // Reason copy uses confidence buckets (lock / lean / coin-flip /
  // fade) instead of raw percentages. Per audit 2026-04-23 HIGH:
  // raw deciles overstate model precision against unmeasured priors,
  // and brand vocabulary in system-prompt.ts mandates these buckets.
  if (pickIndex === 0) {
    return `Best available (${p.position ?? "?"}, dynasty rank ${Math.round(p.dynasty_rank)}).`;
  }
  const ageNote = p.age != null ? `, age ${p.age}` : "";
  const bucket = survivalBucket(survivalPct);
  return `${capitalize(bucket.label)}: ${bucket.hint} at this slot (${p.position ?? "?"}-${p.team ?? "?"}${ageNote}).`;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
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
