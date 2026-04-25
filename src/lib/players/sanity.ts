/**
 * Engine ranking sanity checks.
 *
 * Why this exists: a single seriously mis-ranked elite player breaks
 * trust the rest of the engine builds (per user feedback 2026-04-24:
 * even non-experts know LaPorta > Pitts; ranking them in the wrong
 * order casts doubt on every other call). The KTC/ADP/heuristic
 * cascade in strategic-forks.tsx fixes the LIVE rank ordering, but
 * we also want a backstop that VERIFIES the engine output against a
 * daily-cached consensus baseline and surfaces violations.
 *
 * Architecture: the FantasyCalc player-values cache (24h TTL) IS the
 * consensus baseline. Their `overallRank` field is the consensus
 * dynasty rank; their `positionRank` is the consensus position rank.
 * We validate that our `available` ordering broadly agrees with theirs
 * for the top of the board. Severe disagreements get logged and
 * surfaced in `?diagnose=1`. We don't auto-correct here (the rerank
 * cascade does that); this is observability, not enforcement.
 *
 * Per user clarification 2026-04-24: this is core architecture using
 * the existing daily-cached data, not request-generated. The cache
 * provides the baseline; this module provides the comparison.
 */

import type { AvailablePlayer } from "./available";
import type { PlayerValue } from "./values";

/**
 * One detected disagreement between engine ordering and consensus.
 * `engine_position` is the player's index in our sorted `available`
 * (0-based); `consensus_rank` is FantasyCalc's overallRank (1-based).
 * `delta` is the magnitude of the disagreement; positive means we
 * have them ranked LOWER than consensus does.
 */
export type SanityIssue = {
  player_id: string;
  name: string;
  position: string | null;
  engine_position: number; // 0-based index in our sorted available
  consensus_rank: number; // 1-based, from FantasyCalc overallRank
  delta: number; // engine_position+1 minus consensus_rank
  severity: "minor" | "notable" | "severe";
};

// Tolerance bands (delta = engine - consensus, both 1-based).
// Tighter at the top of the board where consensus is strongest.
//
// Top 12: tolerance 8. Past that the elite tier is very settled;
//   any 9+ slot disagreement is editorial.
// Top 50: tolerance 15. Mid-board has more legitimate disagreement
//   (positional valuation, age, breakout potential), so widen.
// Top 100: tolerance 25. Tail of the consensus zone.
// Past 100: skip; the consensus signal is too weak to validate.
const SANITY_LIMIT = 100;
function toleranceFor(consensusRank: number): number {
  if (consensusRank <= 12) return 8;
  if (consensusRank <= 50) return 15;
  return 25;
}

function severityFor(delta: number, tolerance: number): SanityIssue["severity"] {
  const abs = Math.abs(delta);
  if (abs >= tolerance * 2) return "severe";
  if (abs >= tolerance) return "notable";
  return "minor";
}

/**
 * Run sanity checks on the engine's `available` ordering against the
 * consensus baseline (FantasyCalc overallRank). Returns the list of
 * notable+severe disagreements; minor ones are filtered out as noise.
 *
 * Empty result = engine ordering broadly agrees with consensus. Any
 * notable result is worth surfacing in the ?diagnose=1 block. Any
 * severe result is worth a console warning so it shows up in Vercel
 * logs without the user opening diagnose.
 */
export function runRankingSanityChecks(args: {
  available: AvailablePlayer[];
  playerValues: Map<string, PlayerValue>;
}): SanityIssue[] {
  const { available, playerValues } = args;
  if (available.length === 0 || playerValues.size === 0) return [];

  const issues: SanityIssue[] = [];

  // Walk the top of our engine ordering. For each player who has a
  // consensus rank in the validation window, compare positions.
  const limit = Math.min(available.length, SANITY_LIMIT);
  for (let i = 0; i < limit; i++) {
    const p = available[i];
    const v = playerValues.get(p.id);
    if (!v || v.overall_rank == null) continue;
    if (v.overall_rank > SANITY_LIMIT) continue;
    const enginePosition = i + 1; // 1-based for symmetry with rank
    const delta = enginePosition - v.overall_rank;
    const tolerance = toleranceFor(v.overall_rank);
    if (Math.abs(delta) < tolerance) continue;
    issues.push({
      player_id: p.id,
      name: p.name,
      position: p.position,
      engine_position: enginePosition,
      consensus_rank: v.overall_rank,
      delta,
      severity: severityFor(delta, tolerance),
    });
  }

  // Sort severity descending so the worst issues land first; ties
  // broken by absolute delta.
  const sevWeight: Record<SanityIssue["severity"], number> = {
    severe: 3,
    notable: 2,
    minor: 1,
  };
  issues.sort((a, b) => {
    const sw = sevWeight[b.severity] - sevWeight[a.severity];
    if (sw !== 0) return sw;
    return Math.abs(b.delta) - Math.abs(a.delta);
  });

  return issues;
}

