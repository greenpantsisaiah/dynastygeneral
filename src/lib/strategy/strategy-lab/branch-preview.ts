/**
 * Per-archetype branch preview. "If you commit to this archetype, here
 * is the chain of picks across your next 3-4 slots." Deterministic so
 * the projection doesn't flip across refreshes. The best-overall
 * (non-branch-conditional) projection lives in the Decision card's
 * Next Picks Plan, not here.
 *
 * Method:
 *   1. Identify the archetype's primary position (QB / RB / WR / TE)
 *      via the same inference used by player-suggestions/enrich.
 *   2. Walk the user's pick schedule (cap MAX_PICKS_PROJECTED).
 *   3. At each user pick: pick the best available player at the
 *      archetype's primary position from the current pool. Saturation
 *      kicks in after the user has accumulated SATURATION_THRESHOLD
 *      picks at that position, after which we fall back to best
 *      available overall (the archetype's own logic mirrors this:
 *      QB Cartel transitions from "stack QBs" to "fill skill" once
 *      two QBs are banked).
 *   4. Between user picks: greedily remove `gap_to_next` players from
 *      the top of the pool (dynasty-rank order). Conservative: real
 *      opponents reach lower than #1 sometimes, but for "shape of the
 *      chain" the top-down drain captures the ADP gravity well.
 *   5. Tag each projected pick with `source: "primary"` (took from the
 *      archetype's position) or `source: "spillover"` (saturated;
 *      took best available).
 *
 * Why deterministic and not Monte Carlo: this is a hypothetical chain,
 * not a probability claim. "If you go this archetype, here's the
 * projected next 3 picks" reads better when stable than when each
 * refresh suggests a different player.
 *
 * Why this lives in strategy-lab/ and not in archetypes/: the engine
 * doesn't change. This is a UI-tier projection that consumes engine
 * output and produces a renderable chain.
 */

import type { Archetype } from "@/lib/strategy/archetypes/schema";
import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type { AvailablePlayer } from "@/lib/players/available";

export type BranchPreviewPick = {
  pick_label: string;
  pick_no: number;
  // Picks made by the league between "now" and this pick.
  picks_until: number;
  // The user's projected pick at this slot. Null when the pool is
  // exhausted at the archetype's position AND we're not yet in
  // spillover (rare; only on tiny pools / late drafts).
  player: {
    name: string;
    position: string | null;
    team: string | null;
    age: number | null;
    is_rookie: boolean;
    rank: number;
  } | null;
  // 1-2 alternates the user could take instead. Ordered by dynasty rank.
  alternates: Array<{
    name: string;
    position: string | null;
    team: string | null;
    age: number | null;
  }>;
  // "primary" = took from archetype's primary position pool.
  // "spillover" = primary saturated or empty; took best overall.
  source: "primary" | "spillover";
};

export type BranchPreview = {
  archetype_id: string;
  archetype_name: string;
  // Primary position the archetype leans on. Null for non-position
  // archetypes (Roster Construction, Asset / Pick Strategy); those
  // get a spillover-only chain.
  primary_position: string | null;
  picks: BranchPreviewPick[];
  // 1-sentence narrative summarizing the chain. Templated; not LLM.
  thread: string;
};

// Past pick 4 the projection is too speculative to render as a chain
// (per assumption-auditor 2026-04-23: top-6 stability collapses past
// pick 7).
const MAX_PICKS_PROJECTED = 4;
// After the user has banked this many picks at the archetype's primary
// position, switch to spillover. Mirrors the engine's PUSH-vs-EXECUTE
// transition: a QB Cartel build with 2 QBs is now executing, not
// acquiring more QBs.
const SATURATION_THRESHOLD = 2;
// Number of alternates surfaced per pick.
const ALTERNATES_PER_PICK = 2;

/**
 * Map an archetype id/category to its primary position. Mirrors
 * `inferPrimaryPosition` in player-suggestions/enrich.ts; kept inline
 * to avoid coupling the strategy-lab module to that path. If the two
 * implementations drift, the divergence will surface as branch-preview
 * picks not matching the surfaced top_candidates, which is loud enough
 * to be caught.
 */
function inferPrimaryPosition(
  archetypeId: string,
  category: string,
): string | null {
  if (archetypeId.startsWith("qb-") || category === "Positional Leverage")
    return "QB";
  if (archetypeId.startsWith("wr-") || category === "WR Strategy") return "WR";
  if (archetypeId.startsWith("rb-") || category === "RB Strategy") return "RB";
  if (archetypeId.startsWith("te-") || category === "TE Strategy") return "TE";
  return null;
}

/**
 * How many picks the user has already banked at this position. Drives
 * the saturation flip from primary to spillover.
 */
