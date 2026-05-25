/**
 * RB position rubric. The corpus v2 expansion is RB-richest: role
 * tier, OL transitions, compounding-news arbitrage. This rubric
 * implements the MODEL_CARD section 4.2 RB scoring and the variance-
 * band modifiers from section 5.8.
 *
 * Hard gate: committee_member or starter_uncertain caps at the gate cap
 * regardless of base signals (corpus: a passdown-back ceiling is
 * structurally limited).
 *
 * Weights are parameterized (RbWeights) with the shipped values as
 * RB_DEFAULT_WEIGHTS, so they can be calibrated against the backtest
 * (scripts/calibrate-rb-rubric.ts) without re-implementing the rubric.
 * Production passes nothing and gets the defaults.
 *
 * Citations:
 * - Stats with Sasa 2024: 64% of traded RBs improve, median +6.8%
 * - PFF rookie OL year-1-to-year-2 r=0.56 to RB success
 * - Mass 2018 / RESEARCH_CORPUS RB: cliff at 27
 * - Compounding-news cluster (corpus v2): 3+ transitions = arbitrage
 */

import type { RubricOutput } from "../types";
import {
  ageMultiplier,
  blendWithPrior,
  clamp,
  evidence,
  ktcToScore,
  adpToScore,
  searchRankToScore,
} from "../util";
import type { EvaluationContext } from "../types";

export type RbWeights = {
  hardGateCap: number;
  strictBellcow: number;
  bellcow: number;
  leadBack: number;
  passdown: number;
  cliffBreaker: number;
  olEffect: number;
  contract: number;
  priorBlend: number;
};

export const RB_DEFAULT_WEIGHTS: RbWeights = {
  hardGateCap: 60,
  strictBellcow: 12,
  bellcow: 8,
  leadBack: 4,
  passdown: 4,
  cliffBreaker: 4,
  olEffect: 8,
  contract: 2,
  priorBlend: 0.3,
};

