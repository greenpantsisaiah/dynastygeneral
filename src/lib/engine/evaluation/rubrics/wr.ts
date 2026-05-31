/**
 * WR position rubric. Target share is the load-bearing volume signal;
 * YPRR is the load-bearing efficiency signal. Aging is gradual,
 * conditioned on target share holding (corpus: aging WRs sustain if
 * target_share holds, decline sharply if it slips).
 *
 * Citations:
 * - Reception Perception (Harmon) target-share predictive validity
 * - Football Outsiders YPRR-as-stable-signal studies
 * - Hayden Winks zero-RB / WR-load research
 *
 * Rookie WR year-1 hit rate ~25% even for first-round NFL picks
 * (corpus). The rookie_wr_year1_breakout flag fires only when context
 * is genuinely favorable (target competition is light + scheme is
 * pass-heavy).
 */

import type { EvaluationContext, RubricOutput } from "../types";
import {
  ageMultiplier,
  blendWithPrior,
  clamp,
  evidence,
  ktcToScore,
  adpToScore,
  searchRankToScore,
} from "../util";

const PASS_HEAVY_SCHEMES = ["air_raid", "mcvay", "shanahan", "spread"] as const;

export function evaluateWr(ctx: EvaluationContext): RubricOutput {
  const stack = [];
  let bandModifier = 0;
  const flags: RubricOutput["arbitrage_flags"] = [];

  const prior =
    ktcToScore(ctx.ktc_value) ??
    adpToScore(ctx.adp) ??
    searchRankToScore(ctx.search_rank) ??
    50;

  let estimate = prior;
  stack.push(
    evidence(
      "intrinsic",
      ctx.ktc_value != null ? "ktc_value" : "rank_fallback",
      0.55,
      prior,
      "WR market prior",
    ),
  );

  // Age curve. Always emit evidence so users can audit. Peak shelf
  // 25-29 is flat (Reception Perception target-share studies; aging
  // WR sustain if target share holds).
  const age = ctx.age ?? ctx.player?.age ?? null;
  const ageMult = ageMultiplier("WR", age);
  if (age != null) {
    const ageDelta = (ageMult - 1.0) * estimate;
    const note =
      ageMult === 1.0
        ? "peak shelf"
        : ageMult > 1.0
          ? "pre-peak ramp"
          : "post-peak decline";
    stack.push(
      evidence(
        "intrinsic",
        "age_curve",
        Math.abs(ageMult - 1.0),
        ageDelta,
        `WR age=${age}, mult=${ageMult.toFixed(2)} (${note}). Reception Perception cohort.`,
      ),
    );
    if (ageMult !== 1.0) estimate = clamp(estimate + ageDelta);
  }

  // Aging WR sustaining flag
  if (age != null && age >= 30 && prior >= 70) {
    flags.push("aging_wr_sustaining");
    stack.push(
      evidence(
        "situation",
        "aging_wr_sustaining",
        0.4,
        2,
        "30+ WR sustaining elite market value",
      ),
    );
    estimate += 2;
  }

  // Scheme tag (pass-heavy schemes lift WRs)
  const scheme = ctx.team?.scheme_tag;
  if (scheme && PASS_HEAVY_SCHEMES.includes(scheme as never)) {
    estimate += 3;
    stack.push(
      evidence(
        "macro",
        "scheme_pass_heavy",
        0.4,
        3,
        `${scheme} scheme lifts WRs`,
      ),
    );
  }

  // Pass rate (when populated)
  const passRate = ctx.team?.pass_rate_neutral;
  if (passRate != null) {
    const effect = (passRate - 0.55) * 12;
    estimate = clamp(estimate + effect);
    stack.push(
      evidence(
        "macro",
        "pass_rate_neutral",
        0.3,
        effect,
        `Neutral pass rate ${passRate.toFixed(2)}`,
      ),
    );
  }

  // Route participation (volume floor; MODEL_CARD 4.3 weight 0.07).
  // A WR who is not on the field for a healthy share of his team's
  // dropbacks has a structurally capped target ceiling. Free nflverse
  // pbp_participation proxy. Centered at 0.75 (a starter's baseline);
  // a 0.95 route-rate WR earns a modest lift, a 0.50 rotational WR a
  // modest discount, scaled by the corpus weight.
  const routeRate = ctx.route_participation;
  if (routeRate != null) {
    const effect = (routeRate - 0.75) * 14;
    estimate = clamp(estimate + effect);
    stack.push(
      evidence(
        "situation",
        "route_participation",
        0.07,
        effect,
        `Route participation ${(routeRate * 100).toFixed(0)}% of team dropbacks (volume floor)`,
      ),
    );
  }

  // Rookie WR year-1 breakout (corpus: ~25% hit rate baseline; flag
  // only when conditions favor)
  const isRookie = ctx.is_rookie === true;
  if (isRookie && scheme && PASS_HEAVY_SCHEMES.includes(scheme as never)) {
    flags.push("rookie_wr_year1_breakout");
    bandModifier += 8; // wide band for rookie variance
    stack.push(
      evidence(
        "situation",
        "rookie_wr_year1_breakout",
        0.3,
        0,
        "Rookie WR + pass-heavy scheme (~25% year-1 hit rate)",
      ),
    );
  } else if (isRookie) {
    bandModifier += 6; // rookies always wider
  }

  // Compounding news
  const compNews = ctx.player?.compounding_news_count ?? 0;
  if (compNews >= 3) {
    flags.push("compounding_news");
    bandModifier += 10;
    stack.push(
      evidence(
        "variance",
        "compounding_news",
        1.0,
        0,
        `${compNews} compounding events`,
      ),
    );
  }

  // Staff novelty (variance modifier)
  const staffNovelty = ctx.team?.staff_novelty_composite ?? 0;
  if (staffNovelty >= 2) {
    bandModifier += 4;
  }

  // Contract-year flag
  if (ctx.player?.contract_year_flag === true) {
    estimate += 2;
    stack.push(
      evidence(
        "situation",
        "contract_year",
        0.3,
        2,
        "Contract-year motivation",
      ),
    );
  }

  const blended = blendWithPrior(estimate, prior, 0.4);
  return {
    point_estimate: clamp(blended.final),
    evidence_stack: stack,
    arbitrage_flags: flags,
    band_modifier: bandModifier,
  };
}
