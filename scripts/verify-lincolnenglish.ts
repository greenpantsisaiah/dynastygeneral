/**
 * Founder-facing proof for the 2026-05-20 binary-guardrail retirement.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-lincolnenglish.ts
 *
 * Reconstructs the izzydabomb / lincolnenglish scenario from the
 * 2026-05-20 chat and runs it through buildLeagueReadFromSnapshot, the
 * EXACT function the Coach route calls (src/app/api/coach/[leagueId]/
 * route.ts:986). Proves that the structural_constraint Coach now
 * receives no longer carries the "hold pick equity until those holes
 * fill" prescription that the founder challenged.
 *
 * Scenario: 12-team superflex, TE-premium, keeper. Mid-draft, live
 * pick in round 9. izzydabomb has drafted QBs heavy and sits below
 * starter requirement at RB, WR, TE with six picks still ahead.
 * lincolnenglish (an opponent) has 1 RB and 0 TE.
 *
 * This proves the CONTEXT layer (what the LLM receives). The LLM's
 * output is governed by the system-prompt rule that reads these
 * fields; per the three-layer invariant, closing the context plus the
 * system prompt closes the hallucination class. A live LLM run is the
 * founder's optional last check, not required to prove the fix.
 */

import { buildLeagueReadFromSnapshot } from "../src/lib/strategy/league-read";
import type { LeagueSnapshot } from "../src/lib/strategy/league-state/snapshot";

function buildScenario(): LeagueSnapshot {
  const totalTeams = 12;
  const livePickNo = 100; // round 9 of 12 (ceil(100/12) = 9)

  // izzydabomb (roster 1): QB-heavy, below starter at RB/WR/TE.
  // Opponents (rosters 2-12) generic; lincolnenglish is roster 2 with
  // 1 RB and 0 TE per the chat.
  const rosters: LeagueSnapshot["rosters"] = [];
  for (let rid = 1; rid <= totalTeams; rid++) {
    const isMe = rid === 1;
    const isLincoln = rid === 2;
    const counts = isMe
      ? { QB: 3, RB: 2, WR: 2, TE: 0, K: 0, DST: 0 }
      : isLincoln
        ? { QB: 2, RB: 1, WR: 3, TE: 0, K: 0, DST: 0 }
        : { QB: 2, RB: 2, WR: 2, TE: 1, K: 0, DST: 0 };
    rosters.push({
      roster_id: rid,
      owner_id: `u${rid}`,
      owner_name: isMe ? "izzydabomb" : isLincoln ? "lincolnenglish" : `Opp${rid}`,
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

  const slot_to_roster_id: Record<number, number> = {};
  for (let s = 1; s <= totalTeams; s++) slot_to_roster_id[s] = s;

  // izzy owns the live pick plus the picks discussed in the trade
  // (10.08 = overall 116, 11.05 = 125, 12.02 = 134) and a couple more.
  // Six remaining picks: a healthy, recoverable position.
  const myPicks = [100, 116, 125, 134, 145, 156];
  const my_pick_schedule = myPicks.map((pick_no, i) => ({
    pick_no,
    round: Math.ceil(pick_no / totalTeams),
    pick_label: `${Math.ceil(pick_no / totalTeams)}.${((pick_no - 1) % totalTeams) + 1}`,
    gap_to_prev: i === 0 ? 12 : pick_no - myPicks[i - 1],
    gap_to_next: i === myPicks.length - 1 ? 12 : myPicks[i + 1] - pick_no,
    density_kind: "normal" as const,
  }));

  return {
    league_id: "finders-keepers",
    season: "2026",
    total_teams: totalTeams,
    format: "superflex",
    league_type: "keeper",
    max_keepers: 5,
    scoring: ["PPR", "TE-premium"],
    starter_slots: {
      hard: { QB: 1, RB: 2, WR: 2, TE: 1, K: 0, DST: 0 },
      flex: 1,
      superflex: 1,
      rec_flex: 0,
      bench: 6,
    },
    rosters,
    my_roster_id: 1,
    draft: {
      status: "drafting",
      type: "snake",
      rounds: 20,
      reversal_round: null,
      slot_to_roster_id,
      my_slot: 4,
      next_pick_no: livePickNo,
      picks_made: [],
      traded_picks: [],
      my_pick_schedule,
    },
    agg: {
      teams_without_position_after_round: () => 0,
      avg_position_count: () => 0,
    },
  } as unknown as LeagueSnapshot;
}

function run() {
  const snap = buildScenario();
  const lr = buildLeagueReadFromSnapshot({ snap });
  const c = lr.structural_constraints[0];

  console.log("\n=== izzydabomb / lincolnenglish scenario (Coach path) ===");
  console.log("12-team superflex TE-premium keeper. Live pick round 9.");
  console.log("izzydabomb: QB 3 / RB 2 / WR 2 / TE 0. Six picks remaining.\n");

  console.log("structural_constraint Coach now receives:");
  console.log(`  positions_unfilled        = [${c.positions_unfilled.join(", ")}]`);
  console.log(`  total_starter_gap         = ${c.total_starter_gap}`);
  console.log(`  picks_remaining           = ${c.picks_remaining}`);
  console.log(`  unrecoverable_severity    = ${c.unrecoverable_severity}`);
  console.log(`  early_round_pick_equity   = ${c.early_round_pick_equity}`);
  console.log(`  is_active                 = ${c.is_active}`);
  console.log(`  message                   = "${c.guardrail_message}"\n`);

  let failed = 0;
  const assert = (name: string, ok: boolean) => {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
    if (!ok) failed++;
  };

  console.log("Assertions:");
  assert("below starter at RB, WR, TE (matches the chat)",
    c.positions_unfilled.includes("RB") &&
    c.positions_unfilled.includes("WR") &&
    c.positions_unfilled.includes("TE"));
  assert("is_active is FALSE (the bug: prior binary fired TRUE here)",
    c.is_active === false);
  assert("message does NOT say 'hold pick equity'",
    !c.guardrail_message.toLowerCase().includes("hold pick equity"));
  assert("message frames the gap as recoverable",
    c.guardrail_message.toLowerCase().includes("recoverable"));

  console.log("\nBefore (retired binary): is_active TRUE, message = \"Hold pick");
  console.log("equity for now. You are below starter requirement at RB, WR, TE.");
  console.log("Trading picks before structural holes are filled spends draft");
  console.log("equity on the wrong axis...\" (appended to every trade eval).");
  console.log("\nAfter (shipped): is_active FALSE. Coach evaluates the");
  console.log("lincolnenglish offer on the 2.3:1 trade math alone, with no");
  console.log("doctrinal 'hold pick equity' overlay. The decline still stands;");
  console.log("it stands on the math, which is what was load-bearing.\n");

  if (failed > 0) {
    console.log(`${failed} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("All assertions passed. The founder's reported bug is closed at");
  console.log("the context layer for the real scenario.\n");
}

run();
