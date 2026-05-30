/**
 * RB role-tier BAKE-OFF backtest. Read-only. Phase B2 of MODEL_LIVE_PLAN.
 *
 * `rb_role_tier` is a HARD GATE on the RB rubric (MODEL_CARD 4.2 v1):
 * committee_member / starter_uncertain caps the rubric at 60 and defeats
 * the market blend. The tier therefore moves the rubric materially, so
 * the QUESTION is which tier SOURCE grades RBs best:
 *
 *   (a) SNAP-DERIVED: deriveRbRoleTier over prior-season nflverse snap /
 *       rush / target share (src/lib/signals/nflverse.ts), the source the
 *       production rubric reads today (the A4 baseline).
 *   (b) LLM-CODED: the historical-signal-extractor agent's vintage-blinded
 *       coding in historical_signal_codes (signal_name=rb_role_tier),
 *       restricted to sources dated before each year's pre-draft cutoff.
 *
 * Both are vintage-safe: snap-derived reads season Y-1 (known by draft Y),
 * the LLM is blinded to pre-draft Y. Neither sees season-Y outcomes.
 *
 * We run the RB rubric several ways and compare each against the market
 * (KTC) baseline, plus a PAIRED bootstrap of the LLM tier's lift OVER the
 * snap tier so we can say whether any difference is real, not noise.
 *
 * Coverage note: the LLM batch coded top-N RBs as of the pre-draft cutoff,
 * so it does not cover every cohort RB. We report BOTH a deployment-
 * realistic full-cohort run (LLM where coded, snap as fallback) AND an
 * apples-to-apples run on only the RBs both sources code, so the tier-
 * source effect is isolated from the coverage difference.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/backtest-rb-tier-bakeoff.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadCrosswalk } from "../src/lib/signals/nflverse";
import {
  buildRbCohort,
  spearman,
  type RbBacktestRecord,
} from "../src/lib/signals/rb-cohort";
import { bootstrapLiftCI } from "../src/lib/signals/position-cohort";
import { evaluateRb } from "../src/lib/engine/evaluation";
import type { RbRoleTier } from "../src/lib/signals/schema";
import type { EvaluationContext } from "../src/lib/engine/evaluation";

const DECISION_YEARS = [2023, 2024];
const VALID_TIERS = new Set<RbRoleTier>([
  "strict_bellcow",
  "bellcow",
  "lead_back",
  "committee_member",
  "passdown",
  "starter_uncertain",
]);

/** Pull the LLM-coded rb_role_tier per (prediction_year, player_id). */
async function loadLlmTiers(
  sb: SupabaseClient,
): Promise<Map<number, Map<string, RbRoleTier>>> {
  const { data, error } = await sb
    .from("historical_signal_codes")
    .select("prediction_year, player_id, signal_value")
    .eq("signal_name", "rb_role_tier");
  if (error) throw new Error(`historical_signal_codes read: ${error.message}`);
  const byYear = new Map<number, Map<string, RbRoleTier>>();
  for (const r of data ?? []) {
    const raw = (r.signal_value as { value?: unknown } | null)?.value;
    if (raw == null) continue;
    const tier = String(raw) as RbRoleTier;
    if (!VALID_TIERS.has(tier)) continue; // skip any off-schema coding
    const m = byYear.get(r.prediction_year) ?? new Map<string, RbRoleTier>();
    m.set(r.player_id, tier);
    byYear.set(r.prediction_year, m);
  }
  return byYear;
}

/** Re-evaluate a record with rb_role_tier overridden to `tier`. */
function scoreWithTier(rec: RbBacktestRecord, tier: RbRoleTier | null): number {
  const ctx: EvaluationContext = {
    ...rec.ctx,
    player: rec.ctx.player
      ? { ...rec.ctx.player, rb_role_tier: tier }
      : rec.ctx.player,
  };
  return evaluateRb(ctx).point_estimate;
}

/**
 * Paired bootstrap of (spearman(A) - spearman(B)) vs the SAME outcome,
 * resampling player-records with replacement. Deterministic mulberry32,
 * same protocol as bootstrapLiftCI so the two CIs are comparable.
 */
function pairedSpearmanDiffCI(
  scoresA: number[],
  scoresB: number[],
  outcome: number[],
  iters = 1000,
  seed = 42,
): { lo: number; hi: number; point: number } {
  const n = scoresA.length;
  if (n === 0) return { lo: 0, hi: 0, point: 0 };
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const diffs: number[] = [];
  const aB = new Array<number>(n);
  const bB = new Array<number>(n);
  const oB = new Array<number>(n);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rand() * n);
      aB[i] = scoresA[j];
      bB[i] = scoresB[j];
      oB[i] = outcome[j];
    }
    diffs.push(spearman(aB, oB) - spearman(bB, oB));
  }
  diffs.sort((a, b) => a - b);
  return {
    lo: diffs[Math.floor(iters * 0.025)],
    hi: diffs[Math.floor(iters * 0.975)],
    point: spearman(scoresA, outcome) - spearman(scoresB, outcome),
  };
}

