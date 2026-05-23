/**
 * Companion beat classification regression. Locks the emotional-ROI loop
 * (Principle 13) so future refactors keep beats GROUNDED and the
 * honest-first reconciliation honest.
 *
 *   npx tsx --tsconfig tsconfig.json evals/companion.test.ts
 *
 * What this pins:
 *   - The grounding contract: no signal in, no beat out; every emitted
 *     beat carries a non-empty source.signal.
 *   - Honest-first reconciliation: favored loss = bad_beat, contrarian
 *     loss = critique, contrarian win = vindication, underdog loss = no
 *     beat (no manufactured drama).
 *   - Voice A: no em dashes, no exclamation points; scoped 'we' present.
 *   - Priority: a debate / bad beat outranks a calm milestone.
 */

import {
  classifyBeats,
  classifyDebateBeat,
  classifyAnticipationBeat,
  classifyMilestoneBeat,
  classifySnipeBeats,
  reconcileExpectation,
  expectationFromPickDeviation,
} from "../src/lib/strategy/companion/classify";
import {
  reconstructPickDebate,
  COMPANION_DEBATE_FRESH_PICKS,
  type DebatePickRef,
  type ResolvedName,
} from "../src/lib/strategy/companion/debate";
import { rankBeats, topBeat, priorityScore } from "../src/lib/strategy/companion/priority";
import { classifyPlayAdvancedBeats } from "../src/lib/strategy/companion/play-beats";
import type {
  AnticipationInput,
  Beat,
  ExpectationRecord,
} from "../src/lib/strategy/companion/types";
import type { PlayCommitment } from "../src/lib/strategy/plays/types";
import type { WhatIfReadout } from "../src/lib/strategy/decision-synthesis/whatif";
import type { PlanDisruption } from "../src/lib/last-visit/plan-disruption";
import type { LeagueEvBankReadout } from "../src/lib/strategy/ev-bank/league";

// Built without a literal codepoint so the source stays em-dash-clean.
const EM_DASH = String.fromCharCode(0x2014);

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ${"✓"} ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failed++;
    console.log(`  ${"✗"} ${name}${detail ? ` (${detail})` : ""}`);
  }
}

// --- fixtures (real readout shapes, no snapshot needed) ---

function whatIfEvansOverNabers(): WhatIfReadout {
  return {
    standing_call_id: "nabers",
    standing_call_ev: 6.0,
    entries: [
      {
        player_id: "nabers",
        player_name: "Malik Nabers",
        position: "WR",
        ev_if_chosen: 6.0,
        delta_vs_standing_call: 0,
        survival_pct: 40,
        is_standing_call: true,
        narrative: "",
      },
      {
        player_id: "evans",
        player_name: "Mike Evans",
        position: "WR",
        ev_if_chosen: 0.0,
        delta_vs_standing_call: -6.0,
        survival_pct: 65,
        is_standing_call: false,
        narrative: "",
      },
    ],
  };
}

function matchupRecord(winProb: number): ExpectationRecord {
  return {
    bet_id: "m1",
    league_id: "L",
    kind: "matchup",
    created_at_pick_no: null,
    created_at_week: 9,
    subject_player_id: null,
    subject_label: "Week 9 vs Saquonatraitor",
    expected_metric: "win_prob",
    expected_value: winProb,
    resolution_condition: "win week 9",
    horizon: "this_week",
    resolved: false,
  };
}

function contrarianPickRecord(): ExpectationRecord {
  return {
    bet_id: "p1",
    league_id: "L",
    kind: "pick",
    created_at_pick_no: 30,
    created_at_week: null,
    subject_player_id: "evans",
    subject_label: "Mike Evans",
    expected_metric: "ev",
    expected_value: 0,
    alternative_label: "Malik Nabers",
    alternative_value: 6,
    resolution_condition: "Evans season value vs Nabers",
    horizon: "this_season",
    resolved: false,
  };
}

function noEmDashOrBang(beat: Beat): boolean {
  const text = `${beat.headline} ${beat.body ?? ""}`;
  return !text.includes(EM_DASH) && !text.includes("!");
}