function ownedAtPosition(
  snap: LeagueSnapshot,
  position: string,
): number {
  const me = snap.rosters.find((r) => r.is_me);
  if (!me) return 0;
  return me.position_counts[position as keyof typeof me.position_counts] ?? 0;
}

export function buildBranchPreview(args: {
  archetype: Archetype;
  snap: LeagueSnapshot;
  available: AvailablePlayer[];
}): BranchPreview | null {
  const { archetype, snap, available } = args;
  const schedule = snap.draft.my_pick_schedule;
  if (schedule.length === 0) return null;
  if (available.length === 0) return null;

  const primaryPos = inferPrimaryPosition(archetype.id, archetype.category);
  // Sort once. Each step shifts off the front and filters by position.
  const pool = [...available].sort(
    (a, b) => a.dynasty_rank - b.dynasty_rank,
  );

  const picksToProject = Math.min(schedule.length, MAX_PICKS_PROJECTED);
  let pickedAtPrimary = primaryPos
    ? ownedAtPosition(snap, primaryPos)
    : SATURATION_THRESHOLD;

  const picks: BranchPreviewPick[] = [];

  for (let i = 0; i < picksToProject; i++) {
    if (pool.length === 0) break;
    const slot = schedule[i];

    // Decide source: primary if (a) we have a primary position AND
    // (b) we haven't saturated yet AND (c) the position has at least
    // one candidate left in the pool.
    const useSpillover =
      !primaryPos ||
      pickedAtPrimary >= SATURATION_THRESHOLD ||
      !pool.some(
        (p) => (p.position ?? "").toUpperCase() === primaryPos,
      );

    const source: "primary" | "spillover" = useSpillover
      ? "spillover"
      : "primary";

    // Pull candidates: full pool for spillover, position-filtered for
    // primary. Take 1 + ALTERNATES_PER_PICK from the top of the
    // candidate slice.
    const candidatePool = useSpillover
      ? pool
      : pool.filter(
          (p) => (p.position ?? "").toUpperCase() === primaryPos,
        );
    const top = candidatePool.slice(0, 1 + ALTERNATES_PER_PICK);
    if (top.length === 0) {
      picks.push({
        pick_label: slot.pick_label,
        pick_no: slot.pick_no,
        picks_until: i === 0 ? 0 : slot.pick_no - schedule[0].pick_no,
        player: null,
        alternates: [],
        source,
      });
      continue;
    }

    const primary = top[0];
    const alts = top.slice(1).map((a) => ({
      name: a.name,
      position: a.position,
      team: a.team,
      age: a.age,
    }));

    picks.push({
      pick_label: slot.pick_label,
      pick_no: slot.pick_no,
      picks_until: i === 0 ? 0 : slot.pick_no - schedule[0].pick_no,
      player: {
        name: primary.name,
        position: primary.position,
        team: primary.team,
        age: primary.age,
        is_rookie: primary.is_rookie,
        rank: Math.round(primary.dynasty_rank),
      },
      alternates: alts,
      source,
    });

    // Remove the user's pick from the pool.
    const idx = pool.findIndex((p) => p.id === primary.id);
    if (idx >= 0) pool.splice(idx, 1);

    if (source === "primary") pickedAtPrimary++;

    // Deplete pool for opponent picks until the next user slot.
    const next = schedule[i + 1];
    if (!next) break;
    const opponentPicks = Math.max(0, slot.gap_to_next);
    // Greedy top-of-pool drain. Approximates "opponents take the best
    // available." Real opponents reach lower sometimes, but for "what
    // shape does the chain take" the top-down drain captures the
    // dominant ADP gravity well.
    pool.splice(0, Math.min(opponentPicks, pool.length));
  }

  if (picks.length === 0) return null;

  return {
    archetype_id: archetype.id,
    archetype_name: archetype.name,
    primary_position: primaryPos,
    picks,
    thread: buildThread(picks, primaryPos, archetype.name),
  };
}

function buildThread(
  picks: BranchPreviewPick[],
  primaryPos: string | null,
  archetypeName: string,
): string {
  const named = picks.filter((p) => p.player !== null);
  if (named.length === 0) return "";
  const first = named[0];
  const last = named[named.length - 1];
  const posSeq = named
    .map((p) => p.player?.position ?? "?")
    .join(" / ");
  const spilloverIdx = picks.findIndex((p) => p.source === "spillover");

  const head = `Commit to ${archetypeName}: ${first.player?.name} at ${first.pick_label}, then ${posSeq} through ${last.pick_label}.`;
  const tail =
    spilloverIdx > 0 && primaryPos
      ? ` ${primaryPos} saturates by ${picks[spilloverIdx].pick_label}; chain spills into best-available from there.`
      : "";
  return `${head}${tail}`;
}
