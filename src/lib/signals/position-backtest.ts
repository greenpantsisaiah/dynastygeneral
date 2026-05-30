/**
 * Shared backtest harness for the WR / QB / TE rubric backtests
 * (MODEL_LIVE_PLAN Phase A4 / Phase B sig-history). One data path, one
 * reporting shape, so the three scripts cannot drift.
 *
 * For each decision year it builds the position cohort TWICE:
 *   - A4 baseline: rubric WITH NO team signals (includeTeamSignals: false),
 *     reproducing the Phase A4 market+age-only path.
 *   - rubric + historical scheme: rubric WITH the team_signals_history
 *     coaching/scheme row joined (includeTeamSignals: true).
 *
 * Both score the SAME market prior and SAME outcome vector, so the only
 * difference between the two rubric columns is the team-signal branches.
 * The printed table is the per-position deliverable: market baseline,
 * rubric A4, rubric + scheme, lift of each over market, plus pooled CI +
 * bootstrap p-value. When team_signals_history is empty (pre-ingest) the
 * two rubric columns are identical and the report says so honestly.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvaluationContext, EvaluationOutput } from "@/lib/engine/evaluation";
import {
  buildPositionCohort,
  spearman,
  bootstrapLiftCI,
  bootstrapLiftPValue,
  type CohortPosition,
} from "@/lib/signals/position-cohort";
import { loadCrosswalk } from "@/lib/signals/nflverse";

type Vectors = { rubric: number[]; market: number[]; outcome: number[] };

function emptyVectors(): Vectors {
  return { rubric: [], market: [], outcome: [] };
}

function scoreCohort(
  records: { ctx: EvaluationContext; market: number; outcomePPG: number }[],
  evaluate: (ctx: EvaluationContext) => EvaluationOutput,
): Vectors {
  const v = emptyVectors();
  for (const rec of records) {
    v.rubric.push(evaluate(rec.ctx).point_estimate);
    v.market.push(rec.market);
    v.outcome.push(rec.outcomePPG);
  }
  return v;
}

export async function runPositionBacktest(args: {
  sb: SupabaseClient;
  position: CohortPosition;
  evaluate: (ctx: EvaluationContext) => EvaluationOutput;
  decisionYears?: number[];
}): Promise<void> {
  const { sb, position, evaluate } = args;
  const decisionYears = args.decisionYears ?? [2023, 2024];

  const xwalk = await loadCrosswalk();

  const pooledBase = emptyVectors(); // rubric, no team signals (A4)
  const pooledScheme = emptyVectors(); // rubric + historical scheme
  let totalSchemeRows = 0;

  for (const Y of decisionYears) {
    // A4 baseline cohort (no team signals).
    const base = await buildPositionCohort(sb, xwalk, Y, position, {
      includeTeamSignals: false,
    });
    // Scheme cohort (team_signals_history joined).
    const scheme = await buildPositionCohort(sb, xwalk, Y, position, {
      includeTeamSignals: true,
    });

    const schemePopulated = scheme.records.filter(
      (r) => r.ctx.team?.scheme_tag != null,
    ).length;
    totalSchemeRows += schemePopulated;

    const vBase = scoreCohort(base.records, evaluate);
    const vScheme = scoreCohort(scheme.records, evaluate);

    const n = vScheme.outcome.length;
    const sMkt = spearman(vScheme.market, vScheme.outcome);
    const sBase = spearman(vBase.rubric, vBase.outcome);
    const sScheme = spearman(vScheme.rubric, vScheme.outcome);
    console.log(
      `\n=== ${Y} (KTC ${String(scheme.snapshotDate).slice(0, 10)}, fmt=${scheme.format}, n=${n} ${position}s, scheme_tag populated: ${schemePopulated}) ===`,
    );
    console.log(`  market (KTC)         Spearman vs ${Y} PPG: ${sMkt.toFixed(3)}`);
    console.log(`  rubric (A4, no team) Spearman vs ${Y} PPG: ${sBase.toFixed(3)}  lift ${(sBase - sMkt >= 0 ? "+" : "")}${(sBase - sMkt).toFixed(3)}`);
    console.log(`  rubric + scheme      Spearman vs ${Y} PPG: ${sScheme.toFixed(3)}  lift ${(sScheme - sMkt >= 0 ? "+" : "")}${(sScheme - sMkt).toFixed(3)}`);

    pooledBase.rubric.push(...vBase.rubric);
    pooledBase.market.push(...vBase.market);
    pooledBase.outcome.push(...vBase.outcome);
    pooledScheme.rubric.push(...vScheme.rubric);
    pooledScheme.market.push(...vScheme.market);
    pooledScheme.outcome.push(...vScheme.outcome);
  }

  const pMkt = spearman(pooledScheme.market, pooledScheme.outcome);
  const pBase = spearman(pooledBase.rubric, pooledBase.outcome);
  const pScheme = spearman(pooledScheme.rubric, pooledScheme.outcome);
  const ciBase = bootstrapLiftCI(pooledBase.rubric, pooledBase.market, pooledBase.outcome);
  const ciScheme = bootstrapLiftCI(
    pooledScheme.rubric,
    pooledScheme.market,
    pooledScheme.outcome,
  );
  const pvalBase = bootstrapLiftPValue(
    pooledBase.rubric,
    pooledBase.market,
    pooledBase.outcome,
  );
  const pvalScheme = bootstrapLiftPValue(
    pooledScheme.rubric,
    pooledScheme.market,
    pooledScheme.outcome,
  );

  console.log(`\n=== POOLED ${position} (n=${pooledScheme.rubric.length}) ===`);
  console.log(`  market (KTC):                 Spearman ${pMkt.toFixed(3)}`);
  console.log(
    `  rubric (A4, no team signals): Spearman ${pBase.toFixed(3)}  lift ${(pBase - pMkt >= 0 ? "+" : "")}${(pBase - pMkt).toFixed(3)}  95% CI [${ciBase.lo.toFixed(3)}, ${ciBase.hi.toFixed(3)}]  p=${pvalBase.toFixed(3)}`,
  );
  console.log(
    `  rubric + historical scheme:   Spearman ${pScheme.toFixed(3)}  lift ${(pScheme - pMkt >= 0 ? "+" : "")}${(pScheme - pMkt).toFixed(3)}  95% CI [${ciScheme.lo.toFixed(3)}, ${ciScheme.hi.toFixed(3)}]  p=${pvalScheme.toFixed(3)}`,
  );
  console.log(
    `  scheme marginal (scheme - A4 rubric Spearman): ${(pScheme - pBase >= 0 ? "+" : "")}${(pScheme - pBase).toFixed(3)}`,
  );

  if (totalSchemeRows === 0) {
    console.log(
      `\n[honest read] team_signals_history is EMPTY for these years: the two rubric columns are identical and NO scheme lift can be claimed. Run the ingest (founder-authorized --write) and re-run this backtest to learn the real marginal effect.`,
    );
  } else {
    console.log(
      `\nReading: "scheme marginal" is the part of the rubric's edge attributable to the historical coaching/scheme signals. Positive AND its CI excluding zero = the scheme signal is gate-relevant for Phase D3; otherwise log to the negative-results note and hold the rubric weight at the prior.\n`,
    );
  }
}
