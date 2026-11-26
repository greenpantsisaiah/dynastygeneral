/**
 * Sunday Game Day lineup panel (BUILD_SPEC PR 3, first slice): schedule
 * parsing, the Moneyballer's shrinkage threshold, lineup holes, locked
 * games, the never-explain-twice rule, the Gambler's swing game, copy lint,
 * and the trade-desk past-deadline drop.
 * Run: npm run test:game-day
 */

import type { SleeperLeague, SleeperLeagueUser, SleeperMatchup, SleeperPlayer, SleeperRoster } from "../src/lib/sleeper/schemas";
import { parseNflSchedule } from "../src/lib/email/game-day/schedule";
import { buildLeagueLineup, ctWhen, normCdf, shrinkPpg, swapZ, type LeagueLineup } from "../src/lib/email/game-day/lineup";
import { actionVerb, agreeLine, andList, gamblerRead, moneyballRead, panelHeadline, strategistRead } from "../src/lib/email/game-day/panel";
import { composeGameDayEmail } from "../src/lib/email/game-day/email";
import { simulateSeason } from "../src/lib/strategy/verdict/season-sim";
import { buildSimInputFromSleeper } from "../src/lib/strategy/verdict/from-sleeper";

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failed++;
    console.log(`  FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

// ---------- schedule ----------
const CSV = [
  "game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team",
  "2026_12_GB_LA,2026,REG,12,2026-11-25,Wednesday,20:00,GB,13,LA",
  "2026_12_CHI_DET,2026,REG,12,2026-11-26,Thursday,13:00,CHI,,DET",
  "2026_12_BAL_HOU,2026,REG,12,2026-11-29,Sunday,13:00,BAL,,HOU",
  "2026_12_NYJ_MIA,2026,REG,12,2026-11-29,Sunday,13:00,NYJ,,MIA",
  "2026_12_SEA_SF,2026,REG,12,2026-11-29,Sunday,16:25,SEA,,SF",
  "2026_12_CAR_TB,2026,REG,12,2026-11-30,Monday,20:15,CAR,,TB",
  "2026_11_KC_DEN,2026,REG,11,2026-11-22,Sunday,13:00,KC,,DEN",
].join("\n");
const sched = parseNflSchedule(CSV, "2026", 12);
console.log("schedule");
check("LA maps to Sleeper's LAR", sched.byTeam.has("LAR") && !sched.byTeam.has("LA"));
check("1:00 PM ET Sunday is 12:00 PM CT", sched.byTeam.get("BAL")?.label === "12:00 PM");
check("Sunday 1 PM ET is 18:00Z (CST)", sched.byTeam.get("BAL")?.at.toISOString() === "2026-11-29T18:00:00.000Z");
check("4:25 PM ET is 3:25 PM CT", sched.byTeam.get("SEA")?.label === "3:25 PM");
check("other weeks ignored", !sched.byTeam.has("KC"));
const sunday10 = new Date("2026-11-29T16:00:00Z");
check("same-day time prints bare", ctWhen(new Date("2026-11-29T21:25:00Z"), sunday10) === "3:25 PM");
check("another day prints the weekday", ctWhen(new Date("2026-11-29T18:00:00Z"), new Date("2026-11-26T20:00:00Z")) === "Sun 12:00 PM");

// ---------- Moneyballer threshold ----------
console.log("moneyballer threshold");
const s1 = shrinkPpg("WR", 10, 9.3)!;
check("a mean-rate WR shrinks to the mean", Math.abs(s1.shrunk - 9.3) < 1e-9);
const small = shrinkPpg("WR", 2, 20)!;
check("2 games of 20 PPG shrink hard toward 9.3", small.shrunk < 13);
check("under MIN_GAMES is never compared", swapZ(shrinkPpg("WR", 9, 5), shrinkPpg("WR", 2, 30)) === null);
const z = swapZ(shrinkPpg("RB", 9, 6.0), shrinkPpg("RB", 9, 14.0))!;
check("a clear 8-point RB gap over 9 games clears 1 SE", z >= 1, String(z));
check("normCdf(1) is about 0.84", Math.abs(normCdf(1) - 0.8413) < 1e-3);
check("normCdf is symmetric", Math.abs(normCdf(-0.5) + normCdf(0.5) - 1) < 1e-6);

// ---------- a league fixture ----------
const P = (id: string, name: string, position: string, team: string, injury: string | null = null) =>
  [id, { player_id: id, full_name: name, position, team, injury_status: injury } as unknown as SleeperPlayer] as const;
const players = new Map<string, SleeperPlayer>([
  P("q1", "Quinn Arm", "QB", "BAL"),
  P("r1", "Ray Out", "RB", "HOU", "Out"),
  P("r2", "Rex Back", "RB", "MIA"),
  P("w1", "Will Slow", "WR", "SF"),
  P("w2", "Walt Fast", "WR", "NYJ"),
  P("w3", "Wes Locked", "WR", "DET"),
  P("t1", "Ty Q", "TE", "SEA", "Questionable"),
  P("t2", "Tad Hurt", "TE", "BAL", "Questionable"),
  P("k1", "Kip Kick", "K", "TB"),
]);
const SLOTS = ["QB", "RB", "WR", "TE", "FLEX", "K", "BN", "BN", "BN", "BN"];
const starters = ["q1", "r1", "w1", "t1", "w3", "0"];
const rosterPlayers = ["q1", "r1", "w1", "t1", "w3", "r2", "w2", "t2", "k1"];
const pts = (week: number): Record<string, number> => ({
  q1: 20, r1: 12, w1: 5 + (week % 2), t1: 8, w3: 9, r2: 11, w2: 15 + (week % 3), t2: 7, k1: 8,
});
const matchupsByWeek: Record<number, SleeperMatchup[]> = {};
for (let w = 1; w <= 14; w++) {
  const played = w < 12;
  matchupsByWeek[w] = [
    { roster_id: 1, matchup_id: 1, points: played ? 100 + w : 0, starters, players: rosterPlayers, players_points: played ? pts(w) : {} },
    { roster_id: 2, matchup_id: 1, points: played ? 95 : 0, starters: [], players: [] },
    { roster_id: 3, matchup_id: 2, points: played ? 110 - w : 0, starters: [], players: [] },
    { roster_id: 4, matchup_id: 2, points: played ? 90 + (w % 4) * 5 : 0, starters: [], players: [] },
  ] as unknown as SleeperMatchup[];
}
const league = { league_id: "L1", name: "Test League ", roster_positions: SLOTS, settings: { best_ball: 0 } } as unknown as SleeperLeague;
const rosters = [1, 2, 3, 4].map((id) => ({ roster_id: id, owner_id: `u${id}`, players: id === 1 ? rosterPlayers : [], starters: id === 1 ? starters : [] })) as unknown as SleeperRoster[];
const users = [1, 2, 3, 4].map((id) => ({ user_id: `u${id}`, display_name: `mgr${id}` })) as unknown as SleeperLeagueUser[];
const base = { input: { league, rosters, users, matchupsByWeek }, sleeperUserId: "u1", week: 12, schedule: sched, players, playoffWeekStart: 15, playoffTeams: 2, medianGame: false, seed: 7 };

console.log("lineup reads");
const at10 = buildLeagueLineup({ ...base, now: sunday10 }) as LeagueLineup;
check("built (not skipped)", !("skip" in at10));
const kinds = at10.fixes.map((f) => `${f.kind}:${f.starter?.id ?? "empty"}`);
check("Out starter is a hole", kinds.includes("cant_play:r1"), kinds.join(","));
check("empty K slot is a hole", kinds.includes("empty:empty"));
check("Questionable starter is a game-time decision", kinds.includes("game_time:t1"));
check("Thursday starter (locked) is never judged", !kinds.some((k) => k.endsWith("w3")) && !at10.swaps.some((s) => s.starter.id === "w3"));
const out = at10.fixes.find((f) => f.starter?.id === "r1")!;
check("Out RB is replaced by the healthy bench RB", out.replacement?.id === "r2");
check("empty K filled by the bench kicker", at10.fixes.find((f) => f.kind === "empty")?.replacement?.id === "k1");
check("never swaps to a Questionable bench player", !at10.fixes.some((f) => f.replacement?.id === "t2") && !at10.swaps.some((s) => s.bench.id === "t2"));
check("Moneyballer swaps Walt Fast in for Will Slow", at10.swaps.some((s) => s.bench.id === "w2" && s.starter.id === "w1"));
const usedBench = [...at10.fixes.map((f) => f.replacement?.id), ...at10.swaps.map((s) => s.bench.id)].filter(Boolean);
check("each bench player used once", new Set(usedBench).size === usedBench.length);
check("a hole's slot is never also a swap", !at10.swaps.some((s) => s.starter.id === "r1"));
check("league locks at the first fix's kickoff", at10.lock?.toISOString() === "2026-11-29T18:00:00.000Z");
check("Gambler swing game read", !!at10.swing && at10.swing.playoff_if_win >= at10.swing.playoff_if_loss);
check("best ball is skipped", "skip" in buildLeagueLineup({ ...base, now: sunday10, input: { ...base.input, league: { ...league, settings: { best_ball: 1 } } as unknown as SleeperLeague } }));
check("after kickoff nothing in that game is judged", (buildLeagueLineup({ ...base, now: new Date("2026-11-30T05:00:00Z") }) as LeagueLineup).swaps.length === 0);

console.log("simulator week-one split");
const sim = buildSimInputFromSleeper({ rosterIds: [1, 2, 3, 4], matchupsByWeek, firstUnplayedWeek: 12, playoffWeekStart: 15, playoffTeams: 2 });
const plain = simulateSeason(sim, { seed: 11 });
const tracked = simulateSeason(sim, { seed: 11, trackWeekOne: 1 });
check("tracking never changes the odds", plain.ok && tracked.ok && JSON.stringify(plain.odds) === JSON.stringify(tracked.odds));
if (tracked.ok && tracked.week_one) {
  const w = tracked.week_one;
  check("opponent is the week-12 matchup", w.opponent_id === 2);
  const mix = w.win_pct * w.playoff_if_win + (1 - w.win_pct) * w.playoff_if_loss;
  check("split averages back to the playoff chance", Math.abs(mix - tracked.odds[1].playoff_pct) < 0.02, `${mix} vs ${tracked.odds[1].playoff_pct}`);
} else check("week_one present", false);

// ---------- copy ----------
console.log("copy");
const panel = { week: 12, leagues: [at10], skipped: [] };
check("andList", andList(["a", "b", "c"]) === "a, b and c" && andList(["a"]) === "a");
const st = strategistRead(panel.leagues);
check("Strategist names the Out starter once", st.lines.filter((l) => l.includes("Ray Out")).length === 1);
check("Strategist gives the inactives time (90 min before 3:25)", st.lines.some((l) => l.includes("1:55 PM CT")));
const mb = moneyballRead(panel.leagues);
check("Moneyballer cites both raw rates", mb.lines.some((l) => l.includes("Walt Fast") && l.includes("Will Slow") && /in 10/.test(l)));
check("Moneyballer never mentions the hole", !mb.lines.some((l) => l.includes("Ray Out")));
check("Gambler reads a game or says none matters", gamblerRead(panel.leagues).lines.length >= 1);
check("agree box names the hole", agreeLine(panel.leagues).startsWith("All 3 agree on benching Ray Out"));
check("verb is Fix with a hole", actionVerb(at10) === "Fix");
check("verb is Check with only inactives to watch", actionVerb({ ...at10, swaps: [], fixes: at10.fixes.filter((f) => f.kind === "game_time") }) === "Check");
check("headline counts holes and swaps, not game-time calls", panelHeadline(panel).startsWith("3 lineup fixes before 12:00 PM"), panelHeadline(panel));
const em = composeGameDayEmail({ ownerName: "izzy", panel, unsubscribeUrl: "https://x/u", mailingAddress: "1 Main St", sendDate: sunday10, userNames: ["Test League"] });
check("email lint clean", em.lint.length === 0, em.lint.join(" | "));
check("no em dash", !/—/.test(em.html + em.text));
check("Sleeper lineup link", em.html.includes("https://sleeper.com/leagues/L1/team"));
const bad = composeGameDayEmail({ ownerName: "izzy", panel, unsubscribeUrl: "https://x/u", mailingAddress: "", sendDate: sunday10, preview: true });
check("missing address is a lint failure shown on previews", bad.lint.includes("missing mailing address") && bad.html.includes("Preview only"));

if (failed > 0) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall game-day checks passed");
