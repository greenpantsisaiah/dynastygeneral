/**
 * QB position rubric. Tier-conditional aging is the load-bearing
 * insight: Tier-1 QBs age well past 35 (Brady, Rodgers, Brees);
 * Tier-2/3 decline at 33+. Mobile QBs decline faster.
 *
 * Citations:
 * - PFF QB Bayesian framework (RESEARCH_CORPUS QB section)
 * - Tier-1 QB longevity studies (Late Round Podcast cohort)
 * - Mobile-QB injury attrition (FootballGuys / FantasyPoints)
 *
 * Tier classification: top-8 KTC at QB position = Tier 1; 9-16 =
 * Tier 2; rest = Tier 3.
 */

import type { EvaluationContext, RubricOutput } from "../types";
import {
  blendWithPrior,
  clamp,
  evidence,
  ktcToScore,
  adpToScore,
  searchRankToScore,
} from "../util";

const TIER_1_KTC_FLOOR = 8500;
const TIER_2_KTC_FLOOR = 6500;

function classifyTier(ktc: number | null | undefined): 1 | 2 | 3 {
  if (ktc == null) return 3;
  if (ktc >= TIER_1_KTC_FLOOR) return 1;
  if (ktc >= TIER_2_KTC_FLOOR) return 2;
  return 3;
}

function qbAgeMultiplier(age: number | null, tier: 1 | 2 | 3): number {
  if (age == null) return 1.0;
  if (tier === 1) {
    if (age < 26) return 0.9;
    if (age < 36) return 1.0;
    if (age < 38) return 0.95;
    return 0.85;
  }
  if (tier === 2) {
    if (age < 26) return 0.9;
    if (age < 33) return 1.0;
    if (age < 35) return 0.85;
    return 0.65;
  }
  // Tier 3
  if (age < 26) return 0.85;
  if (age < 31) return 1.0;
  if (age < 33) return 0.8;
  return 0.55;
}

export function evaluateQb(ctx: EvaluationContext): RubricOutput {
  const stack = [];
  let bandModifier = 0;
  const flags: RubricOutput["arbitrage_flags"] = [];

  const prior =
    ktcToScore(ctx.ktc_value) ??
    adpToScore(ctx.adp) ??
    searchRankToScore(ctx.search_rank) ??
    50;

  const tier = classifyTier(ctx.ktc_value);
  let estimate = prior;

  stack.push(
    evidence(
      "intrinsic",
      ctx.ktc_value != null ? "ktc_value" : "rank_fallback",
      0.6,
      prior,
      `QB market prior (Tier ${tier})`,
    ),
  );

  // Tier-conditional aging
  const age = ctx.age ?? ctx.player?.age ?? null;
  const ageMult = qbAgeMultiplier(age, tier);
  if (ageMult !== 1.0) {
    const ageDelta = (ageMult - 1.0) * estimate;
    estimate = clamp(estimate + ageDelta);
    stack.push(
      evidence(
        "intrinsic",
        "qb_tier_conditional_aging",
        Math.abs(ageMult - 1.0),
        ageDelta,
        `QB age curve (Tier ${tier}, age=${age})`,
      ),
    );
  }

  // Late-round QB hit arbitrage (Tier 3 with high search rank but
  // young + good situation)
  if (
    tier === 3 &&
    age != null &&
    age < 28 &&
    ctx.team?.scheme_tag !== "other"
  ) {
    if (ctx.team?.oc_tenure_yrs != null && ctx.team.oc_tenure_yrs >= 2) {
      flags.push("late_round_qb_hit");
      bandModifier += 6;
      stack.push(
        evidence(
          "situation",
          "late_round_qb_hit",
          0.5,
          0,
          "Tier 3 QB with stable OC tenure (arbitrage candidate)",
        ),
      );
    }
  }

  // OC tenure (continuity is QB-positive)
  const ocTenure = ctx.team?.oc_tenure_yrs;
  if (ocTenure != null) {
    if (ocTenure >= 3) {
      estimate += 3;
      stack.push(
        evidence(
          "situation",
          "oc_continuity",
          0.4,
          3,
          `Stable OC (${ocTenure} yrs) supports QB`,
        ),
      );
    } else if (ctx.team?.oc_first_year_with_team_flag === true) {
      bandModifier += 4;
      stack.push(
        evidence(
          "variance",
          "oc_first_year",
          1.0,
          0,
          "First-year OC widens band",
        ),
      );
    }
  }

  // OL pass-protection signal (QBs depend on OL)
  const olPass = ctx.team?.ol_grade_pass;
  if (olPass != null) {
    const olEffect = (olPass - 0.5) * 6;
    estimate = clamp(estimate + olEffect);
    stack.push(
      evidence(
        "situation",
        "ol_grade_pass",
        0.3,
        olEffect,
        `OL pass grade ${olPass.toFixed(2)}`,
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

  // First-time HC + tier 1 QB = stability concern
  if (tier === 1 && ctx.team?.hc_first_time_flag === true) {
    bandModifier += 5;
    stack.push(
      evidence(
        "variance",
        "first_time_hc_tier1_qb",
        1.0,
        0,
        "Elite QB with first-time HC",
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