type Pool = {
  snap: number[];
  llmFallback: number[];
  llmStrict: number[];
  market: number[];
  outcome: number[];
};

function fmt(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(3);
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const xwalk = await loadCrosswalk();
  const llmByYear = await loadLlmTiers(sb);

  // Full cohort pool (deployment-realistic). LLM where coded, else snap.
  const full: Pool = {
    snap: [],
    llmFallback: [],
    llmStrict: [],
    market: [],
    outcome: [],
  };
  // Apples-to-apples pool: only RBs the LLM also coded (isolates source).
  const paired: Pool = {
    snap: [],
    llmFallback: [],
    llmStrict: [],
    market: [],
    outcome: [],
  };

  let totalLlmCoverage = 0;
  let totalCohort = 0;

  for (const Y of DECISION_YEARS) {
    const { records, snapshotDate, format } = await buildRbCohort(sb, xwalk, Y);
    const llm = llmByYear.get(Y) ?? new Map<string, RbRoleTier>();
    let coded = 0;

    const yr = {
      snapAll: [] as number[],
      llmFallbackAll: [] as number[],
      marketAll: [] as number[],
      outcomeAll: [] as number[],
      snapP: [] as number[],
      llmP: [] as number[],
      marketP: [] as number[],
      outcomeP: [] as number[],
    };

    for (const rec of records) {
      const snapTier = (rec.ctx.player?.rb_role_tier ?? null) as RbRoleTier | null;
      const llmTier = llm.get(rec.player_id) ?? null;

      const snapScore = scoreWithTier(rec, snapTier);
      const llmFallbackScore = scoreWithTier(rec, llmTier ?? snapTier);
      const llmStrictScore = scoreWithTier(
        rec,
        llmTier ?? "starter_uncertain",
      );

      full.snap.push(snapScore);
      full.llmFallback.push(llmFallbackScore);
      full.llmStrict.push(llmStrictScore);
      full.market.push(rec.market);
      full.outcome.push(rec.outcomePPG);
      yr.snapAll.push(snapScore);
      yr.llmFallbackAll.push(llmFallbackScore);
      yr.marketAll.push(rec.market);
      yr.outcomeAll.push(rec.outcomePPG);

      if (llmTier) {
        coded++;
        const llmScore = scoreWithTier(rec, llmTier);
        paired.snap.push(snapScore);
        paired.llmFallback.push(llmScore);
        paired.llmStrict.push(llmScore);
        paired.market.push(rec.market);
        paired.outcome.push(rec.outcomePPG);
        yr.snapP.push(snapScore);
        yr.llmP.push(llmScore);
        yr.marketP.push(rec.market);
        yr.outcomeP.push(rec.outcomePPG);
      }
    }

    totalLlmCoverage += coded;
    totalCohort += records.length;

    console.log(
      `\n=== ${Y} (KTC ${String(snapshotDate).slice(0, 10)}, fmt=${format}, n=${records.length} RBs; LLM-coded ${coded}) ===`,
    );
    console.log(
      `  [full cohort] market ${spearman(yr.marketAll, yr.outcomeAll).toFixed(3)} | snap ${spearman(yr.snapAll, yr.outcomeAll).toFixed(3)} | LLM(+snap fb) ${spearman(yr.llmFallbackAll, yr.outcomeAll).toFixed(3)}`,
    );
    if (yr.snapP.length > 0) {
      console.log(
        `  [paired only ] market ${spearman(yr.marketP, yr.outcomeP).toFixed(3)} | snap ${spearman(yr.snapP, yr.outcomeP).toFixed(3)} | LLM ${spearman(yr.llmP, yr.outcomeP).toFixed(3)}`,
      );
    }
  }

  const cov = ((totalLlmCoverage / totalCohort) * 100).toFixed(1);

  // ---- POOLED full cohort ----
  console.log(
    `\n\n========================= POOLED RESULTS =========================`,
  );
  console.log(
    `LLM tier coverage of the cohort: ${totalLlmCoverage}/${totalCohort} (${cov}%). The rest fall back to the snap tier in the LLM(+snap fb) variant.`,
  );

  const sMarket = spearman(full.market, full.outcome);
  const sSnap = spearman(full.snap, full.outcome);
  const sLlmFb = spearman(full.llmFallback, full.outcome);
  const sLlmStrict = spearman(full.llmStrict, full.outcome);

  const ciSnap = bootstrapLiftCI(full.snap, full.market, full.outcome);
  const ciLlmFb = bootstrapLiftCI(full.llmFallback, full.market, full.outcome);
  const ciLlmStrict = bootstrapLiftCI(
    full.llmStrict,
    full.market,
    full.outcome,
  );

  console.log(`\n--- FULL COHORT (n=${full.snap.length}), vs market (KTC) ---`);
  console.log(`  market (KTC) Spearman:                 ${sMarket.toFixed(3)}`);
  console.log(
    `  rubric + SNAP tier (A4 baseline):      ${sSnap.toFixed(3)}  lift ${fmt(sSnap - sMarket)}  CI [${fmt(ciSnap.lo)}, ${fmt(ciSnap.hi)}]`,
  );
  console.log(
    `  rubric + LLM tier (+snap fallback):    ${sLlmFb.toFixed(3)}  lift ${fmt(sLlmFb - sMarket)}  CI [${fmt(ciLlmFb.lo)}, ${fmt(ciLlmFb.hi)}]`,
  );
  console.log(
    `  rubric + LLM tier (no snap fallback):  ${sLlmStrict.toFixed(3)}  lift ${fmt(sLlmStrict - sMarket)}  CI [${fmt(ciLlmStrict.lo)}, ${fmt(ciLlmStrict.hi)}]`,
  );

  // ---- PAIRED apples-to-apples ----
  const pMarket = spearman(paired.market, paired.outcome);
  const pSnap = spearman(paired.snap, paired.outcome);
  const pLlm = spearman(paired.llmFallback, paired.outcome);
  const ciPSnap = bootstrapLiftCI(paired.snap, paired.market, paired.outcome);
  const ciPLlm = bootstrapLiftCI(
    paired.llmFallback,
    paired.market,
    paired.outcome,
  );
  const llmVsSnap = pairedSpearmanDiffCI(
    paired.llmFallback,
    paired.snap,
    paired.outcome,
  );

  console.log(
    `\n--- PAIRED (only RBs both sources code, n=${paired.snap.length}), vs market (KTC) ---`,
  );
  console.log(`  market (KTC) Spearman:        ${pMarket.toFixed(3)}`);
  console.log(
    `  rubric + SNAP tier:           ${pSnap.toFixed(3)}  lift ${fmt(pSnap - pMarket)}  CI [${fmt(ciPSnap.lo)}, ${fmt(ciPSnap.hi)}]`,
  );
  console.log(
    `  rubric + LLM tier:            ${pLlm.toFixed(3)}  lift ${fmt(pLlm - pMarket)}  CI [${fmt(ciPLlm.lo)}, ${fmt(ciPLlm.hi)}]`,
  );
  console.log(
    `\n  HEAD-TO-HEAD (LLM tier - SNAP tier), paired bootstrap:`,
  );
  console.log(
    `    Spearman diff: ${fmt(llmVsSnap.point)}  95% CI [${fmt(llmVsSnap.lo)}, ${fmt(llmVsSnap.hi)}]`,
  );

  // ---- DECISION READOUT ----
  const llmBeatsSnap = llmVsSnap.point > 0;
  const llmBeatsSnapReal = llmVsSnap.lo > 0; // CI excludes zero on the up side
  const snapBeatsLlmReal = llmVsSnap.hi < 0;
  const anyBeatsMarket =
    ciSnap.lo > 0 || ciLlmFb.lo > 0 || ciLlmStrict.lo > 0;

  console.log(`\n========================= DECISION =========================`);
  console.log(
    `  Does ANY tier source lift the rubric over the market with CI excluding zero? ${anyBeatsMarket ? "YES" : "NO"}`,
  );
  if (llmBeatsSnapReal) {
    console.log(
      `  WINNER: LLM tier. It ranks RBs better than the snap tier and the paired CI excludes zero.`,
    );
  } else if (snapBeatsLlmReal) {
    console.log(
      `  WINNER: SNAP tier. The LLM tier ranks WORSE and the paired CI excludes zero.`,
    );
  } else if (llmBeatsSnap) {
    console.log(
      `  LEAN: LLM tier (point estimate higher) but the paired CI straddles zero. Not statistically separable on this cohort.`,
    );
  } else {
    console.log(
      `  LEAN: SNAP tier (point estimate higher or tied) but the paired CI straddles zero. Not statistically separable on this cohort.`,
    );
  }
  console.log(
    `\nReading: lift = rubric Spearman minus market Spearman. Positive lift with a 95% CI excluding zero means the tier source's rubric ranks realized RB production better than KTC alone. NEVER claim lift from a current-only snapshot; this is a temporal-blinded historical backtest (decision years ${DECISION_YEARS.join(" + ")}).\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
