/**
 * fill_starter_urgent regression. Locks in the Warren-vs-Judkins
 * standing-call fix from 2026-05-08.
 *
 *   npx tsx --tsconfig tsconfig.json evals/fill-starter-urgent.test.ts
 *
 * Bug: when two positions both fired fill_starter_urgent (e.g., user
 * had empty RB AND empty TE slots), the rule pushed both candidates
 * with a flat score of 100. Stable sort + position iteration order
 * (QB, RB, WR, TE) made RB win every tie regardless of relative
 * value, ADP-extremeness, or survival probability. Coach correctly
 * re-derived the right answer (Warren) when prompted; the engine had
 * the data but ignored it during scoring.
 *
 * Fix: incorporate adpGapModifier (same modifier earned_value uses)
 * so a player who is significantly more past ADP outranks a player
 * who is barely past ADP among fill_starter_urgent candidates.
 *
 * Body-copy bug also tested here: prior code computed "N picks past
 * consensus" against nextUserPickNo, producing "ADP 54 is 11 picks
 * past consensus" when the actual gap was 2 picks. Fix: compute
 * gapToCurrent against currentPickNo for "past consensus" framing.
 */

import { synthesizeDecision } from "../src/lib/strategy/decision-synthesis/synthesize";
import type { LeagueSnapshot } from "../src/lib/strategy/league-state/snapshot";
import type { AvailablePlayer } from "../src/lib/players/available";
import type { RankedArchetype } from "../src/lib/strategy/archetypes/schema";
import type { WindowsResult } from "../src/lib/strategy/windows/compute";

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

function makeSnapshot(opts: {
  myCounts: { QB: number; RB: number; WR: number; TE: number };
  hard: { QB: number; RB: number; WR: number; TE: number };
  flex: number;
  superflex: number;
  currentPickNo: number;
  nextPickNo: number;
  // When true, populate the 11 opponent rosters with empty RB and TE
  // slots so the gap walk produces real demand at those positions.
  // Drives survival to coin_flip / probably_gone, which is the
  // condition fill_starter_urgent (vs fill_starter at score 60) gates on.
  hungryOpponents?: boolean;
}): LeagueSnapshot {
  const totalTeams = 12;
  // Build 12 rosters: roster 1 is the user, rosters 2..12 are
  // opponents. When hungryOpponents is true, opponents start with
  // empty RB/TE so the gap walk reads them as needing both positions.
  const rosters: LeagueSnapshot["rosters"] = [];
  for (let rid = 1; rid <= totalTeams; rid++) {
    const isMe = rid === 1;
    const counts = isMe
      ? { ...opts.myCounts, K: 0, DST: 0 }
      : opts.hungryOpponents
        ? { QB: 1, RB: 0, WR: 1, TE: 0, K: 0, DST: 0 }
        : { QB: 1, RB: 1, WR: 1, TE: 1, K: 0, DST: 0 };
    rosters.push({
      roster_id: rid,
      owner_id: `u${rid}`,
      owner_name: isMe ? "Me" : `Opp${rid}`,
      is_me: isMe,
      position_counts: counts,
      position_ranks: { QB: [], RB: [], WR: [], TE: [], K: [], DST: [] },
      player_ids: [],
      avg_age: 26,
      starter_avg_age: 26,
      starter_talent_score: 0.5,
      wins: 0,
      losses: 0,
      ties: 0,
    });
  }
  // Slot mapping: 12 slots, identity mapping (slot N → roster N).
  const slot_to_roster_id: Record<number, number> = {};
  for (let s = 1; s <= totalTeams; s++) slot_to_roster_id[s] = s;
  return {
    league_id: "test",
    season: "2026",
    total_teams: totalTeams,
    format: opts.superflex > 0 ? "superflex" : "1qb",
    league_type: "keeper",
    max_keepers: 3,
    scoring: ["PPR", "TE-premium"],
    starter_slots: {
      hard: { ...opts.hard, K: 0, DST: 0 },
      flex: opts.flex,
      superflex: opts.superflex,
      rec_flex: 0,
      bench: 5,
    },
    rosters,
    my_roster_id: 1,
    draft: {
      status: "drafting",
      type: "snake",
      rounds: 20,
      reversal_round: null,
      slot_to_roster_id,
      my_slot: 1,
      next_pick_no: opts.currentPickNo,
      picks_made: [],
      traded_picks: [],
      my_pick_schedule: [
        {
          pick_no: opts.currentPickNo,
          round: Math.ceil(opts.currentPickNo / 12),
          pick_label: `${Math.ceil(opts.currentPickNo / 12)}.X`,
          gap_to_prev: 12,
          gap_to_next: opts.nextPickNo - opts.currentPickNo,
          density_kind: "normal",
        },
        {
          pick_no: opts.nextPickNo,
          round: Math.ceil(opts.nextPickNo / 12),
          pick_label: `${Math.ceil(opts.nextPickNo / 12)}.X`,
          gap_to_prev: opts.nextPickNo - opts.currentPickNo,
          gap_to_next: 12,
          density_kind: "normal",
        },
      ],
    },
    agg: {
      teams_without_position_after_round: () => 0,
      avg_position_count: () => 0,
    },
  } as unknown as LeagueSnapshot;
}

