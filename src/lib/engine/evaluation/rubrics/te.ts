/**
 * TE position rubric. 12-personnel rate is the load-bearing scheme
 * signal. OC tenure matters more for TE than other positions because
 * TE production is heavily scheme-coupled. Year-3 breakout is the
 * traditional pattern; the early-breakout arbitrage flag fires when a
 * TE shows year-1 or year-2 production AND a favorable 12-personnel
 * rate.
 *
 * Citations:
 * - Football Outsiders 12-personnel TE production studies
 * - PFF TE breakout cohort (year-3 modal)
 * - RESEARCH_CORPUS TE section: scheme_pace + OC continuity
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

export function evaluateTe(ctx: EvaluationContext): RubricOutput {
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
      0.5,
      prior,
      "TE market prior",
    ),
  );

  // Age curve. Always emit evidence. TE breakout window 24-27
  // (PFF TE breakout cohort; year-3 modal). Strong pre-breakout
  // discount through year 2 (rookie TEs rarely produce).
  const age = ctx.age ?? ctx.player?.age ?? null;
  const ageMult = ageMultiplier("TE", age);
  if (age != null) {
    const ageDelta = (ageMult - 1.0) * estimate;
    const note =
      ageMult === 1.0
        ? "post-breakout peak"
        : ageMult > 1.0
          ? "breakout window"
          : age < 24
            ? "pre-breakout"
            : "post-peak decline";
    stack.push(
      evidence(
        "intrinsic",
        "age_curve",
        Math.abs(ageMult - 1.0),
        ageDelta,
        `TE age=${age}, mult=${ageMult.toFixed(2)} (${note}). PFF TE breakout cohort.`,
      ),
    );
    if (ageMult !== 1.0) estimate = clamp(estimate + ageDelta);
  }

  // 12-personnel rate (the load-bearing TE signal)
  const personnel12 = ctx.team?.personnel_12_rate;
  if (personnel12 != null) {
    const effect = (personnel12 - 0.20) * 30;
    estimate = clamp(estimate + effect);
    stack.push(
      evidence(
        "macro",
        "personnel_12_rate",
        0.5,
        effect,
        `12-personnel rate ${(personnel12 * 100).toFixed(1)}% (corpus: load-bearing TE signal)`,
      ),
    );
  }

  // OC tenure (TE production is heavily scheme-coupled)
  const ocTenure = ctx.team?.oc_tenure_yrs;
  if (ocTenure != null) {
    if (ocTenure >= 3) {
      estimate += 4;
      stack.push(
        evidence(
          "situation",
          "oc_continuity_te",
          0.5,
          4,
          `Stable OC (${ocTenure} yrs) supports TE`,
        ),
      );
    } else if (ctx.team?.oc_first_year_with_team_flag === true) {
      bandModifier += 6;
      estimate -= 2;
      stack.push(
        evidence(
          "variance",
          "oc_first_year_te_penalty",
          1.0,
          -2,
          "First-year OC widens TE band, penalizes",
        ),
      );
    }
  }

  // TE early breakout flag (year-1 or year-2 with favorable 12-personnel)
  const yearsExp = ctx.years_exp;
  if (
    yearsExp != null &&
    yearsExp <= 2 &&
    personnel12 != null &&
    personnel12 >= 0.25 &&
    prior >= 55
  ) {
    flags.push("te_early_breakout");
    bandModifier += 6;
    stack.push(
      evidence(
        "situation",
        "te_early_breakout",
        0.4,
        3,
        "Year 1-2 TE in 12-personnel scheme (early breakout pattern)",
      ),
    );
    estimate += 3;
  }

  // Rookie penalty (TE rookies rarely produce year 1)
  if (yearsExp === 0 && !flags.includes("te_early_breakout")) {
    estimate -= 4;
    bandModifier += 4;
    stack.push(
      evidence(
        "intrinsic",
        "te_rookie_penalty",
        0.3,
        -4,
        "Rookie TE rarely produces year 1",
      ),
    );
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

  const blended = blendWithPrior(estimate, prior, 0.4);
  return {
    point_estimate: clamp(blended.final),
    evidence_stack: stack,
    arbitrage_flags: flags,
    band_modifier: bandModifier,
  };
}
