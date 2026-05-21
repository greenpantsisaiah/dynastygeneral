/**
 * league-read structural-constraint + leverage-scoring regression.
 * Locks the 2026-05-20 retirement of the binary starter-gap guardrail.
 *
 *   npx tsx --tsconfig tsconfig.json evals/league-read.test.ts
 *
 * Bug class: the prior StructuralConstraint fired is_active: true
 * whenever ANY position sat below starter_max. That is tautological
 * in early/mid draft (every roster is below starter_max for the first
 * several rounds), so the "Hold pick equity until starter holes fill"
 * prescription attached to nearly every trade evaluation and
 * contradicted the EV-arbitrage thesis (REDESIGN_INTENTIONS Principle
 * 8). Founder challenged it; dynasty-canon-keeper DEBUNK and dynasty-
 * assumption-auditor both ruled it research-indefensible.
 *
 * The fix demotes the constraint to data. is_active fires ONLY when
 * (unrecoverable_severity AND early_round_pick_equity AND a real
 * positions_unfilled gap) all hold. Sources: Massey-Thaler 2013
 * (convex pick value), Stuart Football Perspective AV chart (steep
 * decay by round), KTC FAQ (repricing in days).
 *
 * This test also locks three other constants the same audit corrected:
 * panic-label ordering (autopicker < tilted_buyer), value-floor
 * surplus, and format-aware trade-window peak round.
 */

import { analyzeLeagueRead } from "../src/lib/strategy/league-read/analyze";
import type { OpponentRosterSnapshot } from "../src/lib/strategy/league-read/analyze";
import type { FormatRules } from "../src/lib/engine/llm-contract";
import type {
  LeagueProfile,
  TeamLabel,
  TeamProfile,
} from "../src/lib/engine/opponent";
import type { Position } from "../src/lib/strategy/archetypes/schema";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function makeFormatRules(opts: {
  qb?: number;
  rb?: number;
  wr?: number;
  te?: number;
  superflex?: boolean;
  te_premium?: boolean;
}): FormatRules {
  const sf = opts.superflex ?? false;
  return {
    qb_starters_max: opts.qb ?? (sf ? 2 : 1),
    rb_starters_max: opts.rb ?? 2,
    wr_starters_max: opts.wr ?? 2,
    te_starters_max: opts.te ?? 1,
    k_starters_max: 0,
    dst_starters_max: 0,
    has_k: false,
    has_dst: false,
    second_qb_starts: sf,
    te_premium: opts.te_premium ?? false,
    is_superflex: sf,
    flex_eligible: ["RB", "WR", "TE"] as const,
    sf_eligible: sf ? (["QB", "RB", "WR", "TE"] as const) : null,
    league_type: "dynasty",
    max_keepers: null,
  };
}

function makeTeam(opts: {
  roster_id: number;
  owner_name: string;
  label: TeamLabel;
  counts: { QB: number; RB: number; WR: number; TE: number };
}): TeamProfile {
  return {
    roster_id: opts.roster_id,
    owner_name: opts.owner_name,
    record: { wins: 0, losses: 0, ties: 0, fpts: 0 },
    standing_rank: null,
    counts: { ...opts.counts, other: 0 },
    starter_quality: { QB: "unknown", RB: "unknown", WR: "unknown", TE: "unknown" },
    age_buckets: { young: 0, peak: 0, aging: 0, old: 0 },
    avg_age: 26,
    headline_players: [],
    strengths: [],
    pain_points: [],
    label: opts.label,
  };
}

function emptyValues(): Record<
  Position,
  Array<{ player_id: string; player_name: string; value: number }>
> {
  return { QB: [], RB: [], WR: [], TE: [], K: [], DST: [] };
}

function valuesFor(
  pos: Position,
  vals: number[],
): Record<
  Position,
  Array<{ player_id: string; player_name: string; value: number }>
