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
  classifySeasonStandingBeat,
  classifyRosterTalentBeat,
  classifyCallbackBeats,
  buildPickResolutions,
  buildMatchupResolutions,
  reconcileExpectation,
  reconcileExpectations,
  expectationFromPickDeviation,
  expectationFromMatchup,
} from "../src/lib/strategy/companion/classify";
import {
  reconstructPickDebate,
  COMPANION_DEBATE_FRESH_PICKS,
  type DebatePickRef,
  type ResolvedName,
} from "../src/lib/strategy/companion/debate";
import { rankBeats, topBeat, priorityScore } from "../src/lib/strategy/companion/priority";
import {
  classifyPlayAdvancedBeats,
  classifyPlayBrokenBeats,
} from "../src/lib/strategy/companion/play-beats";
import type { PlanSnipe } from "../src/lib/last-visit/plan-disruption";
import type {
  AnticipationInput,
  Beat,
  ExpectationRecord,
  SeasonStandingInput,
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

  // 12b. Play-broken beat: a committed play's named partner was sniped by an
  //      opponent since last visit (consumes the PlanDisruption snipe diff,
  //      so it fires on the transition, not every visit).
  const snipe = (over: Partial<PlanSnipe> = {}): PlanSnipe => ({
    player_id: "evans",
    player_name: "Mike Evans",
    drafted_by_roster_id: 7,
    drafted_by_owner: "lincolnenglish",
    pick_no: 41,
    ...over,
  });
  const broken = classifyPlayBrokenBeats({
    commitments: [commitment],
    snipes: [snipe()],
  });
  check(
    "play_broken fires when a committed target is sniped",
    broken.length === 1 && broken[0].kind === "play_broken",
  );
  check(
    "play_broken names the play and the sniped piece",
    (broken[0]?.headline.includes("Mayfield + Bucs Stack") &&
      broken[0]?.body?.includes("Mike Evans")) ??
      false,
    `${broken[0]?.headline} / ${broken[0]?.body}`,
  );
  check(
    "play_broken names the holder",
    broken[0]?.body?.includes("lincolnenglish") ?? false,
    broken[0]?.body,
  );
  check(
    "play_broken commiserates (it is bad news)",
    broken[0]?.tone === "commiserate",
  );
  check(
    "play_broken offers a Coach handoff (the pivot is a conversation)",
    broken[0]?.prompts_handoff === true,
  );
  check(
    "play_broken carries grounded source",
    (broken[0]?.source.signal?.length ?? 0) > 0,
    broken[0]?.source.signal,
  );
  check(
    "play_broken has no em dash or exclamation",
    broken[0] ? noEmDashOrBang(broken[0]) : false,
  );
  check(
    "no play_broken when no snipe hits a committed target",
    classifyPlayBrokenBeats({
      commitments: [commitment],
      snipes: [snipe({ player_id: "nabers", player_name: "Malik Nabers" })],
    }).length === 0,
  );
  check(
    "no play_broken when there are no snipes at all",
    classifyPlayBrokenBeats({ commitments: [commitment], snipes: [] }).length ===
      0,
  );
  check(
    "no play_broken for a non-active (executed) commitment",
    classifyPlayBrokenBeats({
      commitments: [
        { ...commitment, status: "executed" } as unknown as PlayCommitment,
      ],
      snipes: [snipe()],
    }).length === 0,
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

  // 15. In-season standing milestone (the in-season visibility guarantee).
  //     The draft EV-bank milestone is blind in-season; this twin keeps
  //     the check-in non-empty after the draft, grounded in calcStanding.
  const standingTop: SeasonStandingInput = {
    rank: 2,
    of: 12,
    wins: 5,
    losses: 2,
    ties: 0,
  };
  const sb = classifySeasonStandingBeat(standingTop, "in_season");
  check("season-standing milestone fires in-season", sb != null);
  check(
    "season-standing leads with the rank",
    sb?.headline.includes("2nd of 12") ?? false,
    sb?.headline,
  );
  check("season-standing top-third reads as a win", sb?.tone === "win");
  check(
    "season-standing has no em dash or exclamation",
    sb ? noEmDashOrBang(sb) : false,
  );
  check(
    "season-standing suppressed outside in-season",
    classifySeasonStandingBeat(standingTop, "dynasty_draft") === null,
  );
  check(
    "season-standing suppressed before any games (0-0 is noise)",
    classifySeasonStandingBeat(
      { rank: 1, of: 12, wins: 0, losses: 0, ties: 0 },
      "in_season",
    ) === null,
  );

  // 15b. Offseason safety net: the roster-talent milestone, and the
  //      one-milestone fallback precedence (EV bank -> record -> talent).
  const talent = classifyRosterTalentBeat(
    { rank: 3, of: 12, value: 1840 },
    "in_season",
  );
  check("roster-talent milestone fires post-draft", talent != null);
  check(
    "roster-talent leads with the rank",
    talent?.headline.includes("3rd of 12 by roster value") ?? false,
    talent?.headline,
  );
  check(
    "roster-talent suppressed outside in-season",
    classifyRosterTalentBeat({ rank: 3, of: 12, value: 1840 }, "pre_draft") ===
      null,
  );
  // Offseason: no record, no EV bank -> exactly the roster-talent milestone.
  const offseason = classifyBeats({
    stage: "in_season",
    rosterTalent: { rank: 3, of: 12, value: 1840 },
    seasonStanding: { rank: 1, of: 12, wins: 0, losses: 0, ties: 0 },
  });
  check(
    "offseason hub gets exactly one (roster-talent) milestone",
    offseason.length === 1 &&
      offseason[0].kind === "milestone" &&
      offseason[0].headline.includes("roster value"),
    `${offseason.length} beats`,
  );
  // Once games are played, the record milestone wins; talent stays silent.
  const inSeasonStanding = classifyBeats({
    stage: "in_season",
    rosterTalent: { rank: 3, of: 12, value: 1840 },
    seasonStanding: { rank: 2, of: 12, wins: 5, losses: 2, ties: 0 },
  });
  check(
    "record milestone takes precedence over roster talent",
    inSeasonStanding.filter((b) => b.kind === "milestone").length === 1 &&
      inSeasonStanding.some((b) => b.headline.includes("by record")),
    inSeasonStanding.map((b) => b.headline).join(" | "),
  );

  // 16. Callback (the running story): a non-destructive head-to-head on an
  //     open pick bet, grounded in current value.
  const cbValues = new Map<string, number>([
    ["evans", 70],
    ["nabers", 64],
    ["bust", 40],
    ["star", 92],
  ]);
  const cbValueOf = (id: string | null): number | null =>
    id ? (cbValues.get(id) ?? null) : null;
  const pickBet = (
    betId: string,
    subjLabel: string,
    subjId: string,
    altLabel: string,
    altId: string,
  ): ExpectationRecord => ({
    bet_id: betId,
    league_id: "L",
    kind: "pick",
    created_at_pick_no: 30,
    created_at_week: null,
    subject_player_id: subjId,
    subject_label: subjLabel,
    expected_metric: "ev",
    expected_value: 0,
    alternative_label: altLabel,
    alternative_value: 6,
    alternative_player_id: altId,
    resolution_condition: "season value",
    horizon: "this_season",
    resolved: false,
  });
  const cbWin = classifyCallbackBeats({
    openBets: [pickBet("b1", "Mike Evans", "evans", "Malik Nabers", "nabers")],
    valueOf: cbValueOf,
    checkpointLabel: "week 9",
    stage: "in_season",
  });
  check("callback fires for an open pick bet", cbWin.length === 1);
  check(
    "callback (pick ahead) is a win and names the checkpoint",
    cbWin[0]?.tone === "win" && (cbWin[0]?.headline.includes("week 9") ?? false),
    cbWin[0]?.headline,
  );
  check(
    "callback body cites both current values",
    (cbWin[0]?.body?.includes("70") && cbWin[0]?.body?.includes("64")) ?? false,
    cbWin[0]?.body,
  );
  check(
    "callback has no em dash or exclamation",
    cbWin[0] ? noEmDashOrBang(cbWin[0]) : false,
  );
  // Behind, but not decisively (gap 64 vs 70 = -6, inside the band): a
  // neutral "still cooking" callback, not a graduated critique.
  const cbBehind = classifyCallbackBeats({
    openBets: [pickBet("b2", "Malik Nabers", "nabers", "Mike Evans", "evans")],
    valueOf: cbValueOf,
    checkpointLabel: "week 9",
    stage: "in_season",
  });
  check("callback (pick behind) is neutral", cbBehind[0]?.tone === "neutral");
  check(
    "callback skips a decisively separated bet (it graduates to reconcile)",
    classifyCallbackBeats({
      openBets: [pickBet("b3", "Star", "star", "Malik Nabers", "nabers")],
      valueOf: cbValueOf,
      checkpointLabel: "week 9",
      stage: "in_season",
    }).length === 0,
  );
  check(
    "callback skips a bet whose alternative cannot be priced",
    classifyCallbackBeats({
      openBets: [pickBet("b4", "Mike Evans", "evans", "Ghost", "ghost")],
      valueOf: cbValueOf,
      checkpointLabel: "week 9",
      stage: "in_season",
    }).length === 0,
  );

  // 17. Terminal reconcile: only a decisive value separation resolves a
  //     season-long bet, and a contrarian pick resolves honest-first.
  const decisiveWin = pickBet("w1", "Star", "star", "Malik Nabers", "nabers");
  const decisiveLoss = pickBet("l1", "Bust Pick", "bust", "Star", "star");
  const stillClose = pickBet("c1", "Mike Evans", "evans", "Malik Nabers", "nabers");
  const resolutions = buildPickResolutions({
    openBets: [decisiveWin, decisiveLoss, stillClose],
    valueOf: cbValueOf,
  });
  check(
    "only decisively separated bets resolve",
    resolutions.length === 2 &&
      resolutions.every((r) => r.bet_id !== "c1"),
    resolutions.map((r) => r.bet_id).join(","),
  );
  const recon = reconcileExpectations(
    [decisiveWin, decisiveLoss, stillClose],
    resolutions,
  );
  const winBeat = recon.beats.find((b) => b.bet_id === "w1");
  const lossBeat = recon.beats.find((b) => b.bet_id === "l1");
  check("decisive contrarian win -> vindication", winBeat?.kind === "vindication");
  check("decisive contrarian loss -> critique", lossBeat?.kind === "critique");
  check(
    "the still-close bet stays open (no resolution)",
    recon.records.find((r) => r.bet_id === "c1")?.resolved === false,
  );

  // ---- In-season matchup loop (Pillar 1A) ----
  console.log("\nIn-season matchup loop\n");

  // Write: favored roster (higher ppg) logs a points bet the classifier
  // reads as favored.
  const favBet = expectationFromMatchup({
    leagueId: "L",
    season: "2026",
    week: 9,
    opponentLabel: "Saquonatraitor",
    myPpg: 118.4,
    oppPpg: 102.1,
  });
  check("matchup write returns a bet", favBet != null);
  check(
    "matchup bet is keyed by season+week (idempotent)",
    favBet?.bet_id === "matchup-2026-9",
  );
  check(
    "favored roster: my ppg in expected_value, opp in alternative_value",
    favBet?.expected_value === 118.4 && favBet?.alternative_value === 102.1,
  );
  check(
    "matchup bet carries the named opponent + week label",
    favBet?.subject_label === "Week 9 vs Saquonatraitor" &&
      favBet?.kind === "matchup" &&
      favBet?.horizon === "this_week",
  );
  check(
    "bye week (null opp ppg) logs nothing, not a garbage bet",
    expectationFromMatchup({
      leagueId: "L",
      season: "2026",
      week: 9,
      opponentLabel: "bye",
      myPpg: 110,
      oppPpg: null,
    }) === null,
  );

  // Resolve: only prior weeks resolve; the current week stays open.
  {
    const week9Fav = expectationFromMatchup({
      leagueId: "L",
      season: "2026",
      week: 9,
      opponentLabel: "Opp",
      myPpg: 120,
      oppPpg: 100,
    })!;
    const currentWeekBet = expectationFromMatchup({
      leagueId: "L",
      season: "2026",
      week: 10,
      opponentLabel: "Opp",
      myPpg: 120,
      oppPpg: 100,
    })!;
    const res = buildMatchupResolutions({
      openBets: [week9Fav, currentWeekBet],
      currentWeek: 10,
      resultByBetId: new Map([
        ["matchup-2026-9", { myPoints: 95.2, oppPoints: 99.4 }],
      ]),
    });
    check("only the prior-week bet resolves (current stays open)", res.length === 1);
    const r9 = res.find((r) => r.bet_id === "matchup-2026-9");
    check("favored roster lost -> good is false", r9?.good === false);
    check(
      "favored close loss -> variance flagged with a margin",
      r9?.variance_flag === true && typeof r9?.flipped_by === "string",
    );

    // The full trio: favored close loss reconciles to a bad_beat.
    const badBeat = reconcileExpectation(week9Fav, res[0]);
    check(
      "favored close loss -> bad_beat (commiserate)",
      badBeat.beat?.kind === "bad_beat" && badBeat.beat?.tone === "commiserate",
    );

    // Favored win -> vindication.
    const winRes = buildMatchupResolutions({
      openBets: [week9Fav],
      currentWeek: 10,
      resultByBetId: new Map([
        ["matchup-2026-9", { myPoints: 121.0, oppPoints: 100.0 }],
      ]),
    });
    const vindication = reconcileExpectation(week9Fav, winRes[0]);
    check(
      "favored win -> vindication (win)",
      vindication.beat?.kind === "vindication" &&
        vindication.beat?.tone === "win",
    );

    // Favored blowout loss (outside the variance margin) -> not variance,
    // and an expected-side loss for a favorite is not a manufactured beat.
    const blowoutRes = buildMatchupResolutions({
      openBets: [week9Fav],
      currentWeek: 10,
      resultByBetId: new Map([
        ["matchup-2026-9", { myPoints: 80.0, oppPoints: 130.0 }],
      ]),
    });
    check(
      "blowout loss is not flagged variance (was the better team on the day)",
      blowoutRes[0]?.variance_flag === false,
    );

    // Honest-first: an underdog who loses a game they were projected to
    // lose gets NO beat. A matchup is not a chosen contrarian position, so
    // it must never produce a critique (that is the always-critique trap).
    const underdogBet = expectationFromMatchup({
      leagueId: "L",
      season: "2026",
      week: 9,
      opponentLabel: "Opp",
      myPpg: 98,
      oppPpg: 121,
    })!;
    const underdogLossRes = buildMatchupResolutions({
      openBets: [underdogBet],
      currentWeek: 10,
      resultByBetId: new Map([
        ["matchup-2026-9", { myPoints: 95.0, oppPoints: 120.0 }],
      ]),
    });
    const underdogLoss = reconcileExpectation(underdogBet, underdogLossRes[0]);
    check(
      "underdog loss -> no beat (a matchup is not a critiqueable choice)",
      underdogLoss.beat === null,
      underdogLoss.record.outcome ?? "",
    );

    // Underdog who wins close -> vindication (the gamble cashed).
    const underdogWinRes = buildMatchupResolutions({
      openBets: [underdogBet],
      currentWeek: 10,
      resultByBetId: new Map([
        ["matchup-2026-9", { myPoints: 118.0, oppPoints: 115.0 }],
      ]),
    });
    const underdogWin = reconcileExpectation(underdogBet, underdogWinRes[0]);
    check(
      "underdog win -> vindication",
      underdogWin.beat?.kind === "vindication",
    );
  }

  console.log(`\n${passed} passed ${"·"} ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
