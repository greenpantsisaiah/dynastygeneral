/**
 * The one value seam (CANONICAL). Every surface that scores a player reads
 * its number through this module, so the whole product flips from the market
 * value to the rubric projection at ONE point (`VALUE_MODE`).
 *
 * This is a LIGHT module on purpose: it depends only on `values`,
 * `enriched-player`, and `evaluation/wiring`, none of which import the
 * decision/strategy modules. That lets low-level callers (the LLM
 * trade-pricing contract in `engine/llm-contract.ts`) read the seam without a
 * circular import through `decision-synthesis/priced-pool` ->
 * `engine/roster-fit` -> `engine/llm-contract`. `priced-pool` re-exports these
 * names so its existing importers are unchanged.
 *
 *   - "market" (the SHADOW default): the scoring number is `v.value`
 *     LITERALLY, byte-identical to the pre-seam FantasyCalc passthrough.
 *   - "rubric": the scoring number is `evaluate().point_estimate`, which
 *     blends back to the market prior when signals are absent (never garbage).
 *
 * Flipping `VALUE_MODE` is the ONLY number-changing step and ships as its own
 * gated PR (canon-keeper + assumption-auditor + snapshot-diff fixtures +
 * founder eyeball; MODEL_LIVE_PLAN Phase D, FORWARD_EV_PLAN Stage 3a).
 *
 * Registered in CANONICAL_SOURCES.md under "Priced decision pool".
 */
import { resolvePlayerValues, type PlayerValue } from "@/lib/players/values";
import { resolveEnrichedPlayers } from "@/lib/players/enriched-player";
import {
  evaluateForPlayer,
  isRubricPriorDriven,
} from "@/lib/engine/evaluation/wiring";
import type { EvaluationOutput } from "@/lib/engine/evaluation/types";

export type ValueMode = "market" | "rubric";
// FLIPPED to "rubric" 2026-06-19 (the value-pipe Phase 4 gate). The live
// board value is now `evaluate().point_estimate`: the four position
// rubrics blended with the FantasyCalc market prior at DEFAULT_PRIOR_WEIGHT
// (0.55, market-dominant). FantasyCalc remains the internal prior; it is no
// longer the leaf value any surface reads. Gated by: the value-flip diff
// (scripts/value-flip-diff.ts, founder-eyeballed, movers compressed after
// the prior-weight + TE-noise + cliff-breaker adjustments), dynasty-canon-
// keeper CRITIQUE (GO-with-adjustments), and dynasty-assumption-auditor
// (GO-with-adjustments). To revert in an incident, set this back to
// "market": the seam returns `v.value` byte-identically (the shadow path
// is still wired and tested).
export const VALUE_MODE: ValueMode = "rubric";

/**
 * Select the scoring value for one player through the seam. The market
 * branch returns `v.value` LITERALLY (ignores `out`, no arithmetic), so it
 * is float-identical to the pre-seam value; the rubric branch returns the
 * rubric point estimate, falling back to the market value when the rubric
 * produced nothing (unknown position).
 */
export function scoringValueFor(
  v: PlayerValue,
  out: EvaluationOutput | null,
  mode: ValueMode,
): number {
  if (mode === "market") return v.value;
  return out?.point_estimate ?? v.value;
}

/**
 * The seam for value sites that are NOT the priced pool (trade pricing,
 * class strength, draft-paths fallback, after-action). Given a set of ids
 * (and optionally a pre-fetched FantasyCalc value map), resolves the rubric
 * inputs once, runs `evaluate()` per id, and returns the scoring number
 * through the SAME `scoringValueFor` seam so every surface flips together.
 *
 * In shadow mode (`VALUE_MODE === "market"`) `valueById[id]` is byte-identical
 * to the FantasyCalc `v.value`, so a site routed through this helper has zero
 * behavior change. `valueMap` is returned so callers that also need the market
 * fields (overall_rank / position_rank for trade pricing) read them off the
 * same fetch without a second FantasyCalc round-trip. When `valueMap` is
 * supplied (e.g. the priced pool already fetched it), no FantasyCalc fetch
 * happens here; the format flags are then unused. The output is scoped to
 * `ids`: a supplied valueMap may be a SUPERSET (the all-rosters-plus-available
 * pool), so only the requested ids land in the returned records.
 */
export async function scoringValueByIds(args: {
  ids: readonly string[];
  valueMap?: Map<string, PlayerValue>;
  isSuperflex: boolean;
  isPpr: boolean;
  isHalfPpr: boolean;
  isTePremium?: boolean;
}): Promise<{
  valueById: Record<string, number>;
  valueMap: Map<string, PlayerValue>;
  evaluationById: Record<string, EvaluationOutput>;
  priorDrivenById: Record<string, boolean>;
}> {
  const ids = [...new Set(args.ids)];
  const valueById: Record<string, number> = {};
  const evaluationById: Record<string, EvaluationOutput> = {};
  const priorDrivenById: Record<string, boolean> = {};

  const valueMap =
    args.valueMap ??
    (await resolvePlayerValues({
      ids,
      isSuperflex: args.isSuperflex,
      isPpr: args.isPpr,
      isHalfPpr: args.isHalfPpr,
      isTePremium: args.isTePremium,
    }));

  // Resolve rubric inputs only for the requested ids (a supplied valueMap
  // may be a superset; do not over-resolve the whole pool). Best-effort: an
  // enrichment failure degrades to market-only scoring (the pre-seam path).
  const enriched = await resolveEnrichedPlayers({
    playerIds: ids,
    valueMap,
  }).catch((err) => {
    console.error(
      "[scoring-value:enriched]",
      err instanceof Error ? `${err.message}\n${err.stack}` : err,
    );
    return new Map<string, never>();
  });

  // Scope to the requested ids. A supplied valueMap may be a superset (the
  // pool prices all rosters + available); only the requested ids land here.
  for (const id of ids) {
    const v = valueMap.get(id);
    if (!v) continue;
    const e = enriched.get(id);
    const out = e
      ? evaluateForPlayer({
          player_signals: e.signals,
          team_signals: e.team_signals,
          ktc_value: e.ktc_value,
          adp: e.adp,
          search_rank: e.search_rank,
          position: e.position,
          age: e.age,
          years_exp: e.years_exp,
        })
      : null;
    valueById[id] = scoringValueFor(v, out, VALUE_MODE);
    if (out) {
      evaluationById[id] = out;
      priorDrivenById[id] = isRubricPriorDriven(out);
    }
  }

  return { valueById, valueMap, evaluationById, priorDrivenById };
}