> {
  const out = emptyValues();
  out[pos] = vals.map((v, i) => ({
    player_id: `${pos}${i}`,
    player_name: `${pos} body ${i}`,
    value: v,
  }));
  return out;
}

function profileOf(teams: TeamProfile[]): LeagueProfile {
  return {
    teams,
    dynamics: { trade_counterparties: [], non_buyers: [], tilted_buyers: [] },
  };
}

const noOppRosters = new Map<number, OpponentRosterSnapshot>();

function run() {
  console.log("\n── 1. Recoverable mid-draft: is_active false (the founder's bug) ──");
  {
    // SF + TE-premium, round 4 (live pick 40 of 12), user below starter
    // at RB/WR/TE with 16 picks still ahead. This is the exact lincoln-
    // english/izzydabomb scenario: gap is real but trivially closeable.
    // The prior binary fired the "hold pick equity" guardrail here; the
    // fix must not.
    const lr = analyzeLeagueRead({
      profile: profileOf([]),
      formatRules: makeFormatRules({ superflex: true, te_premium: true }),
      userState: {
        position_counts: { QB: 2, RB: 0, WR: 1, TE: 0, K: 0, DST: 0 },
        player_values_by_position: emptyValues(),
      },
      myRosterId: 1,
      opponentRosters: noOppRosters,
      currentPickNo: 40,
      userPicksRemaining: 16,
      totalRosters: 12,
      rounds: 20,
    });
    const c = lr.structural_constraints[0];
    check("positions_unfilled includes RB, WR, TE",
      c.positions_unfilled.includes("RB") &&
      c.positions_unfilled.includes("WR") &&
      c.positions_unfilled.includes("TE"),
      `actual: [${c.positions_unfilled.join(", ")}]`);
    check("unrecoverable_severity is false (gap 4 vs 16 picks)",
      c.unrecoverable_severity === false,
      `total_gap=${c.total_starter_gap}, picks_remaining=${c.picks_remaining}`);
    check("is_active is false (recoverable)", c.is_active === false);
    check("guardrail_message says recoverable, not 'hold pick equity'",
      c.guardrail_message.toLowerCase().includes("recoverable") &&
      !c.guardrail_message.toLowerCase().includes("hold pick equity"),
      `msg: ${c.guardrail_message.slice(0, 80)}`);
  }

  console.log("\n── 2. Unrecoverable + early round: is_active true (the narrow case) ──");
  {
    // Round 3 (live pick 30 of 12) but the user traded away nearly all
    // their picks; only 2 remain against a 4-body starter gap. Pick
    // equity here is genuinely load-bearing (Massey-Thaler): you cannot
    // fill the lineup, so don't deal the 2 picks for futures.
    const lr = analyzeLeagueRead({
      profile: profileOf([]),
      formatRules: makeFormatRules({ superflex: true, te_premium: true }),
      userState: {
        position_counts: { QB: 2, RB: 0, WR: 1, TE: 0, K: 0, DST: 0 },
        player_values_by_position: emptyValues(),
      },
      myRosterId: 1,
      opponentRosters: noOppRosters,
      currentPickNo: 30,
      userPicksRemaining: 2,
      totalRosters: 12,
      rounds: 20,
    });
    const c = lr.structural_constraints[0];
    check("unrecoverable_severity is true (gap 4 vs 2 picks)",
      c.unrecoverable_severity === true,
      `total_gap=${c.total_starter_gap}, picks_remaining=${c.picks_remaining}`);
    check("early_round_pick_equity is true (round 3)",
      c.early_round_pick_equity === true);
    check("is_active is true (all three conditions hold)", c.is_active === true);
    check("guardrail_message names the unrecoverable gap",
      c.guardrail_message.toLowerCase().includes("unrecoverable"),
      `msg: ${c.guardrail_message.slice(0, 80)}`);
  }

  console.log("\n── 3. Unrecoverable but LATE round: early-round gate suppresses ──");
  {
    // Live pick 130 (round 11). Gap 3 exceeds 1 pick remaining, so
    // severity is unrecoverable, BUT a round-11 pick has near-zero
    // AV-weighted equity (Stuart). "Hold equity" is incoherent here;
    // the early-round gate must keep is_active false.
    const lr = analyzeLeagueRead({
      profile: profileOf([]),
      formatRules: makeFormatRules({ superflex: true }),
      userState: {
        position_counts: { QB: 2, RB: 1, WR: 1, TE: 0, K: 0, DST: 0 },
        player_values_by_position: emptyValues(),
      },
      myRosterId: 1,
      opponentRosters: noOppRosters,
      currentPickNo: 130,
      userPicksRemaining: 1,
      totalRosters: 12,
      rounds: 20,
    });
    const c = lr.structural_constraints[0];
    check("unrecoverable_severity is true", c.unrecoverable_severity === true,
      `total_gap=${c.total_starter_gap}, picks_remaining=${c.picks_remaining}`);
    check("early_round_pick_equity is false (round 11)",
      c.early_round_pick_equity === false);
    check("is_active is false (late-round equity is near zero)",
      c.is_active === false);
  }

  console.log("\n── 4. Starters covered: is_active false, window-open message ──");
  {
    const lr = analyzeLeagueRead({
      profile: profileOf([]),
      formatRules: makeFormatRules({ superflex: true, te_premium: true }),
      userState: {
        position_counts: { QB: 2, RB: 2, WR: 2, TE: 1, K: 0, DST: 0 },
        player_values_by_position: emptyValues(),
      },
      myRosterId: 1,
      opponentRosters: noOppRosters,
      currentPickNo: 40,
      userPicksRemaining: 16,
      totalRosters: 12,
      rounds: 20,
    });
    const c = lr.structural_constraints[0];
    check("positions_unfilled empty", c.positions_unfilled.length === 0);
    check("is_active false", c.is_active === false);
    check("message says starters covered",
      c.guardrail_message.toLowerCase().includes("starters covered"),
      `msg: ${c.guardrail_message.slice(0, 80)}`);
  }

  console.log("\n── 5. Panic-label ordering: autopicker < tilted_buyer ──");
  {
    // Both opponents have an RB hole; user holds a value-clearing RB
    // surplus. The reordering (2026-05-20) drops autopicker below
    // tilted_buyer: autopickers are absent, tilted_buyers respond.
    const teams = [
      makeTeam({ roster_id: 2, owner_name: "Tilted", label: "tilted_buyer", counts: { QB: 2, RB: 0, WR: 2, TE: 1 } }),
      makeTeam({ roster_id: 3, owner_name: "Asleep", label: "autopicker", counts: { QB: 2, RB: 0, WR: 2, TE: 1 } }),
    ];
    const lr = analyzeLeagueRead({
      profile: profileOf(teams),
      formatRules: makeFormatRules({ superflex: true }),
      userState: {
        // All starters covered so receivePosition stays null (no +5 noise).
        position_counts: { QB: 2, RB: 3, WR: 2, TE: 1, K: 0, DST: 0 },
        player_values_by_position: valuesFor("RB", [60, 50, 40]),
      },
      myRosterId: 1,
      opponentRosters: noOppRosters,
      currentPickNo: 40,
      userPicksRemaining: 16,
      totalRosters: 12,
      rounds: 20,
    });
    const tilted = lr.top_leverage_opportunities.find((o) => o.opponent_name === "Tilted");
    const asleep = lr.top_leverage_opportunities.find((o) => o.opponent_name === "Asleep");
    check("both opportunities generated", tilted != null && asleep != null,
      `count=${lr.top_leverage_opportunities.length}`);
    check("tilted_buyer score (80) > autopicker score (40)",
      (tilted?.leverage_score ?? 0) > (asleep?.leverage_score ?? 0),
      `tilted=${tilted?.leverage_score}, autopicker=${asleep?.leverage_score}`);
  }

  console.log("\n── 6. Value-floor surplus: low-value bodies are not a trade chip ──");
  {
    const teams = [
      makeTeam({ roster_id: 2, owner_name: "Tilted", label: "tilted_buyer", counts: { QB: 2, RB: 0, WR: 2, TE: 1 } }),
    ];
    const base = {
      profile: profileOf(teams),
      formatRules: makeFormatRules({ superflex: true }),
      myRosterId: 1,
      opponentRosters: noOppRosters,
      currentPickNo: 40,
      userPicksRemaining: 16,
      totalRosters: 12,
      rounds: 20,
    };
    // Low-value RB depth: marginal (median) = 8 < floor 30 → no surplus.
    const low = analyzeLeagueRead({
      ...base,
      userState: {
        position_counts: { QB: 2, RB: 3, WR: 2, TE: 1, K: 0, DST: 0 },
        player_values_by_position: valuesFor("RB", [10, 8, 5]),
      },
    });
    // High-value RB depth: marginal = 50 ≥ floor 30 → surplus.
    const high = analyzeLeagueRead({
      ...base,
      userState: {
        position_counts: { QB: 2, RB: 3, WR: 2, TE: 1, K: 0, DST: 0 },
        player_values_by_position: valuesFor("RB", [60, 50, 40]),
      },
    });
    check("low-value RB depth yields no leverage opportunity",
      low.top_leverage_opportunities.length === 0,
      `count=${low.top_leverage_opportunities.length}`);
    check("high-value RB depth yields an RB-send opportunity",
      high.top_leverage_opportunities.some((o) => o.send_position === "RB"),
      `sends=[${high.top_leverage_opportunities.map((o) => o.send_position).join(", ")}]`);
  }

  console.log("\n── 7. Format-aware peak round (SF 5, TE-premium 8, 1QB 10) ──");
  {
    const baseArgs = {
      profile: profileOf([]),
      userState: {
        position_counts: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 } as Record<Position, number>,
        player_values_by_position: emptyValues(),
      },
      myRosterId: 1,
      opponentRosters: noOppRosters,
      currentPickNo: 18, // round 2 of 12 → liveRound + 2 = 4, below every baseline
      userPicksRemaining: 18,
      totalRosters: 12,
      rounds: 20,
    };
    const sf = analyzeLeagueRead({ ...baseArgs, formatRules: makeFormatRules({ superflex: true }) });
    const tep = analyzeLeagueRead({ ...baseArgs, formatRules: makeFormatRules({ te_premium: true }) });
    const oneQb = analyzeLeagueRead({ ...baseArgs, formatRules: makeFormatRules({}) });
    check("superflex peak round is 5", sf.trade_window?.peak_round === 5,
      `actual: ${sf.trade_window?.peak_round}`);
    check("TE-premium peak round is 8", tep.trade_window?.peak_round === 8,
      `actual: ${tep.trade_window?.peak_round}`);
    check("1QB peak round is 10", oneQb.trade_window?.peak_round === 10,
      `actual: ${oneQb.trade_window?.peak_round}`);
  }

  console.log("\n── 8. picks_remaining null: severity unknown, never fires ──");
  {
    // assembleContext path (decision endpoints) passes no draft state.
    // userPicksRemaining null must keep unrecoverable_severity false so
    // the guardrail never fires without draft data to back it.
    const lr = analyzeLeagueRead({
      profile: profileOf([]),
      formatRules: makeFormatRules({ superflex: true, te_premium: true }),
      userState: {
        position_counts: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 },
        player_values_by_position: emptyValues(),
      },
      myRosterId: 1,
      opponentRosters: noOppRosters,
      currentPickNo: null,
      userPicksRemaining: null,
      totalRosters: 12,
      rounds: 0,
    });
    const c = lr.structural_constraints[0];
    check("picks_remaining null", c.picks_remaining === null);
    check("unrecoverable_severity false without draft data",
      c.unrecoverable_severity === false);
    check("is_active false without draft data", c.is_active === false);
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
