/**
 * EvaluationEngine regression tests. Pinned to the architecture
 * decisions in MODEL_CARD section 4 and RESEARCH_CORPUS findings.
 *
 *   npx tsx --tsconfig tsconfig.json evals/evaluation.test.ts
 *
 * What we lock in here:
 *
 * - RB committee/uncertain hard gate caps at 60 (corpus role-tier rule)
 * - RB strict_bellcow + sharp KTC outranks committee with same KTC
 * - QB tier-1 ages well past 35; tier-2/3 declines at 33+
 * - WR pass-heavy scheme lifts; rookie WR + pass scheme fires flag
 * - TE 12-personnel rate effects are positive and sized correctly
 * - Compounding-news 3+ widens variance band materially
 * - Final point estimates always within [0, 100]
 * - Variance band always wraps point estimate
 */

import { evaluate } from "../src/lib/engine/evaluation";
import {
  computeTiers,
  classifyTierScarcity,
} from "../src/lib/engine/evaluation/tiers";
import type {
  PlayerSignalsRow,
  TeamSignalsRow,
} from "../src/lib/signals/schema";
import type { EvaluationContext } from "../src/lib/engine/evaluation/types";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  + ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failed++;
    console.log(`  X ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function emptyPlayer(
  overrides: Partial<PlayerSignalsRow> = {},
): PlayerSignalsRow {
  return {
    player_id: "test_player",
    position: "RB",
    team: "PHI",
    age: 26,
    rb_role_tier: null,
    rb_traded_offseason_flag: null,
    rb_role_at_new_team_projected: null,
    rb_passdown_share_prior_year: null,
    compounding_news_count: 0,
    contract_years_remaining: null,
    recent_extension_flag: null,
    contract_year_flag: null,
    weight_lb: null,
    height_in: null,
    last_updated: "",
    updated_by: null,
    ...overrides,
  };
}

function emptyTeam(
  overrides: Partial<TeamSignalsRow> = {},
): TeamSignalsRow {
  return {
    team: "PHI",
    ol_continuity_score: null,
    ol_grade_run: null,
    ol_grade_pass: null,
    rookie_ol_starters_count: 0,
    rookie_ol_position_breakdown: {},
    hc_id: null,
    hc_first_time_flag: null,
    hc_tenure_yrs: null,
    hc_background_tag: null,
    oc_id: null,
    oc_tenure_yrs: null,
    oc_first_year_with_team_flag: null,
    scheme_tag: null,
    staff_novelty_composite: 0,
    scheme_pace: null,
    pass_rate_neutral: null,
    personnel_12_rate: null,
    last_updated: "",
    updated_by: null,
    ...overrides,
  };
}

function ctx(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    player: emptyPlayer(),
    team: emptyTeam(),
    ktc_value: null,
    adp: null,
    search_rank: null,
    position: null,
    age: null,
    ...overrides,
  };
}

console.log("\nEvaluationEngine regression tests:");

// === Bounds ===
console.log("\n  Bounds:");
{
  const out = evaluate(ctx({ ktc_value: 9999 }));
  check(
    "max KTC stays in [0, 100]",
    out.point_estimate >= 0 && out.point_estimate <= 100,
    `point=${out.point_estimate}`,
  );
}
{
  const out = evaluate(ctx({ ktc_value: 0 }));
  check(
    "min KTC stays in [0, 100]",
    out.point_estimate >= 0 && out.point_estimate <= 100,
    `point=${out.point_estimate}`,
  );
}
{
  const out = evaluate(ctx({}));
  check(
    "no signals produces a value (default 50)",
    out.point_estimate >= 0 && out.point_estimate <= 100,
    `point=${out.point_estimate}`,
  );
}
{
  const out = evaluate(ctx({ ktc_value: 7000 }));
  check(
    "variance band wraps point estimate",
    out.variance_band.lo <= out.point_estimate &&
      out.point_estimate <= out.variance_band.hi,
    `[${out.variance_band.lo}, ${out.point_estimate}, ${out.variance_band.hi}]`,
  );
}

// === RB hard gate ===
console.log("\n  RB hard gate (committee/uncertain caps at 60):");
{
  // High KTC but committee role -> capped at 60
  const out = evaluate(
    ctx({
      position: "RB",
      ktc_value: 8500, // would be ~85 prior
      player: emptyPlayer({
        position: "RB",
        rb_role_tier: "committee_member",
        age: 25,
      }),
    }),
  );
  check(
    "committee_member with high KTC capped near 60",
    out.point_estimate <= 65,
    `point=${out.point_estimate}`,
  );
}
{
  // Strict bellcow with same KTC -> outranks committee
  const bellcow = evaluate(
    ctx({
      position: "RB",
      ktc_value: 8500,
      player: emptyPlayer({
        position: "RB",
        rb_role_tier: "strict_bellcow",
        age: 25,
      }),
    }),
  );
  const committee = evaluate(
    ctx({
      position: "RB",
      ktc_value: 8500,
      player: emptyPlayer({
        position: "RB",
        rb_role_tier: "committee_member",
        age: 25,
      }),
    }),
  );
  check(
    "strict_bellcow > committee_member at same KTC",
    bellcow.point_estimate > committee.point_estimate + 8,
    `bellcow=${bellcow.point_estimate} committee=${committee.point_estimate}`,
  );
}
{
  // Aging strict bellcow gets cliff_breaker flag
  const out = evaluate(
    ctx({
      position: "RB",
      ktc_value: 7000,
      player: emptyPlayer({
        position: "RB",
        rb_role_tier: "strict_bellcow",
        age: 28,
      }),
    }),
  );
  check(
    "aging strict_bellcow gets cliff_breaker flag",
    out.arbitrage_flags.includes("rb_cliff_breaker"),
    `flags=${out.arbitrage_flags.join(",")}`,
  );
}

// === RB age curve ===
console.log("\n  RB age curve (cliff at 27):");
{
  const young = evaluate(
    ctx({
      position: "RB",
      ktc_value: 7000,
      player: emptyPlayer({
        position: "RB",
        rb_role_tier: "bellcow",
        age: 24,
      }),
    }),
  );
  const old = evaluate(
    ctx({
      position: "RB",
      ktc_value: 7000,
      player: emptyPlayer({
        position: "RB",
        rb_role_tier: "bellcow",
        age: 30,
      }),
    }),
  );
  check(
    "young RB > old RB at same KTC + role",
    young.point_estimate > old.point_estimate + 10,
    `young=${young.point_estimate} old=${old.point_estimate}`,
  );
}

// === QB tier-conditional aging ===
console.log("\n  QB tier-conditional aging:");
{
  // Tier 1 elite at 36 should age well
  const tier1Old = evaluate(
    ctx({
      position: "QB",
      ktc_value: 9000,
      player: emptyPlayer({ position: "QB", age: 36 }),
    }),
  );
  // Tier 3 mid at 36 should not
  const tier3Old = evaluate(
    ctx({
      position: "QB",
      ktc_value: 5000,
      player: emptyPlayer({ position: "QB", age: 36 }),
    }),
  );
  check(
    "tier 1 QB ages well; tier 3 QB does not",
    tier1Old.point_estimate > tier3Old.point_estimate + 20,
    `tier1=${tier1Old.point_estimate} tier3=${tier3Old.point_estimate}`,
  );
}

// === WR scheme lift ===
console.log("\n  WR scheme + rookie:");
{
  const passHeavy = evaluate(
    ctx({
      position: "WR",
      ktc_value: 6000,
      player: emptyPlayer({ position: "WR", age: 24 }),
      team: emptyTeam({ scheme_tag: "air_raid" }),
    }),
  );
  const proStyle = evaluate(
    ctx({
      position: "WR",
      ktc_value: 6000,
      player: emptyPlayer({ position: "WR", age: 24 }),
      team: emptyTeam({ scheme_tag: "pro_style" }),
    }),
  );
  check(
    "WR in pass-heavy scheme outranks pro-style at same KTC",
    passHeavy.point_estimate > proStyle.point_estimate + 1,
    `air_raid=${passHeavy.point_estimate} pro=${proStyle.point_estimate}`,
  );
}
{
  const out = evaluate(
    ctx({
      position: "WR",
      ktc_value: 7000,
      is_rookie: true,
      player: emptyPlayer({ position: "WR", age: 22 }),
      team: emptyTeam({ scheme_tag: "mcvay" }),
    }),
  );
  check(
    "rookie WR + pass scheme fires breakout flag",
    out.arbitrage_flags.includes("rookie_wr_year1_breakout"),
    `flags=${out.arbitrage_flags.join(",")}`,
  );
}

// === TE 12-personnel ===
console.log("\n  TE 12-personnel + early breakout:");
{
  const high12 = evaluate(
    ctx({
      position: "TE",
      ktc_value: 6000,
      player: emptyPlayer({ position: "TE", age: 25 }),
      team: emptyTeam({ personnel_12_rate: 0.35 }),
    }),
  );
  const low12 = evaluate(
    ctx({
      position: "TE",
      ktc_value: 6000,
      player: emptyPlayer({ position: "TE", age: 25 }),
      team: emptyTeam({ personnel_12_rate: 0.10 }),
    }),
  );
  // The surviving 12-personnel gap scales with (1 - prior weight). At the
  // market-dominant DEFAULT_PRIOR_WEIGHT (0.55, raised from 0.4 in the
  // 2026-06-19 value-flip), the ~7.5-pt pre-blend spread survives as ~3.4.
  // The direction must hold and the gap must remain material (> 3).
  check(
    "TE in high 12-personnel scheme outranks low",
    high12.point_estimate > low12.point_estimate + 3,
    `high=${high12.point_estimate} low=${low12.point_estimate}`,
  );
}
{
  const out = evaluate(
    ctx({
      position: "TE",
      ktc_value: 6500,
      years_exp: 1,
      player: emptyPlayer({ position: "TE", age: 24 }),
      team: emptyTeam({ personnel_12_rate: 0.30 }),
    }),
  );
  check(
    "year-2 TE in 12-personnel fires early_breakout flag",
    out.arbitrage_flags.includes("te_early_breakout"),
    `flags=${out.arbitrage_flags.join(",")}`,
  );
}

// === Compounding-news variance band ===
console.log("\n  Compounding-news arbitrage:");
{
  const stable = evaluate(
    ctx({
      position: "RB",
      ktc_value: 7000,
      player: emptyPlayer({
        position: "RB",
        rb_role_tier: "bellcow",
        age: 25,
        compounding_news_count: 0,
      }),
    }),
  );
  const compound = evaluate(
    ctx({
      position: "RB",
      ktc_value: 7000,
      player: emptyPlayer({
        position: "RB",
        rb_role_tier: "bellcow",
        age: 25,
        compounding_news_count: 4,
      }),
    }),
  );
  const stableWidth = stable.variance_band.hi - stable.variance_band.lo;
  const compoundWidth = compound.variance_band.hi - compound.variance_band.lo;
  check(
    "compounding-news widens variance band",
    compoundWidth > stableWidth + 4,
    `stable=${stableWidth} compound=${compoundWidth}`,
  );
  check(
    "compounding-news fires arbitrage flag",
    compound.arbitrage_flags.includes("compounding_news"),
    `flags=${compound.arbitrage_flags.join(",")}`,
  );
}

// === Confidence calibration ===
console.log("\n  Confidence calibration:");
{
  // Confidence is in [0.35, 0.95] from band tightness
  const out = evaluate(
    ctx({
      position: "RB",
      ktc_value: 7000,
      player: emptyPlayer({
        position: "RB",
        rb_role_tier: "bellcow",
        age: 25,
      }),
    }),
  );
  check(
    "confidence in [0.35, 0.95]",
    out.confidence >= 0.35 && out.confidence <= 0.95,
    `conf=${out.confidence.toFixed(2)}`,
  );
}

// === Evidence stack populated ===
console.log("\n  Evidence stack contract:");
{
  const out = evaluate(
    ctx({
      position: "RB",
      ktc_value: 7000,
      player: emptyPlayer({
        position: "RB",
        rb_role_tier: "bellcow",
        age: 25,
      }),
    }),
  );
  check(
    "evidence_stack has 2+ entries for coded RB",
    out.evidence_stack.length >= 2,
    `count=${out.evidence_stack.length}`,
  );
  check(
    "evidence_stack carries source citations",
    out.evidence_stack.every((e) => e.source.length > 0),
    "all sources non-empty",
  );
}

// === Tier math ===
console.log("\n  Tier computation (variance-band overlap):");
{
  // Two clear tiers: Bijan-Gibbs at top, then a cliff to Jeanty-Love
  const result = computeTiers([
    {
      player_id: "bijan",
      point_estimate: 100,
      variance_band: { lo: 93, hi: 100 },
    },
    {
      player_id: "gibbs",
      point_estimate: 95,
      variance_band: { lo: 88, hi: 100 },
    },
    {
      player_id: "jeanty",
      point_estimate: 69,
      variance_band: { lo: 62, hi: 76 },
    },
    {
      player_id: "love",
      point_estimate: 65,
      variance_band: { lo: 58, hi: 72 },
    },
  ]);
  check(
    "Bijan and Gibbs in tier 1 (bands overlap)",
    result.assignments.get("bijan")?.tier === 1 &&
      result.assignments.get("gibbs")?.tier === 1,
    `bijan=${result.assignments.get("bijan")?.tier} gibbs=${result.assignments.get("gibbs")?.tier}`,
  );
  check(
    "Jeanty and Love drop to tier 2 (no overlap with tier 1)",
    result.assignments.get("jeanty")?.tier === 2 &&
      result.assignments.get("love")?.tier === 2,
    `jeanty=${result.assignments.get("jeanty")?.tier} love=${result.assignments.get("love")?.tier}`,
  );
  check(
    "Gibbs is last-in-tier 1",
    result.assignments.get("gibbs")?.isLastInTier === true,
    `gibbs.isLastInTier=${result.assignments.get("gibbs")?.isLastInTier}`,
  );
  check(
    "Bijan is first-in-tier 1",
    result.assignments.get("bijan")?.isFirstInTier === true,
    `bijan.isFirstInTier=${result.assignments.get("bijan")?.isFirstInTier}`,
  );
  check(
    "Tier 1 metadata: count 2, range 95-100",
    result.tiers[0].count === 2 &&
      result.tiers[0].rangeHi === 100 &&
      result.tiers[0].rangeLo === 95,
    `tier1: count=${result.tiers[0].count} range=${result.tiers[0].rangeLo}-${result.tiers[0].rangeHi}`,
  );
}
{
  // Single-linkage transitivity: P1-P2 overlap, P2-P3 overlap, but
  // P1-P3 don't overlap. All three should still be tier 1.
  const result = computeTiers([
    {
      player_id: "p1",
      point_estimate: 100,
      variance_band: { lo: 93, hi: 100 },
    },
    {
      player_id: "p2",
      point_estimate: 88,
      variance_band: { lo: 82, hi: 95 },
    },
    {
      player_id: "p3",
      point_estimate: 78,
      variance_band: { lo: 72, hi: 84 },
    },
  ]);
  check(
    "single-linkage transitivity: chained overlaps form one tier",
    result.assignments.get("p1")?.tier === 1 &&
      result.assignments.get("p2")?.tier === 1 &&
      result.assignments.get("p3")?.tier === 1,
    "all three in tier 1",
  );
}
{
  const result = computeTiers([]);
  check(
    "empty input returns empty result",
    result.assignments.size === 0 && result.tiers.length === 0,
    "no crash",
  );
}
{
  check(
    "scarcity: 0-1 = critical",
    classifyTierScarcity(1) === "critical",
    `got ${classifyTierScarcity(1)}`,
  );
  check(
    "scarcity: 2-3 = scarce",
    classifyTierScarcity(3) === "scarce",
    `got ${classifyTierScarcity(3)}`,
  );
  check(
    "scarcity: 7+ = deep",
    classifyTierScarcity(10) === "deep",
    `got ${classifyTierScarcity(10)}`,
  );
}

console.log(`\nResult: ${passed} passed, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