/**
 * Format a one-line summary for logging. Used by the hub route to
 * emit a server-log warning when severe issues exist.
 */
export function summarizeSanityIssues(issues: SanityIssue[]): string {
  if (issues.length === 0) return "ranking sanity: clean";
  const severe = issues.filter((i) => i.severity === "severe").length;
  const notable = issues.filter((i) => i.severity === "notable").length;
  const head = issues.slice(0, 3).map(
    (i) =>
      `${i.name} (${i.position}) engine #${i.engine_position} vs consensus #${i.consensus_rank} (delta ${i.delta >= 0 ? "+" : ""}${i.delta})`,
  );
  return `ranking sanity: ${severe} severe, ${notable} notable. Top: ${head.join("; ")}`;
}

/**
 * One detected MISSING player. Different question than SanityIssue:
 * presence vs ordering. A consensus top-100 player who is in neither
 * the available pool nor the drafted set is silently absent from the
 * engine's view. Severe class of bug per user 2026-04-25 (Sam LaPorta
 * incident): the Coach couldn't reason about LaPorta because he
 * wasn't in the snapshot, breaking trust on every downstream call.
 */
export type MissingPlayerIssue = {
  player_id: string;
  name: string;
  position: string | null;
  consensus_rank: number;
  raw_value: number;
};

/**
 * Walk the consensus baseline (FantasyCalc top-100 by overall_rank);
 * for each consensus player, verify they're either in `available` OR
 * in the drafted set. A consensus top-100 player in neither is
 * silently missing from the engine. Returns the missing list sorted
 * by consensus rank ascending so the most-egregious gaps come first.
 *
 * Complement to `runRankingSanityChecks`, which only validates
 * ordering of players already in the pool. The two checks together
 * cover both failure modes: wrong order vs wrong members.
 *
 * Empty result = engine pool is complete relative to consensus.
 * Any non-empty result is a hard alarm, not advisory; the hub
 * surfaces it as a danger banner so the user is never silently
 * misled by a partial pool.
 */
export function runCompletenessSanityChecks(args: {
  available: AvailablePlayer[];
  playerValues: Map<string, PlayerValue>;
  draftedIds: Set<string>;
}): MissingPlayerIssue[] {
  const { available, playerValues, draftedIds } = args;
  if (playerValues.size === 0) return [];
  const availableIds = new Set(available.map((p) => p.id));
  const issues: MissingPlayerIssue[] = [];
  for (const [pid, pv] of playerValues) {
    if (pv.overall_rank == null) continue;
    if (pv.overall_rank > SANITY_LIMIT) continue;
    if (availableIds.has(pid)) continue;
    if (draftedIds.has(pid)) continue;
    issues.push({
      player_id: pid,
      name: pv.name,
      position: pv.position,
      consensus_rank: pv.overall_rank,
      raw_value: pv.raw_value,
    });
  }
  issues.sort((a, b) => a.consensus_rank - b.consensus_rank);
  return issues;
}

export function summarizeCompletenessIssues(
  issues: MissingPlayerIssue[],
): string {
  if (issues.length === 0) return "completeness: clean";
  const head = issues
    .slice(0, 5)
    .map(
      (i) =>
        `${i.name} (${i.position}, consensus #${i.consensus_rank})`,
    );
  return `completeness: ${issues.length} top-100 player${issues.length === 1 ? "" : "s"} silently missing from pool. Top: ${head.join("; ")}`;
}
