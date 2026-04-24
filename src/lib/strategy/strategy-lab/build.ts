/**
 * Strategy Lab builder. Composes archetype rankings + opponent
 * characterizations + the available pool into the Lab state shown on
 * the league hub during early-to-mid draft.
 *
 * Design notes:
 * - We DO NOT re-derive strategy. rankArchetypes is the engine; this
 *   module just reshapes its output for the Lab surface.
 * - The Lab is "always on" but `prominent` flips true when the user
 *   has fewer than ~3 picks made OR when meaningful path-state
 *   transitions just landed (currently a heuristic on user pick
 *   count; v2 could compare against a previous snapshot).
 * - Counter-position notes only fire when (a) the room has a clear
 *   majority lean and (b) THIS path runs against it. The killer use
 *   case from founder note: 8 of 12 opponents went win-now, the Lab
 *   says "future window is wide open" on the future archetypes.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type { RankedArchetype } from "@/lib/strategy/archetypes/schema";
import type { OpponentCharacterization } from "@/lib/strategy/opponents/characterize";
import type { AvailablePlayer } from "@/lib/players/available";
import type {
  StrategyLabAnchor,
  StrategyLabLeaguePulse,
  StrategyLabPath,
  StrategyLabPathState,
  StrategyLabState,
} from "./types";
import { buildBranchPreview } from "./branch-preview";

// Viability bands. Aligned with the Decision-card and Contender
// thresholds so a "closing" Lab path doesn't read as a "lock" anywhere
// else. Ranges are derived from RankedArchetype.total_score (0..1)
// scaled to 0..100.
const VIABILITY_OPEN = 65;
const VIABILITY_NARROWING = 45;
const VIABILITY_CLOSING = 25;
// At pickCount <= this, the Lab is the dominant surface. Above this
// the Decision card carries the load and the Lab moves into context
// mode.
const PROMINENT_PICK_THRESHOLD = 3;
// Minimum opponent count before we'll claim a counter-position
// majority. Below this the room is too small to draw a conclusion.
const MIN_OPPONENTS_FOR_PULSE = 6;
// When >= this fraction of opponents lean one way, call it.
const PULSE_MAJORITY = 0.6;

export function buildStrategyLab(args: {
  snap: LeagueSnapshot;
  ranked: RankedArchetype[];
  available: AvailablePlayer[];
  opponentCharacterizations: OpponentCharacterization[];
}): StrategyLabState {
  const { snap, ranked, available, opponentCharacterizations } = args;

  // User's picks-made count drives prominence. From the user's roster
  // in the snapshot. Falls back to 0 when no roster (anonymous viewer).
  const me = snap.rosters.find((r) => r.is_me);
  const myPicksMade = me?.player_ids?.length ?? 0;

  const availableById = new Map(available.map((p) => [p.id, p]));
  const userNextPickNo =
    snap.draft.my_pick_schedule[0]?.pick_no ?? snap.draft.next_pick_no ?? 0;

  const pulse = buildLeaguePulse(opponentCharacterizations);

  // Take top 6 archetypes by total_score. Strategy Lab surfaces 4-5;
  // the extra two give the renderer slack for filtering closed ones.
  const paths: StrategyLabPath[] = ranked
    .slice(0, 6)
    .map((r) =>
      buildPath(r, availableById, available, snap, userNextPickNo, pulse),
    )
    .sort((a, b) => b.viability - a.viability);

  const prominent = myPicksMade <= PROMINENT_PICK_THRESHOLD;
  const prominenceReason = prominent
    ? promReason(myPicksMade, paths)
    : null;

  return {
    paths,
    league_pulse: pulse,
    prominent,
    prominence_reason: prominenceReason,
  };
}

function buildPath(
  r: RankedArchetype,
  availableById: Map<string, AvailablePlayer>,
  available: AvailablePlayer[],
  snap: LeagueSnapshot,
  userNextPickNo: number,
  pulse: StrategyLabLeaguePulse,
): StrategyLabPath {
  const anchors = (r.top_candidates ?? []).slice(0, 3).map(
    (c): StrategyLabAnchor => {
      const inPool = availableById.has(c.player_id);
      return {
        player_id: c.player_id,
        name: c.name,
        position: c.position,
        team: c.team,
        adp: c.adp,
        // Conservative: in pool means available NOW. ADP-projected-
        // gone is captured in expected_gone_by separately so the UI
        // can render "still here, but going at pick 8" nuance.
        available: inPool,
        expected_gone_by:
          c.adp != null && c.adp >= userNextPickNo - 5
            ? Math.round(c.adp)
            : null,
      };
    },
  );

  const availableAnchorCount = anchors.filter((a) => a.available).length;
  const baseViability = Math.round(r.total_score * 100);

  // If no anchors are available, the path is structurally closed
  // regardless of the engine score. Cap viability accordingly.
  const viability =
    availableAnchorCount === 0
      ? Math.min(baseViability, VIABILITY_CLOSING - 1)
      : availableAnchorCount === 1
        ? Math.min(baseViability, VIABILITY_NARROWING + 5)
        : baseViability;

  const state = stateForViability(viability, availableAnchorCount);
  const closes_if = buildClosesIf(anchors, userNextPickNo);
  const counter_position_note = buildCounterPositionNote(r, pulse, state);

  // Skip the projection on closed paths (no point projecting a chain
  // for an archetype the user can't commit to). Cheap; pure server
  // computation, no LLM call.
  const branch_preview =
    state === "closed"
      ? null
      : buildBranchPreview({
          archetype: r.archetype,
          snap,
          available,
        });

  return {
    archetype_id: r.archetype.id,
    archetype_name: r.archetype.name,
    archetype_tagline: r.archetype.tagline,
    viability,
    state,
    anchors,
    closes_if,
    counter_position_note,
    branch_preview,
  };
}

function stateForViability(
  viability: number,
  availableAnchors: number,
): StrategyLabPathState {
  if (availableAnchors === 0) return "closed";
  if (viability >= VIABILITY_OPEN) return "open";
  if (viability >= VIABILITY_NARROWING) return "narrowing";
  if (viability >= VIABILITY_CLOSING) return "closing";
  return "closed";
}

function buildClosesIf(
  anchors: StrategyLabAnchor[],
  userNextPickNo: number,
): string | null {
  const availableAnchors = anchors.filter((a) => a.available);
  if (availableAnchors.length === 0) return null;
  if (availableAnchors.length === 1) {
    const a = availableAnchors[0];
    if (a.adp != null && a.adp < userNextPickNo) {
      return `Closes if ${a.name} (ADP ${Math.round(a.adp)}) gets sniped before your slot`;
    }
    return `Last anchor: ${a.name}`;
  }
  // Multiple anchors. Closure rule = top two getting picked.
  const top2 = availableAnchors.slice(0, 2);
  return `Closes if ${top2[0].name} AND ${top2[1].name} both go before your next pick`;
}

function buildLeaguePulse(
  chars: OpponentCharacterization[],
): StrategyLabLeaguePulse {
  // Exclude the user's own characterization from pulse counts. The
  // user is asking "what is the room doing"; including themselves
  // muddies the answer.
  const opps = chars.filter((c) => !c.is_me);
  let winNow = 0;
  let winFuture = 0;
  let hybrid = 0;
  let totalSignal = 0;
  for (const c of opps) {
    // Confidence threshold: ignore opponents with weak signals (not
    // enough picks made yet OR roster shape is ambiguous). Without
    // this the pulse fires too early in the draft.
    if (c.confidence < 0.35) continue;
    totalSignal++;
    if (c.lean === "win_now" || c.lean === "lean_win_now") winNow++;
    else if (c.lean === "win_future" || c.lean === "lean_win_future")
      winFuture++;
    else hybrid++;
  }

  const headline = pulseHeadline({
    winNow,
    winFuture,
    hybrid,
    totalSignal,
  });

  return {
    win_now_count: winNow,
    win_future_count: winFuture,
    hybrid_count: hybrid,
    total_with_signal: totalSignal,
    headline,
  };
}

function pulseHeadline(args: {
  winNow: number;
  winFuture: number;
  hybrid: number;
  totalSignal: number;
}): string | null {
  const { winNow, winFuture, totalSignal } = args;
  if (totalSignal < MIN_OPPONENTS_FOR_PULSE) return null;
  const winNowFrac = winNow / totalSignal;
  const winFutureFrac = winFuture / totalSignal;
  if (winNowFrac >= PULSE_MAJORITY) {
    return `${winNow} of ${totalSignal} opponents are pushing win-now. The future window is wide open for you.`;
  }
  if (winFutureFrac >= PULSE_MAJORITY) {
    return `${winFuture} of ${totalSignal} opponents are building for the future. Win-now scarcity is on YOUR side this season.`;
  }
  return null;
}

function buildCounterPositionNote(
  r: RankedArchetype,
  pulse: StrategyLabLeaguePulse,
  state: StrategyLabPathState,
): string | null {
  if (state === "closed") return null;
  if (pulse.headline == null) return null;
  // Future-leaning archetypes counter-position a win-now-heavy room.
  // Horizon is a -100..+100 score: negative = rebuild, positive =
  // win-now. We use a moderate threshold to avoid mislabeling
  // balanced archetypes as one-or-the-other.
  const horizon = r.archetype.horizon;
  const isFuturePath = horizon <= -25;
  const isWinNowPath = horizon >= 25;

  if (
    pulse.win_now_count > pulse.win_future_count * 2 &&
    isFuturePath &&
    pulse.win_now_count >= MIN_OPPONENTS_FOR_PULSE * PULSE_MAJORITY
  ) {
    return `Counter-position: room is heavy win-now. This path threads a future window most opponents can't compete for.`;
  }
  if (
    pulse.win_future_count > pulse.win_now_count * 2 &&
    isWinNowPath &&
    pulse.win_future_count >= MIN_OPPONENTS_FOR_PULSE * PULSE_MAJORITY
  ) {
    return `Counter-position: room is building for later. This path takes the title NOW while opponents are saving for 2027.`;
  }
  return null;
}

function promReason(
  myPicksMade: number,
  paths: StrategyLabPath[],
): string {
  const openCount = paths.filter((p) => p.state === "open").length;
  if (myPicksMade === 0) {
    return `Pre-draft. ${openCount} strategic paths still open. Choose your needle.`;
  }
  if (myPicksMade === 1) {
    return `1 pick made. ${openCount} paths still viable.`;
  }
  return `${myPicksMade} picks in. ${openCount} paths still viable; the rest are narrowing.`;
}
