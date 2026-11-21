/**
 * Unit checks for the Coach quality eval harness (evals/coach-quality/).
 * Pure functions only: no network, no model calls.
 */

import {
  baselinePaste,
  fillQuestion,
  placeholdersFor,
  type LeagueUnderTest,
} from "./coach-quality/fill";
import {
  coachIsA,
  parseVerdict,
  summarize,
  unblind,
  type JudgeVerdict,
} from "./coach-quality/judge";
import { QUESTION_BANK } from "./coach-quality/questions";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`);
  }
}

const league: LeagueUnderTest = {
  leagueId: "L1",
  name: "Finders Keepers",
  state: {
    league: { name: "Finders Keepers", total_teams: 12, format: "dynasty", scoring: ["ppr"], format_rules: { is_superflex: true } },
    me: {
      owner: "me",
      record: "7-4",
      players: [
        { name: "Old Back", pos: "RB", age: 29, value: 40 },
        { name: "Star Wideout", pos: "WR", age: 25, value: 90 },
        { name: "Young Receiver", pos: "WR", age: 22, value: 55 },
        { name: "Starting QB", pos: "QB", age: 27, value: 70 },
        { name: "Tight End", pos: "TE", age: 31, value: 20 },
      ],
    },
    opponents: [
      { owner: "weakteam", roster: [{ name: "Bench Guy", pos: "WR", age: 30, value: 5 }] },
      { owner: "powerhouse", roster: [{ name: "Elite QB", pos: "QB", age: 26, value: 95 }, { name: "Good RB", pos: "RB", age: 24, value: 60 }] },
    ],
  },
};
const other: LeagueUnderTest = { ...league, leagueId: "L2", name: "Second League" };

console.log("\n── coach-quality: question bank ──");
check("bank has ~50 questions", QUESTION_BANK.length >= 45 && QUESTION_BANK.length <= 60, String(QUESTION_BANK.length));
check("bank ids unique", new Set(QUESTION_BANK.map((q) => q.id)).size === QUESTION_BANK.length);
check("bank includes cross-league questions", QUESTION_BANK.filter((q) => q.scope === "cross_league").length >= 5);
check(
  "every bank question has no em dash",
  QUESTION_BANK.every((q) => !q.text.includes("—")),
);

console.log("\n── coach-quality: placeholder filling ──");
const ph = placeholdersFor(league, [league, other]);
check("my_top is highest-value skill player", ph.my_top === "Star Wideout", ph.my_top);
check("my_old is an RB/WR aged 27+", ph.my_old === "Old Back", ph.my_old);
check("my_young is aged 24 or younger", ph.my_young === "Young Receiver", ph.my_young);
check("opp_a is the strongest opponent roster", ph.opp_a === "powerhouse", ph.opp_a);
check("opp_a_top is that roster's top player", ph.opp_a_top === "Elite QB", ph.opp_a_top);
check("league_count counts every league", ph.league_count === "2");
const allFilled = QUESTION_BANK.every((q) => !/\{[a-z_]+\}/.test(fillQuestion(q.text, ph)));
check("every bank placeholder resolves", allFilled);

console.log("\n── coach-quality: baseline paste ──");
const paste = baselinePaste({ leagues: [league], opponentsMentioned: ["powerhouse"] });
check("paste names the format", paste.includes("12-team") && paste.includes("Superflex"));
check("paste lists my roster with ages", paste.includes("Star Wideout (25)"));
check("paste includes a mentioned opponent's roster", paste.includes("powerhouse's roster") && paste.includes("Elite QB"));
check("paste omits engine values", !paste.includes("value"));

console.log("\n── coach-quality: blind judge ──");
const v: JudgeVerdict = {
  scores_a: { accuracy: 2, league_data_use: 4, advisor_quality: 3 },
  scores_b: { accuracy: 5, league_data_use: 3, advisor_quality: 4 },
  winner: "B",
  loser_reasons: ["hallucinated_fact", "hedging_or_vague"],
  rationale: "B is correct.",
};
check("parseVerdict accepts a valid verdict", parseVerdict(JSON.stringify(v)) !== null);
check("parseVerdict rejects out-of-range scores", parseVerdict(JSON.stringify({ ...v, scores_a: { ...v.scores_a, accuracy: 9 } })) === null);
check("parseVerdict drops unknown reasons", parseVerdict(JSON.stringify({ ...v, loser_reasons: ["made_up", "other"] }))?.loser_reasons.join() === "other");
const coachA = unblind({ id: "q", slice: "bank_league", category: "direction", verdict: v, coachWasA: true });
check("unblind: Coach as A, B wins -> baseline wins", coachA.outcome === "baseline" && coachA.coach.accuracy === 2);
check("unblind: reasons attach to Coach when Coach loses", coachA.coach_loss_reasons.length === 2 && coachA.baseline_loss_reasons.length === 0);
const coachB = unblind({ id: "q", slice: "bank_league", category: "direction", verdict: v, coachWasA: false });
check("unblind: Coach as B, B wins -> coach wins", coachB.outcome === "coach" && coachB.coach.accuracy === 5);
const flips = Array.from({ length: 200 }, (_, i) => coachIsA(`run:${i}`)).filter(Boolean).length;
check("A/B assignment is roughly balanced", flips > 70 && flips < 130, String(flips));
check("A/B assignment is deterministic", coachIsA("x:1") === coachIsA("x:1"));

const s = summarize([coachA, coachB, { ...coachB, outcome: "tie", coach_loss_reasons: [], baseline_loss_reasons: [] }]);
check("summary counts W-L-T", s.coach_wins === 1 && s.baseline_wins === 1 && s.ties === 1);
check("summary win rate counts ties as half", s.coach_win_rate === 0.5);
check("summary CI brackets the rate", s.coach_win_rate_ci[0] < 0.5 && s.coach_win_rate_ci[1] > 0.5);
check("summary tallies Coach loss reasons", s.coach_loss_reasons[0]?.[1] === 1);

console.log(`\n${passed} passed · ${failed} failed`);
if (failed > 0) process.exit(1);
