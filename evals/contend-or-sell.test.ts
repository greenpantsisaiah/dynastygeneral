/**
 * Contend-or-sell verdict engine: the season simulator is deterministic,
 * calibrated on toy leagues where the answer is known, respects the
 * bracket, and conserves probability; the sell delta is negative when a
 * starter leaves; decay reads the canonical age curve; buyers rank
 * contenders with holes first; the voices can disagree.
 * Run: npm run test:contend-or-sell
 */

import {
  bracketOrder,
  simulateSeason,
  type SimInput,
} from "../src/lib/strategy/verdict/season-sim";
import {
  buildSimInputFromSleeper,
  replacementPpg,
  startedPoints,
} from "../src/lib/strategy/verdict/from-sleeper";
import { offseasonValueDecay } from "../src/lib/strategy/verdict/decay";
import { rankBuyers } from "../src/lib/strategy/verdict/buyers";
import { convene, gambler, moneyball, strategist } from "../src/lib/strategy/verdict/voices";
import { buildContendOrSellVerdict } from "../src/lib/strategy/verdict/compose";
import { tradeWindow } from "../src/lib/strategy/verdict/trade-window";
import { ageRetention } from "../src/lib/players/age-curve";
import { predictionType } from "../src/lib/predictions/registry";
import type { SleeperMatchup } from "../src/lib/sleeper/schemas";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`);
  }
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

// A 12-team league, 10 weeks scored, 4 left, 6 playoff teams. Team strength
// rises with roster id; weekly noise is deterministic per (team, week).
function league(opts: { equal?: boolean } = {}): SimInput {
  const ids = Array.from({ length: 12 }, (_, i) => i + 1);
  const scored: Record<number, number[]> = {};
  for (const id of ids) {
    const mu = opts.equal ? 110 : 90 + id * 4;
    const seedId = opts.equal ? 1 : id;
    scored[id] = Array.from({ length: 10 }, (_, w) => mu + (((seedId * 7 + w * 13) % 21) - 10) * 2);
  }
  const teams = ids.map((id) => ({
    roster_id: id,
    wins: opts.equal ? 5 : Math.round((id - 1) * (10 / 11)),
    losses: 0,
    ties: 0,
    points_for: scored[id].reduce((s, x) => s + x, 0),
  }));
  for (const t of teams) t.losses = 10 - t.wins;
  const remaining: SimInput["remaining"] = [];
  for (let w = 0; w < 4; w++) {
    const wk: Array<[number, number]> = [];
    for (let k = 0; k < 6; k++) wk.push([ids[(k + w) % 12], ids[(11 - k + w) % 12]]);
    remaining.push(wk);
  }
  return { teams, scored, remaining, playoffTeams: 6 };
}

console.log("\n── bracket ──");
check("8-team bracket order is 1,8,4,5,2,7,3,6", bracketOrder(8).join(",") === "1,8,4,5,2,7,3,6");

console.log("\n── simulator invariants ──");
const L = league();
const a = simulateSeason(L, { sims: 4000, seed: 7 });
const b = simulateSeason(L, { sims: 4000, seed: 7 });
check("simulator ran", a.ok, a.ok ? "" : a.reason);
if (a.ok && b.ok) {
  check("same seed, same odds", JSON.stringify(a.odds) === JSON.stringify(b.odds));
  const odds = Object.values(a.odds);
  const titles = odds.reduce((s, o) => s + o.title_pct, 0);
  const seats = odds.reduce((s, o) => s + o.playoff_pct, 0);
  check("title odds sum to 1", near(titles, 1, 1e-9), String(titles));
  check("playoff odds sum to playoff_teams", near(seats, 6, 1e-9), String(seats));
  check("title odds never exceed playoff odds", odds.every((o) => o.title_pct <= o.playoff_pct + 1e-12));
  check("strongest team is the favorite", a.odds[12].title_pct === Math.max(...odds.map((o) => o.title_pct)));
  check("weakest team (0-10, 4 left) misses", a.odds[1].playoff_pct < 0.02, String(a.odds[1].playoff_pct));
}

const E = simulateSeason(league({ equal: true }), { sims: 6000, seed: 11 });
if (E.ok) {
  const t = Object.values(E.odds).map((o) => o.title_pct);
  check("identical teams: every title share near 1/12", t.every((x) => near(x, 1 / 12, 0.03)), t.map((x) => x.toFixed(3)).join(" "));
}

const thin = simulateSeason({ ...L, scored: { 1: [100], 2: [90] } });
check("declines without enough scored weeks", !thin.ok);

console.log("\n── a weaker roster has lower odds (common random numbers) ──");
const shifted = simulateSeason(L, { sims: 4000, seed: 7, meanShift: { 9: -15 } });
if (a.ok && shifted.ok) {
  check("selling 15 pts/week lowers title odds", shifted.odds[9].title_pct < a.odds[9].title_pct);
  check("and lowers playoff odds", shifted.odds[9].playoff_pct < a.odds[9].playoff_pct);
}

console.log("\n── Sleeper adapter ──");
const mk = (week: number, rows: Array<[number, number, number | null, string[], Record<string, number>]>): SleeperMatchup[] =>
  rows.map(([roster_id, matchup_id, points, starters, pp]) => ({
    roster_id,
    matchup_id,
    points,
    starters,
    players: [...starters, "bench1"],
    players_points: { ...pp, bench1: 6 + week },
  })) as SleeperMatchup[];
const byWeek: Record<number, SleeperMatchup[]> = {
  1: mk(1, [[1, 1, 120, ["p1"], { p1: 20 }], [2, 1, 100, ["p2"], {}]]),
  2: mk(2, [[1, 1, 90, ["p1"], { p1: 10 }], [2, 1, 95, ["p2"], {}]]),
  3: mk(3, [[1, 1, 0, ["p1"], { p1: 0 }], [2, 1, 0, ["p2"], {}]]),
};
const sin = buildSimInputFromSleeper({ rosterIds: [1, 2], matchupsByWeek: byWeek, firstUnplayedWeek: 3, playoffWeekStart: 4, playoffTeams: 1 });
const t1 = sin.teams.find((t) => t.roster_id === 1)!;
check("standings from scored weeks", t1.wins === 1 && t1.losses === 1, JSON.stringify(t1));
check("points for summed", t1.points_for === 210);
check("unplayed week becomes remaining schedule", sin.remaining.length === 1 && sin.remaining[0].length === 1);
const sp = startedPoints(byWeek, 1, "p1", 3);
check("started ppg averages started weeks only", sp.weeks_started === 2 && sp.ppg_started === 15, JSON.stringify(sp));
const rp = replacementPpg(byWeek, 1, ["bench1"], 3);
check("replacement ppg reads bench points", rp.ppg === 7.5, JSON.stringify(rp));

console.log("\n── decay reads the canonical age curve ──");
const old = offseasonValueDecay({ value: 40, position: "WR", age: 33 });
const expect = 40 * (1 - ageRetention("WR", 33.75) / ageRetention("WR", 33));
check("33yo WR loses value by August", old.value_lost > 0 && near(old.value_lost, expect, 1e-9));
const kid = offseasonValueDecay({ value: 60, position: "WR", age: 23 });
check("23yo WR does not decay", kid.value_lost <= 0);
check("unknown age is no change", offseasonValueDecay({ value: 30, position: "RB", age: null }).value_lost === 0);

console.log("\n── buyers ──");
const buyers = rankBuyers({
  position: "WR",
  sellerRosterId: 1,
  rosters: [
    { roster_id: 1, label: "me", title_pct: 0.5, playoff_pct: 1, startable_at_pos: 0, starters_at_pos: 3 },
    { roster_id: 2, label: "deep contender", title_pct: 0.3, playoff_pct: 0.9, startable_at_pos: 6, starters_at_pos: 3 },
    { roster_id: 3, label: "thin contender", title_pct: 0.25, playoff_pct: 0.85, startable_at_pos: 2, starters_at_pos: 3 },
    { roster_id: 4, label: "thin rebuilder", title_pct: 0.01, playoff_pct: 0.05, startable_at_pos: 1, starters_at_pos: 3 },
  ],
});
check("seller excluded", buyers.every((x) => x.roster_id !== 1));
check("thin contender ranks first", buyers[0].roster_id === 3, buyers.map((x) => x.label).join(", "));
check("rebuilder ranks last", buyers[buyers.length - 1].roster_id === 4);

console.log("\n── voices can disagree ──");
const longshotOld = { teams: 12, title_pct: 0.02, playoff_pct: 0.2, title_delta: -0.005, value_kept_by_selling: 18, roster_retained_share: 0.85 };
check("everyone sells a long shot with an old core", convene(longshotOld).consensus && convene(longshotOld).headline === "sell");
const liveYoung = { teams: 12, title_pct: 0.14, playoff_pct: 0.8, title_delta: -0.04, value_kept_by_selling: 12, roster_retained_share: 0.99 };
check("gambler pushes a live ticket", gambler(liveYoung).stance === "push");
check("strategist pushes a young contender", strategist(liveYoung).stance === "push");
const coinflip = { teams: 12, title_pct: 0.06, playoff_pct: 0.55, title_delta: -0.03, value_kept_by_selling: 20, roster_retained_share: 0.88 };
const p = convene(coinflip);
check("bubble team with an aging core splits the panel", !p.consensus, p.voices.map((v) => `${v.voice}:${v.stance}`).join(" "));
check("moneyball sells when kept value beats priced odds", moneyball(coinflip, 100).stance === "sell" || moneyball(coinflip, 100).stance === "lean_sell");
check("moneyball pushes when a title is worth more", ["push", "lean_push"].includes(moneyball(coinflip, 2000).stance));

console.log("\n── composed verdict ──");
const vArgs: Parameters<typeof buildContendOrSellVerdict>[0] = {
  sim: L,
  rosterId: 8,
  sims: 3000,
  seed: 3,
  players: [
    { player_id: "old", name: "Old WR", position: "WR", age: 33, value: 35, ppg_started: 16, weeks_started: 9, replacement_ppg: 8 },
    { player_id: "young", name: "Young WR", position: "WR", age: 23, value: 80, ppg_started: 18, weeks_started: 10, replacement_ppg: 8 },
    { player_id: "rb", name: "Aging RB", position: "RB", age: 30, value: 14, ppg_started: 9, weeks_started: 6, replacement_ppg: 7 },
  ],
  buyers: (pos) =>
    L.teams.map((t) => ({ roster_id: t.roster_id, label: `T${t.roster_id}`, title_pct: 0, playoff_pct: 0, startable_at_pos: t.roster_id % 4, starters_at_pos: pos === "WR" ? 3 : 2 })),
};
const v = buildContendOrSellVerdict(vArgs);
check("verdict built", v.ok, v.ok ? "" : v.reason);
if (v.ok) {
  const V = v.verdict;
  check("young player is never in the sell package", !V.package.player_ids.includes("young"));
  check("old WR is in the sell package", V.package.player_ids.includes("old"));
  check("selling starters lowers title odds", V.package.title_delta < 0);
  check("buyers carry simulated title odds", V.candidates[0].buyers.every((b) => b.title_pct > 0 || b.roster_id <= 3));
  check("contender premium is labelled unknown", V.contender_premium.value === 0 && V.contender_premium.status === "unknown");
  check("three voices on the panel", V.panel.voices.length === 3);
  check("every cited prediction type is registered", V.provenance.prediction_types.every((id) => predictionType(id) !== undefined), V.provenance.prediction_types.filter((id) => !predictionType(id)).join(","));
}

console.log("\n── trade window (no sell advice where you cannot trade) ──");
check("best ball closes the window", !tradeWindow({ best_ball: true, trade_deadline_week: 99 }, 12).open);
check("deadline week itself is still open", tradeWindow({ best_ball: false, trade_deadline_week: 12 }, 12).open);
check("past the deadline is closed", (() => { const w = tradeWindow({ best_ball: false, trade_deadline_week: 11 }, 12); return !w.open && w.reason === "deadline_passed"; })());
check("99 means no deadline", tradeWindow({ best_ball: false, trade_deadline_week: 99 }, 17).open);
check("null deadline is open", tradeWindow({ best_ball: false, trade_deadline_week: null }, 17).open);
{
  const closed = buildContendOrSellVerdict({ ...vArgs, tradeWindow: tradeWindow({ best_ball: true, trade_deadline_week: null }, 12) });
  check("closed window: no sell candidates", closed.ok && closed.verdict.candidates.length === 0 && closed.verdict.package.player_ids.length === 0);
  check("closed window still reports odds", closed.ok && closed.verdict.odds.title_pct >= 0 && !closed.verdict.trade_window.open);
}

console.log("\n── voice copy never contradicts or prints zeros ──");
const zeroFacts = { teams: 12, title_pct: 0.02, playoff_pct: 0.1, title_delta: -0.001, value_kept_by_selling: 0.2, roster_retained_share: 0.99 };
const mb = moneyball(zeroFacts);
check("moneyball never prints 'worth 0' or '0%'", !/worth 0\b|costs 0%|about 0 value/.test(mb.line), mb.line);
const st = strategist(zeroFacts);
check("young non-contender strategist says keep, not 'not the window' alone", st.stance === "lean_push" && /keep it/.test(st.line), st.line);
for (const share of [0.85, 0.95, 0.99]) for (const tp of [0.01, 0.3]) {
  const r2 = strategist({ ...zeroFacts, roster_retained_share: share, title_pct: tp });
  const says = /Sell|selling/.test(r2.line) && !/rather than selling/.test(r2.line);
  check(`strategist line matches stance (${share}, ${tp})`, !(says && (r2.stance === "push" || r2.stance === "lean_push")), `${r2.stance}: ${r2.line}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