function run() {
  console.log("\nCompanion beat classification\n");

  // 1. Debate fires on a divergent pick.
  const debate = classifyDebateBeat(whatIfEvansOverNabers(), "evans", "dynasty_draft");
  check("debate beat fires on divergent pick", debate != null);
  check(
    "debate names both players",
    (debate?.headline.includes("Mike Evans") &&
      debate?.headline.includes("Malik Nabers")) ?? false,
    debate?.headline,
  );
  check("debate prompts a Coach handoff", debate?.prompts_handoff === true);
  check(
    "debate carries grounded source",
    (debate?.source.signal?.length ?? 0) > 0,
    debate?.source.signal,
  );

  // 2. No debate when the user took the call.
  check(
    "no debate when the user took the call",
    classifyDebateBeat(whatIfEvansOverNabers(), "nabers", "dynasty_draft") === null,
  );

  // 3. Grounding contract: empty inputs produce no beats.
  check(
    "no signal in, no beat out",
    classifyBeats({ stage: "dynasty_draft" }).length === 0,
  );

  // 4. Snipe -> commiserate bad_beat reusing the grounded acknowledgment.
  const pd: PlanDisruption = {
    snipes: [
      {
        player_id: "bigsby",
        player_name: "Tank Bigsby",
        drafted_by_roster_id: 3,
        drafted_by_owner: "Rival",
        pick_no: 42,
      },
    ],
    acknowledgment: "Bigsby gone, two picks before yours. The call below already accounts for it.",
  };
  const snipes = classifySnipeBeats(pd, "dynasty_draft");
  check("snipe produces a commiserate beat", snipes.length === 1 && snipes[0].tone === "commiserate");
  check(
    "snipe reuses the grounded acknowledgment",
    snipes[0]?.body?.includes("Bigsby gone") ?? false,
  );

  // 5. Anticipation: urgency from survival, suppressed when comfortable.
  const antUrgent: AnticipationInput = {
    subject_label: "Tank Bigsby",
    position: "RB",
    survival_pct: 18,
    to_pick_no: 84,
    to_pick_label: "7.12",
    ev_if_chosen: 5,
  };
  const ant = classifyAnticipationBeat(antUrgent, "dynasty_draft");
  check("anticipation fires under pressure", ant != null);
  check("anticipation urgency derives from survival", ant?.urgency === "act_now", ant?.urgency);
  check(
    "anticipation suppressed when survival is comfortable",
    classifyAnticipationBeat({ ...antUrgent, survival_pct: 88 }, "dynasty_draft") === null,
  );

  // 6. Milestone fires with a real rank.
  const bank: LeagueEvBankReadout = {
    rosters: [
      {
        roster_id: 1,
        owner_name: "You",
        is_me: true,
        total_ev: 14.2,
        range_low: 8,
        range_high: 20,
        resolved_picks: 5,
        total_picks: 5,
      },
    ],
    my_rank: 3,
    ranked_count: 12,
    my_percentile: 75,
    league_avg: 2.1,
  };
  const ms = classifyMilestoneBeat(bank, { picks_made: 8, total_picks: 16 }, "dynasty_draft");
  check("milestone fires with a real rank", ms != null);
  check("milestone leads with the number", ms?.headline.includes("3rd of 12") ?? false, ms?.headline);

  // 7. Honest-first reconciliation.
  const favoredLoss = reconcileExpectation(matchupRecord(0.78), {
    bet_id: "m1",
    resolved_value: 0,
    good: false,
    variance_flag: true,
    flipped_by: "Brenton's ACL in Q1",
  });
  check("favored loss -> bad_beat", favoredLoss.beat?.kind === "bad_beat", favoredLoss.record.outcome ?? "");
  check(
    "bad_beat cites the favored probability and the flip event",
    (favoredLoss.beat?.body?.includes("78%") &&
      favoredLoss.beat?.body?.includes("Brenton's ACL in Q1")) ?? false,
    favoredLoss.beat?.body,
  );

  const contrarianLoss = reconcileExpectation(contrarianPickRecord(), {
    bet_id: "p1",
    resolved_value: 0,
    good: false,
  });
  check("contrarian loss -> critique", contrarianLoss.beat?.kind === "critique", contrarianLoss.record.outcome ?? "");

  const contrarianWin = reconcileExpectation(contrarianPickRecord(), {
    bet_id: "p1",
    resolved_value: 9,
    good: true,
  });
  check("contrarian win -> vindication", contrarianWin.beat?.kind === "vindication", contrarianWin.record.outcome ?? "");
  check(
    "contrarian vindication phrases the gamble cashing",
    contrarianWin.beat?.headline.includes("gamble cashed") ?? false,
    contrarianWin.beat?.headline,
  );

  const underdogLoss = reconcileExpectation(matchupRecord(0.3), {
    bet_id: "m1",
    resolved_value: 0,
    good: false,
  });
  check("underdog loss -> no beat (no manufactured drama)", underdogLoss.beat === null, underdogLoss.record.outcome ?? "");

  // 8. expectationFromPickDeviation loads the ledger only on a real deviation.
  const rec = expectationFromPickDeviation({
    leagueId: "L",
    whatIf: whatIfEvansOverNabers(),
    chosenId: "evans",
    pickNo: 30,
  });
  check("deviation loads an expectation with the alternative", rec?.alternative_label === "Malik Nabers");
  check(
    "no expectation when the user took the call",
    expectationFromPickDeviation({
      leagueId: "L",
      whatIf: whatIfEvansOverNabers(),
      chosenId: "nabers",
      pickNo: 30,
    }) === null,
  );

  // 9. Every emitted beat carries a grounded source.
  const allBeats = classifyBeats({
    stage: "dynasty_draft",
    whatIf: whatIfEvansOverNabers(),
    chosenId: "evans",
    planDisruption: pd,
    anticipation: antUrgent,
    evBank: bank,
    draftProgress: { picks_made: 8, total_picks: 16 },
    resolvedBeats: [favoredLoss.beat!, contrarianWin.beat!],
  });
  check(
    "every beat carries a non-empty source.signal",
    allBeats.every((b) => (b.source.signal?.length ?? 0) > 0),
    `${allBeats.length} beats`,
  );

  // 10. Voice A: no em dashes, no exclamation points anywhere.
  check("no em dashes or exclamation points in any beat", allBeats.every(noEmDashOrBang));

  // Scoped 'we' present in shared-stakes beats.
  check(
    "vindication uses the scoped 'we'",
    contrarianWin.beat?.headline.startsWith("We called it") ?? false,
    contrarianWin.beat?.headline,
  );
  check(
    "bad_beat uses the scoped 'we'",
    favoredLoss.beat?.body?.includes("We were") ?? false,
  );

  // 11. Priority: a bad beat / debate outranks a calm milestone.
  check(
    "bad_beat outranks milestone",
    priorityScore(favoredLoss.beat!) > priorityScore(ms!),
  );
  const ranked = rankBeats(allBeats);
  check("topBeat returns the highest-priority beat", topBeat(allBeats) === ranked[0]);
  check(
    "milestone does not lead when a bad beat is present",
    ranked[0]?.kind !== "milestone",
    ranked[0]?.kind,
  );

  // 12. Play-reaction beat: a pick that advances a committed play.
  const commitment = {
    commitment_id: "c1",
    archetype: "qb_wr_stack",
    play_name: "Mayfield + Bucs Stack",
    league_id: "L",
    primary_player: {
      player_id: "mayfield",
      name: "Baker Mayfield",
      position: "QB",
      team: "TB",
    },
    followthrough_targets: [
      { player_id: "evans", name: "Mike Evans", position: "WR", team: "TB" },
      { player_id: "irving", name: "Bucky Irving", position: "RB", team: "TB" },
    ],
    followthrough_description: "Take a Bucs skill player",
    committed_at_pick_no: 12,
    lapses_after_pick_no: 60,
    committed_at: "2026-05-22T00:00:00Z",
    status: "active",
  } as unknown as PlayCommitment;

  const advanced = classifyPlayAdvancedBeats({
    commitments: [commitment],
    latestPick: { player_id: "evans", name: "Mike Evans" },
  });
  check(
    "play_advanced fires when a pick is a follow-through target",
    advanced.length === 1 && advanced[0].kind === "play_advanced",
  );
  check(
    "play_advanced names the play and the pick",
    (advanced[0]?.headline.includes("Mike Evans") &&
      advanced[0]?.headline.includes("Mayfield + Bucs Stack")) ?? false,
    advanced[0]?.headline,
  );
  check(
    "play_advanced names the next piece",
    advanced[0]?.body?.includes("Bucky Irving") ?? false,
    advanced[0]?.body,
  );
  check("play_advanced is a win", advanced[0]?.tone === "win");
  check(
    "play_advanced carries grounded source",
    (advanced[0]?.source.signal?.length ?? 0) > 0,
    advanced[0]?.source.signal,
  );
  check(
    "play_advanced has no em dash or exclamation",
    advanced[0] ? noEmDashOrBang(advanced[0]) : false,
  );
  check(
    "no play_advanced when the pick is not a target",
    classifyPlayAdvancedBeats({
      commitments: [commitment],
      latestPick: { player_id: "nabers", name: "Malik Nabers" },
    }).length === 0,
  );
  check(
    "no play_advanced without a latest pick",
    classifyPlayAdvancedBeats({ commitments: [commitment], latestPick: null })
      .length === 0,
  );

  // 13. Debate reconstruction from the last-visit cookie (honest-first).
  //     Founder report 2026-05-23: "I picked Elijah because it was the
  //     call, then I felt chided for it" + "no idea who 13320 is."
  const names: Record<string, ResolvedName> = {
    sarratt: { name: "Elijah Sarratt", position: "WR" },
    "13320": { name: "Available Guy", position: "RB" },
    nabers: { name: "Malik Nabers", position: "WR" },
  };
  const resolveName = (id: string): ResolvedName | null => names[id] ?? null;
  const resolveValue = (id: string): number | null =>
    ({ sarratt: 16, "13320": 20, nabers: 30 })[id] ?? null;
  const resolveAdp = (id: string): number | null =>
    ({ sarratt: 30, "13320": 25, nabers: 8 })[id] ?? null;
  const userPick = (player_id: string, pick_no: number): DebatePickRef => ({
    roster_id: 7,
    player_id,
    pick_no,
  });
  const baseArgs = {
    myRosterId: 7,
    currentCandidateIds: new Set<string>(["13320", "sarratt"]),
    resolveName,
    resolveValue,
    resolveAdp,
  };

  // Core incident: the cookie call is stale (the user picked many picks
  // after the render). No false chide.
  const stale = reconstructPickDebate({
    ...baseArgs,
    priorStandingCallId: "13320",
    priorTotalPicksMade: 100,
    // Sarratt taken well past the freshness window.
    picksMade: [userPick("sarratt", 100 + COMPANION_DEBATE_FRESH_PICKS + 5)],
  });
  check("stale cookie call does not chide (no false debate)", stale === null);

  // Fresh + corroborated + names resolve: a real divergence fires.
  const fresh = reconstructPickDebate({
    ...baseArgs,
    priorStandingCallId: "13320",
    priorTotalPicksMade: 100,
    picksMade: [userPick("sarratt", 101)],
  });
  check("fresh corroborated divergence reconstructs", fresh !== null);
  check(
    "reconstruction resolves both names (no raw id)",
    fresh?.whatIf.entries.every((e) => e.player_name !== e.player_id) ?? false,
    fresh?.whatIf.entries.map((e) => e.player_name).join(" / "),
  );
  check("reconstruction targets the chosen pick", fresh?.chosenId === "sarratt");

  // Unresolved call name suppresses (the "13320" leak guard): even fresh
  // and corroborated, an id we cannot name does not ship.
  const unnamed = reconstructPickDebate({
    ...baseArgs,
    resolveName: (id) => (id === "sarratt" ? names.sarratt : null),
    priorStandingCallId: "13320",
    priorTotalPicksMade: 100,
    picksMade: [userPick("sarratt", 101)],
  });
  check("unresolved call name suppresses (no raw-id leak)", unnamed === null);

  // Not corroborated by the current engine: a stale / pre-refactor call.
  const uncorroborated = reconstructPickDebate({
    ...baseArgs,
    currentCandidateIds: new Set<string>(["sarratt"]),
    priorStandingCallId: "13320",
    priorTotalPicksMade: 100,
    picksMade: [userPick("sarratt", 101)],
  });
  check(
    "call absent from current candidates suppresses",
    uncorroborated === null,
  );

  // Took the call: no debate.
  const tookCall = reconstructPickDebate({
    ...baseArgs,
    priorStandingCallId: "13320",
    priorTotalPicksMade: 100,
    picksMade: [userPick("13320", 101)],
  });
  check("took the call -> no debate", tookCall === null);

  // Anchors to the FIRST post-visit pick, not the most recent.
  const twoPicks = reconstructPickDebate({
    ...baseArgs,
    priorStandingCallId: "13320",
    priorTotalPicksMade: 100,
    picksMade: [userPick("nabers", 105), userPick("sarratt", 101)],
  });
  check(
    "anchors to first post-visit pick, not latest",
    twoPicks?.chosenId === "sarratt",
    twoPicks?.chosenId ?? "null",
  );

  // 14. Classifier backstop: an unresolved standing-call id never ships.
  const rawIdReadout: WhatIfReadout = {
    standing_call_id: "13320",
    standing_call_ev: 1,
    entries: [
      {
        player_id: "13320",
        player_name: "13320", // unresolved raw id
        position: null,
        ev_if_chosen: 1,
        delta_vs_standing_call: 0,
        survival_pct: null,
        is_standing_call: true,
        narrative: "",
      },
      {
        player_id: "sarratt",
        player_name: "Elijah Sarratt",
        position: "WR",
        ev_if_chosen: 6,
        delta_vs_standing_call: 5,
        survival_pct: null,
        is_standing_call: false,
        narrative: "",
      },
    ],
  };
  check(
    "classifier suppresses a beat with an unresolved raw-id call",
    classifyDebateBeat(rawIdReadout, "sarratt", "dynasty_draft") === null,
  );

  console.log(`\n${passed} passed ${"·"} ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