export function evaluateRb(
  ctx: EvaluationContext,
  w: RbWeights = RB_DEFAULT_WEIGHTS,
): RubricOutput {
  const stack = [];
  let bandModifier = 0;
  let hardGateActive = false;
  const flags: RubricOutput["arbitrage_flags"] = [];

  // Base: KTC > ADP > search_rank cascade
  const prior =
    ktcToScore(ctx.ktc_value) ??
    adpToScore(ctx.adp) ??
    searchRankToScore(ctx.search_rank) ??
    50;

  let estimate = prior;
  stack.push(
    evidence(
      "intrinsic",
      ctx.ktc_value != null
        ? "ktc_value"
        : ctx.adp != null
          ? "adp"
          : "search_rank",
      0.6,
      prior,
      "RB market prior (KTC/ADP/search_rank cascade)",
    ),
  );

  // Role tier (the load-bearing RB signal)
  const roleTier = ctx.player?.rb_role_tier;
  if (roleTier === "strict_bellcow") {
    estimate += w.strictBellcow;
    stack.push(
      evidence(
        "situation",
        "rb_role_tier:strict_bellcow",
        1.0,
        w.strictBellcow,
        "Strict bellcow (>70% snap share, no committee threat)",
      ),
    );
  } else if (roleTier === "bellcow") {
    estimate += w.bellcow;
    stack.push(
      evidence(
        "situation",
        "rb_role_tier:bellcow",
        1.0,
        w.bellcow,
        "Bellcow role (60-70% snap share)",
      ),
    );
  } else if (roleTier === "lead_back") {
    estimate += w.leadBack;
    stack.push(
      evidence("situation", "rb_role_tier:lead_back", 1.0, w.leadBack, "Lead back"),
    );
  } else if (
    roleTier === "committee_member" ||
    roleTier === "starter_uncertain"
  ) {
    // HARD GATE: cap at the gate cap. Defeats market prior blend.
    hardGateActive = true;
    if (estimate > w.hardGateCap) {
      const reduction = w.hardGateCap - estimate;
      stack.push(
        evidence(
          "situation",
          `rb_role_tier:${roleTier}`,
          1.0,
          reduction,
          "Hard gate: committee/uncertain caps at the gate cap",
        ),
      );
      estimate = w.hardGateCap;
    } else {
      stack.push(
        evidence(
          "situation",
          `rb_role_tier:${roleTier}`,
          1.0,
          0,
          "Hard gate active but estimate below cap",
        ),
      );
    }
    bandModifier += 6; // committee role widens band materially
  } else if (roleTier === "passdown") {
    // Passdown specialists have a floor (PPR scoring) but lower ceiling
    estimate += w.passdown;
    stack.push(
      evidence(
        "situation",
        "rb_role_tier:passdown",
        1.0,
        w.passdown,
        "Passdown specialist (PPR floor, capped ceiling)",
      ),
    );
  }

  // Age curve. Always emit evidence (even at 1.0) so users can audit
  // that the rubric considered age. Citation: Mass 2018 RB cliff +
  // Apex peak-age. Peak shelf 23-26 is flat; cliff begins at 27.
  const age = ctx.age ?? ctx.player?.age ?? null;
  const ageMult = ageMultiplier("RB", age);
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
        `RB age=${age}, mult=${ageMult.toFixed(2)} (${note}). Mass 2018 + Apex peak-age.`,
      ),
    );
    if (ageMult !== 1.0) estimate = clamp(estimate + ageDelta);
  }

  // Aging RB cliff-breaker arbitrage flag
  if (age != null && age >= 27 && roleTier === "strict_bellcow") {
    flags.push("rb_cliff_breaker");
    stack.push(
      evidence(
        "situation",
        "rb_cliff_breaker",
        0.5,
        w.cliffBreaker,
        "Aging RB sustaining bellcow role (cliff-breaker arbitrage)",
      ),
    );
    estimate += w.cliffBreaker;
  }

  // Team-level OL signal (load-bearing for RBs)
  const olContinuity = ctx.team?.ol_continuity_score ?? null;
  if (olContinuity != null) {
    const olEffect = (olContinuity - 0.5) * w.olEffect;
    stack.push(
      evidence(
        "situation",
        "ol_continuity",
        0.4,
        olEffect,
        `OL continuity ${olContinuity.toFixed(2)} (corpus: r=0.44 to DVOA)`,
      ),
    );
    estimate = clamp(estimate + olEffect);
    if (olContinuity < 0.4) bandModifier += 4; // unstable OL = wider band
  }

  // Rookie OL starters (PFF year-1-to-year-2 r=0.56)
  const rookieOlStarters = ctx.team?.rookie_ol_starters_count ?? 0;
  if (rookieOlStarters >= 2) {
    bandModifier += 6;
    stack.push(
      evidence(
        "variance",
        "rookie_ol_starters",
        1.0,
        0,
        `${rookieOlStarters} rookie OL starters widen variance band`,
      ),
    );
  }

  // Compounding news (corpus v2 cluster 4)
  const compNews = ctx.player?.compounding_news_count ?? 0;
  if (compNews >= 3) {
    flags.push("compounding_news");
    bandModifier += 12;
    stack.push(
      evidence(
        "variance",
        "compounding_news",
        1.0,
        0,
        `${compNews} compounding events (corpus arbitrage cluster)`,
      ),
    );
  }

  // Traded offseason flag (Stats with Sasa: median +6.8%)
  const tradedOff = ctx.player?.rb_traded_offseason_flag === true;
  if (tradedOff) {
    const newRole = ctx.player?.rb_role_at_new_team_projected;
    let tradeAdj = 0;
    if (newRole === "featured") tradeAdj = 3;
    else if (newRole === "committee") tradeAdj = -2;
    else if (newRole === "passdown_complement") tradeAdj = -1;
    if (tradeAdj !== 0) {
      estimate = clamp(estimate + tradeAdj);
      stack.push(
        evidence(
          "situation",
          "rb_traded_to_role",
          0.4,
          tradeAdj,
          `Traded to ${newRole} role (Stats with Sasa cohort)`,
        ),
      );
    }
    bandModifier += 4;
  }

  // Staff novelty (variance modifier)
  const staffNovelty = ctx.team?.staff_novelty_composite ?? 0;
  if (staffNovelty >= 2) {
    bandModifier += 5;
    stack.push(
      evidence(
        "variance",
        "staff_novelty",
        1.0,
        0,
        `Staff novelty ${staffNovelty} widens band`,
      ),
    );
  }

  // Contract-year flag (motivation premium per RESEARCH_CORPUS)
  if (ctx.player?.contract_year_flag === true) {
    estimate += w.contract;
    stack.push(
      evidence(
        "situation",
        "contract_year",
        0.3,
        w.contract,
        "Contract-year motivation premium",
      ),
    );
  }

  // Final blend with KTC prior. Hard gate defeats the blend so
  // market love can't undo the structural cap on committee/uncertain.
  const priorWeight = hardGateActive ? 0 : w.priorBlend;
  const blended = blendWithPrior(estimate, prior, priorWeight);
  const final = hardGateActive
    ? Math.min(blended.final, w.hardGateCap)
    : blended.final;

  return {
    point_estimate: clamp(final),
    evidence_stack: stack,
    arbitrage_flags: flags,
    band_modifier: bandModifier,
  };
}