let nextId = 1;
function makePlayer(opts: {
  name: string;
  position: "QB" | "RB" | "WR" | "TE";
  age: number;
  is_rookie?: boolean;
  adp?: number;
  search_rank?: number;
}): AvailablePlayer {
  return {
    id: `p${nextId++}`,
    name: opts.name,
    position: opts.position,
    team: "TST",
    age: opts.age,
    yearsExp: opts.is_rookie ? 0 : Math.max(1, opts.age - 22),
    search_rank: opts.search_rank ?? 200,
    dynasty_rank: opts.search_rank ?? 200,
    adp: opts.adp ?? null,
    adp_variant: "dynasty_superflex",
    is_rookie: opts.is_rookie ?? false,
  } as unknown as AvailablePlayer;
}

function emptyArchetypes(): RankedArchetype[] {
  return [];
}

function emptyWindows(): WindowsResult {
  return {
    declared: null,
    auto: { label: "Balanced", strength: "none" as const, sentence: "" },
    win_now_score: 50,
    future_score: 50,
    composite: 0,
  } as unknown as WindowsResult;
}

function run() {
  console.log("\n── 1. Multi-position urgent: ADP-extreme TE beats at-ADP RB ──");
  {
    // izzydabomb live-draft scenario 2026-05-08. SF + TE-premium + 3-keeper.
    // User at pick 5.8 (overall 56), next pick at 6.5 (overall ~65).
    // Empty RB (need 2) and empty TE (need 1). Both should fire
    // fill_starter_urgent. Warren is 21 picks past ADP; Judkins is 2
    // picks past. Warren should win on adpGapModifier despite stable
    // sort defaulting to RB on flat 100.
    const snap = makeSnapshot({
      myCounts: { QB: 2, RB: 0, WR: 1, TE: 0 },
      hard: { QB: 1, RB: 2, WR: 2, TE: 1 },
      flex: 1,
      superflex: 1,
      currentPickNo: 56,
      nextPickNo: 65,
      hungryOpponents: true,
    });
    const available: AvailablePlayer[] = [
      // Tyler Warren-equiv: TE, ADP 35, sitting at pick 56 = 21 picks past ADP.
      makePlayer({ name: "Tyler Warren", position: "TE", age: 23, adp: 35, search_rank: 35 }),
      // Quinshon Judkins-equiv: RB, ADP 54, sitting at pick 56 = 2 picks past ADP.
      makePlayer({ name: "Quinshon Judkins", position: "RB", age: 22, adp: 54, search_rank: 54 }),
      // Filler so the available pool isn't degenerate
      makePlayer({ name: "Filler WR", position: "WR", age: 24, adp: 70, search_rank: 70 }),
      makePlayer({ name: "Filler RB2", position: "RB", age: 25, adp: 80, search_rank: 80 }),
    ];
    const decision = synthesizeDecision({
      snap,
      available,
      ranked: emptyArchetypes(),
      windows: emptyWindows(),
      picks_until_me: 0,
    });
    check(
      "winning rule is fill_starter_urgent",
      decision?.recommendation.rule === "fill_starter_urgent",
      `actual: ${decision?.recommendation.rule}`,
    );
    check(
      "ADP-extreme TE beats at-ADP RB on standing call",
      decision?.recommendation.name === "Tyler Warren",
      `actual: ${decision?.recommendation.name}`,
    );
  }

  console.log("\n── 2. Equal ADP gap: stable sort still applies (RB before TE) ──");
  {
    // Edge case: when two fill_starter_urgent candidates have IDENTICAL
    // ADP gap, scores tie at 100 + identical adjustment. Stable sort
    // breaks the tie by position iteration order (RB before TE).
    // This test pins that fallback so the fix doesn't accidentally
    // promote TE over RB when the signal is genuinely equal.
    const snap = makeSnapshot({
      myCounts: { QB: 2, RB: 0, WR: 1, TE: 0 },
      hard: { QB: 1, RB: 2, WR: 2, TE: 1 },
      flex: 1,
      superflex: 1,
      currentPickNo: 56,
      nextPickNo: 65,
      hungryOpponents: true,
    });
    const available: AvailablePlayer[] = [
      makePlayer({ name: "Equal RB", position: "RB", age: 22, adp: 54, search_rank: 54 }),
      makePlayer({ name: "Equal TE", position: "TE", age: 23, adp: 54, search_rank: 54 }),
      makePlayer({ name: "Filler WR", position: "WR", age: 24, adp: 70, search_rank: 70 }),
    ];
    const decision = synthesizeDecision({
      snap,
      available,
      ranked: emptyArchetypes(),
      windows: emptyWindows(),
      picks_until_me: 0,
    });
    check(
      "equal-gap tie defaults to RB by position iteration order",
      decision?.recommendation.name === "Equal RB",
      `actual: ${decision?.recommendation.name}`,
    );
  }

  console.log("\n── 3. Both rule branches break ties on ADP-extremity ──");
  {
    // The differentiator (adpGapModifier) is applied symmetrically to
    // both fill_starter_urgent (score 100 + delta) and fill_starter
    // (score 60 + delta). Whichever branch fires for the test scenario,
    // ADP-extreme TE must beat at-ADP RB. Locks the same anti-pattern
    // class out of the non-urgent branch too.
    const snap = makeSnapshot({
      myCounts: { QB: 2, RB: 0, WR: 1, TE: 0 },
      hard: { QB: 1, RB: 2, WR: 2, TE: 1 },
      flex: 1,
      superflex: 1,
      currentPickNo: 56,
      nextPickNo: 65,
      // No hungry opponents → survival_pct stays high → fill_starter
      // (not _urgent) fires. Tests the score: 60 branch.
      hungryOpponents: false,
    });
    const available: AvailablePlayer[] = [
      // ADP-extreme TE
      makePlayer({ name: "Past-ADP TE", position: "TE", age: 23, adp: 35, search_rank: 35 }),
      // At-ADP RB
      makePlayer({ name: "At-ADP RB", position: "RB", age: 22, adp: 54, search_rank: 54 }),
      makePlayer({ name: "Filler", position: "WR", age: 24, adp: 70, search_rank: 70 }),
    ];
    const decision = synthesizeDecision({
      snap,
      available,
      ranked: emptyArchetypes(),
      windows: emptyWindows(),
      picks_until_me: 0,
    });
    check(
      "fill_starter (non-urgent) also breaks ties on ADP-extremity",
      decision?.recommendation.name === "Past-ADP TE",
      `actual: ${decision?.recommendation.name} (rule ${decision?.recommendation.rule})`,
    );
  }

  console.log("\n── 4. Body copy: 'past consensus' uses currentPickNo, not nextUserPickNo ──");
  {
    // Bug 2 of the same incident. Standing-call body copy said
    // "ADP 54 is 11 picks past consensus" when actual gap to current
    // pick was 2. Coach said "1 pick past consensus" (correct enough).
    // Fix: gapToCurrent (= adp - currentPickNo) drives the "past
    // consensus" string; gapToNext stays for "past your next slot."
    const snap = makeSnapshot({
      myCounts: { QB: 2, RB: 0, WR: 1, TE: 1 },
      hard: { QB: 1, RB: 2, WR: 2, TE: 1 },
      flex: 1,
      superflex: 1,
      currentPickNo: 56,
      nextPickNo: 65,
      hungryOpponents: true,
    });
    const available: AvailablePlayer[] = [
      // RB at ADP 54, current pick 56 → 2 picks past consensus.
      // Survival math should fire coin_flip or probably_gone since
      // this is the user's only urgent fill. Body copy must say "2 picks past consensus".
      makePlayer({ name: "Past-Consensus RB", position: "RB", age: 22, adp: 54, search_rank: 54 }),
      makePlayer({ name: "Filler WR", position: "WR", age: 24, adp: 70, search_rank: 70 }),
    ];
    const decision = synthesizeDecision({
      snap,
      available,
      ranked: emptyArchetypes(),
      windows: emptyWindows(),
      picks_until_me: 0,
    });
    const reason = decision?.recommendation.primary_reason ?? "";
    const mentions11 = reason.includes("11 pick");
    const mentions2 = reason.includes("2 pick") || reason.includes("at or near");
    check(
      "body copy does NOT say '11 picks past consensus'",
      !mentions11,
      `reason: ${reason.slice(0, 200)}`,
    );
    check(
      "body copy mentions either '2 pick' or 'at or near' framing",
      mentions2,
      `reason: ${reason.slice(0, 200)}`,
    );
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
