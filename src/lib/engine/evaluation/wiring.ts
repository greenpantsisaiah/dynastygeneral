/**
 * Live wiring of the rubric engine (CANONICAL).
 *
 * `evaluate()` is the rubric pipeline (per-position evaluators producing
 * a point estimate, variance band, evidence stack, market delta, and
 * confidence). It has been parked since the rubric shipped; this is the
 * first production caller. Per the Stage 2b finding (opportunity adds no
 * marginal forward-VALUE signal in the deep tier) and the read-only
 * unlock validation (draft capital is a real marginal projection signal,
 * residualized -0.40 for young), the wiring is intentionally narrow:
 *
 *   - DOES surface evaluate()'s output on rookie cards as PROJECTION
 *     CONTEXT (Layer-3 detail, honest about prior-driven cases).
 *   - DOES NOT feed evaluate() into the value scale (the FantasyCalc
 *     passthrough stays untouched, per the 2b verdict).
 *   - DOES NOT feed evaluate() into `synthesize` / decision scoring;
 *     that wiring needs the broader rubric signals (rb_role_tier, OL
 *     grades, scheme tags) to be populated first.
 *
 * Pure adapter: builds an EvaluationContext from already-fetched data
 * (player_signals row, team_signals row, KTC value, ADP, meta) and
 * calls `evaluate()`. No IO; all reads happen in the caller, which
 * batches them through `getPlayerSignalsMap()` and `getTeamSignalsMap()`.
 *
 * Registered in CANONICAL_SOURCES.md.
 */

import { evaluate } from ".";
import type { EvaluationContext, EvaluationOutput } from "./types";
import type { PlayerSignalsRowWide } from "@/lib/players/player-signals";
import type { TeamSignalsRow } from "@/lib/signals/schema";

export function evaluateForPlayer(args: {
  player_signals: PlayerSignalsRowWide | null;
  team_signals: TeamSignalsRow | null;
  ktc_value?: number | null;
  adp?: number | null;
  search_rank?: number | null;
  position?: string | null;
  age?: number | null;
  years_exp?: number | null;
}): EvaluationOutput | null {
  const position = (args.position ?? args.player_signals?.position ?? null);
  if (!position) return null;
  const ctx: EvaluationContext = {
    player: args.player_signals,
    team: args.team_signals,
    ktc_value: args.ktc_value ?? null,
    adp: args.adp ?? null,
    search_rank: args.search_rank ?? null,
    position,
    age: args.age ?? args.player_signals?.age ?? null,
    is_rookie: args.years_exp === 0,
    years_exp: args.years_exp ?? null,
    route_participation:
      args.player_signals?.route_participation_prior_year ?? null,
  };
  return evaluate(ctx);
}

/**
 * Heuristic for "is the rubric's read prior-driven for this player?"
 * True when the evidence stack is empty OR sums to a small absolute
 * contribution (the rubric had little signal to read). Surfaces an
 * honest caveat on rookie cards in the same shape as the inflection
 * calibration_note: a Bayesian-prior call should never read as
 * evidence-backed. The 1.0 threshold matches the rubric's lightest
 * evidence weights (a single weak signal); below it, the projection
 * is essentially the position's base rate.
 */
export function isRubricPriorDriven(out: EvaluationOutput | null): boolean {
  if (!out) return true;
  if (out.evidence_stack.length === 0) return true;
  const totalAbs = out.evidence_stack.reduce(
    (s, e) => s + Math.abs(e.contribution),
    0,
  );
  return totalAbs < 1.0;
}
