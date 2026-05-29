/**
 * Canonical per-request league context builder.
 *
 * One snapshot, one set of values, one available pool, one startable-depth
 * annotation per request, consumed by every surface (the hub board, Coach,
 * and the /pick /trade /strategy decision endpoints). Before this builder,
 * each surface rebuilt the snapshot and re-derived strategy independently;
 * the decision endpoints ran a SECOND parallel strategy engine
 * (`inferStrategyFromRoster`) with `currentPickNo: null`, so they read a
 * different strategy than the board and ran blind to draft position. That
 * was Leak 2 in ARCHITECTURE_UNIFICATION_PLAN.md; Coach building its
 * snapshot without `lastSeasonStats + projections` was Leak 3.
 *
 * The builder is a thin composition of the existing canonicals, NOT a new
 * implementation of any of them:
 *   1. `buildStrategySnapshot` (snapshot, always enriched with
 *      lastSeasonStats + projections, so hub / Coach / endpoint parity is
 *      structural rather than per-caller discipline; closes Leak 3)
 *   2. `rankArchetypes` (archetype lean / drift / phase)
 *   3. `computeWindows` (win-now / future windows)
 *   4. `buildPricedPool` (realistic available pool + leaguewide values +
 *      value-calibrated startable / stable depth, annotated in place)
 *
 * Every consumer reads from this one builder so the snapshot, values, and
 * depth can never diverge between surfaces. Registered in
 * CANONICAL_SOURCES.md; the "no direct buildLeagueSnapshot" lint in
 * evals/anti-patterns.test.ts keeps new surfaces from reaching around it.
 */
import { buildStrategySnapshot } from "@/lib/strategy/league-state/strategy-snapshot";
import { rankArchetypes } from "@/lib/strategy/ranking/rank";
import {
  computeWindows,
  type WindowsResult,
} from "@/lib/strategy/windows/compute";
import {
  buildPricedPool,
  type PricedPool,
} from "@/lib/strategy/decision-synthesis/priced-pool";
import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type { RankedArchetype } from "@/lib/strategy/archetypes/schema";

/**
 * Inputs to the builder. Identical to `buildStrategySnapshot`'s args
 * (`{ league, rosters, users, draftState, mySleeperUserId }`); the
 * lastSeasonStats + projections enrichment is owned by the snapshot
 * wrapper, not the caller, so no surface can forget it.
 */
export type LeagueContextInputs = Parameters<typeof buildStrategySnapshot>[0];

export interface LeagueContext {
  snapshot: LeagueSnapshot;
  ranked: RankedArchetype[];
  windows: WindowsResult;
  /** Realistic available pool + leaguewide value maps. Snapshot is
   * already depth-annotated in place by `buildPricedPool`. */
  pricedPool: PricedPool;
}

/**
 * Build the one canonical context for a request. `buildPricedPool`
 * MUTATES the returned `snapshot` in place with startable / stable depth,
 * the same in-place contract the inline callers relied on.
 */
export async function buildLeagueContext(
  args: LeagueContextInputs,
): Promise<LeagueContext> {
  const snapshot = await buildStrategySnapshot(args);
  const ranked = rankArchetypes(snapshot);
  const windows = computeWindows(snapshot);
  const pricedPool = await buildPricedPool(snapshot);
  return { snapshot, ranked, windows, pricedPool };
}

/**
 * Strategy read for prompt / context surfaces, derived from the canonical
 * engine outputs (`computeWindows` + `rankArchetypes`). This is the
 * consumption that replaced `inferStrategyFromRoster`: a thin summary of
 * the same windows + archetype lean the board renders, never a parallel
 * derivation. The win-now share of the windows split maps to the lean;
 * the top ranked archetype names the path.
 */
export type StrategyRead = {
  state: "contender" | "rebuild" | "balanced" | "undetermined";
  confidence: number; // 0..1
  signals: string[];
};

// Win-now share thresholds (current_ratio is 0-100, win-now's share of
// win-now + future). At / above WIN_NOW_LEAN the build leans contender;
// at / below FUTURE_LEAN it leans rebuild; between, balanced.
const WIN_NOW_LEAN = 60;
const FUTURE_LEAN = 40;

export function summarizeStrategy(
  ranked: RankedArchetype[],
  windows: WindowsResult | null,
): StrategyRead {
  if (!windows) {
    return {
      state: "undetermined",
      confidence: 0,
      signals: ["Engine windows unavailable for this league yet"],
    };
  }
  const ratio = windows.current_ratio; // win-now share, 0..100
  const state: StrategyRead["state"] =
    ratio >= WIN_NOW_LEAN
      ? "contender"
      : ratio <= FUTURE_LEAN
        ? "rebuild"
        : "balanced";
  // Confidence scales with how far the split sits from a 50/50 coin flip.
  const confidence = Math.min(0.9, Math.abs(ratio - 50) / 50);

  const signals: string[] = [];
  signals.push(
    `Win-now ${Math.round(windows.win_now.score)} vs future ${Math.round(
      windows.future_value.score,
    )} (win-now share ${Math.round(ratio)}%)`,
  );
  const top = ranked[0];
  if (top) {
    signals.push(
      `Top archetype lean: ${top.archetype.name} (${Math.round(
        top.drift_score * 100,
      )}% drift${top.phase ? `, ${top.phase}` : ""})`,
    );
  }
  if (
    windows.drift_severity &&
    windows.drift_severity !== "none" &&
    windows.drift != null
  ) {
    signals.push(
      `Declared-window drift: ${windows.drift_severity} (${Math.round(
        windows.drift,
      )})`,
    );
  }
  return { state, confidence, signals };
}
