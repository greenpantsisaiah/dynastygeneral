/**
 * Lineup out-alerts: the detector finds only starters who will score zero
 * (ruled out, on bye, empty slot) in a game that has not started and locks
 * inside the window; bench options respect slot eligibility and skip taxi,
 * IR, ruled-out and already-started players; the ESPN parse maps team
 * codes to Sleeper's; the email carries the unsubscribe link, the postal
 * address, escaping, and no em dashes; lineup-alert unsubscribe tokens do
 * not verify for the weekly brief list.
 * Run: npm run test:lineup-alerts
 */

import {
  detectLineupProblems,
  ppgFor,
  problemKey,
  type PlayerMeta,
  type TeamGame,
} from "../src/lib/lineup/out-starters";
import { parseScoreboard } from "../src/lib/nfl/schedule";
import {
  lineupAlertSubject,
  renderLineupAlertHtml,
  renderLineupAlertText,
} from "../src/lib/email/lineup-alert";
import {
  LINEUP_ALERTS_LIST,
  WEEKLY_BRIEF_LIST,
  unsubscribeToken,
  verifyUnsubscribeToken,
} from "../src/lib/email/unsubscribe";

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

const now = new Date("2026-11-29T16:00:00.000Z"); // Sun 11:00 AM ET
const in2h = "2026-11-29T18:00:00.000Z"; // 1:00 PM ET
const in5h = "2026-11-29T21:25:00.000Z"; // 4:25 PM ET
const started = "2026-11-29T14:30:00.000Z";

const games = new Map<string, TeamGame>([
  ["KC", { kickoff: in2h, state: "pre" }],
  ["BUF", { kickoff: in2h, state: "pre" }],
  ["MIA", { kickoff: in2h, state: "pre" }],
  ["SF", { kickoff: in5h, state: "pre" }],
  ["NYJ", { kickoff: started, state: "in" }],
  // DAL absent: on bye
]);

function pm(id: string, position: string, team: string | null, injury: string | null = null, fp?: string[]): PlayerMeta {
  return { player_id: id, name: `Player ${id}`, position, fantasy_positions: fp ?? [position], team, injury_status: injury };
}

const meta = new Map<string, PlayerMeta>([
  ["qb1", pm("qb1", "QB", "KC")],
  ["rb1", pm("rb1", "RB", "BUF", "Out")],
  ["rb2", pm("rb2", "RB", "DAL")],
  ["wr1", pm("wr1", "WR", "SF", "Out")],
  ["wr2", pm("wr2", "WR", "NYJ", "Out")],
  ["te1", pm("te1", "TE", "MIA")],
  ["b_rb", pm("b_rb", "RB", "MIA")],
  ["b_rb_low", pm("b_rb_low", "RB", "KC")],
  ["b_wr", pm("b_wr", "WR", "KC")],
  ["b_wr_out", pm("b_wr_out", "WR", "BUF", "IR")],
  ["b_wr_started", pm("b_wr_started", "WR", "NYJ")],
  ["b_qb", pm("b_qb", "QB", "BUF")],
  ["taxi_rb", pm("taxi_rb", "RB", "KC")],
]);
const ppgById = new Map<string, number | null>([
  ["b_rb", 11.2],
  ["b_rb_low", 4.1],
  ["b_wr", 9.5],
  ["taxi_rb", 30],
  ["b_wr_started", 25],
  ["b_qb", 18],
]);

const rosterPositions = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN", "BN", "BN", "BN", "BN", "BN", "TAXI"];
const starters = ["qb1", "rb1", "rb2", "wr1", "wr2", "te1", "0"];
const rosterPlayers = [...starters.filter((s) => s !== "0"), "b_rb", "b_rb_low", "b_wr", "b_wr_out", "b_wr_started", "b_qb", "taxi_rb"];

const problems = detectLineupProblems({
  rosterPositions,
  starters,
  rosterPlayers,
  unavailable: ["taxi_rb"],
  meta,
  games,
  ppgById,
  now,
  windowHours: 3,
});

console.log("\n1. Detector");
const byKind = (k: string) => problems.filter((p) => p.kind === k);
check("ruled-out starter in a game locking inside the window is flagged", byKind("out").some((p) => p.player?.player_id === "rb1"));
check("ruled-out starter whose game locks after the window is not flagged yet", !problems.some((p) => p.player?.player_id === "wr1"));
check("ruled-out starter whose game already started is ignored", !problems.some((p) => p.player?.player_id === "wr2"));
check("starter on bye is flagged", byKind("bye").some((p) => p.player?.player_id === "rb2"));
check("empty FLEX slot is flagged", byKind("empty").length === 1 && byKind("empty")[0].slot === "FLEX");
check("healthy starters are not flagged", !problems.some((p) => p.player?.player_id === "qb1" || p.player?.player_id === "te1"));
check("exactly three problems", problems.length === 3, String(problems.length));

const rbOut = problems.find((p) => p.player?.player_id === "rb1")!;
check("RB slot options are RBs only, ranked by season average", rbOut.options.map((o) => o.player_id).join(",") === "b_rb,b_rb_low", rbOut.options.map((o) => o.player_id).join(","));
check("taxi player is never offered", !problems.some((p) => p.options.some((o) => o.player_id === "taxi_rb")));
check("ruled-out bench player is never offered", !problems.some((p) => p.options.some((o) => o.player_id === "b_wr_out")));
check("bench player whose game started is never offered", !problems.some((p) => p.options.some((o) => o.player_id === "b_wr_started")));
const flex = byKind("empty")[0];
check("FLEX options exclude QBs", !flex.options.some((o) => o.position === "QB"));
check("FLEX options include RB and WR by season average", flex.options[0]?.player_id === "b_rb" && flex.options[1]?.player_id === "b_wr");
check("out lock is the starter's kickoff", rbOut.lock === in2h);
check("empty slot lock is the earliest eligible bench kickoff", flex.lock === in2h);

const none = detectLineupProblems({ rosterPositions: ["QB"], starters: ["qb1"], rosterPlayers: ["qb1"], meta, games, ppgById, now, windowHours: 3 });
check("clean lineup yields no problems", none.length === 0);

const sf = detectLineupProblems({
  rosterPositions: ["QB", "SUPER_FLEX"],
  starters: ["qb1", "0"],
  rosterPlayers: ["qb1", "b_qb", "b_wr"],
  meta,
  games,
  ppgById,
  now,
  windowHours: 3,
});
check("SUPER_FLEX options can include a QB", sf[0]?.options[0]?.player_id === "b_qb");

console.log("\n2. Keys and scoring");
const k1 = problemKey("2026", 13, "L1", flex);
const flex2 = { ...flex, slot_index: 7 };
check("two empty slots get distinct keys", k1 !== problemKey("2026", 13, "L1", flex2));
check("key carries the week prefix the cron filters on", k1.startsWith("lineup_alert_2026_w13_"));
const stats = { pts_ppr: 120, pts_half_ppr: 100, pts_std: 80, games_played: 10 };
check("PPR league reads PPR points", ppgFor(stats, 1) === 12);
check("half-PPR league reads half points", ppgFor(stats, 0.5) === 10);
check("standard league reads standard points", ppgFor(stats, 0) === 8);
check("no games played is null, not zero", ppgFor({ ...stats, games_played: 0 }, 1) === null);

console.log("\n3. ESPN schedule parse");
const parsed = parseScoreboard({
  events: [
    { date: in2h, status: { type: { state: "pre" } }, competitions: [{ date: in2h, competitors: [{ team: { abbreviation: "WSH" } }, { team: { abbreviation: "dal" } }] }] },
    { date: "not a date", status: { type: { state: "pre" } }, competitions: [{ competitors: [{ team: { abbreviation: "KC" } }] }] },
    { date: in2h, status: { type: { state: "weird" } }, competitions: [{ competitors: [{ team: { abbreviation: "BUF" } }] }] },
    null,
  ],
});
check("WSH maps to Sleeper's WAS", parsed.has("WAS") && !parsed.has("WSH"));
check("abbreviations are upper-cased", parsed.has("DAL"));
check("bad date entry is skipped", !parsed.has("KC"));
check("unknown state entry is skipped", !parsed.has("BUF"));
check("garbage payload returns an empty map", parseScoreboard({ nope: true }).size === 0 && parseScoreboard(null).size === 0);

console.log("\n4. Email");
const args = {
  leagues: [{ leagueId: "123", leagueName: "TEP <Bros> & Co", problems }],
  unsubscribeUrl: "https://dynastygeneral.app/api/email/unsubscribe?u=x&l=lineup_alerts&t=y",
  mailingAddress: "123 Main St, Chicago IL",
};
const html = renderLineupAlertHtml(args);
const text = renderLineupAlertText(args);
const subject = lineupAlertSubject(args);
const all = html + text + subject;
check("no em dashes anywhere", !all.includes("—"));
check("no exclamation points in copy", !(text + subject).includes("!"));
check("HTML escapes the league name", html.includes("TEP &lt;Bros&gt; &amp; Co") && !html.includes("<Bros>"));
check("HTML carries the unsubscribe link", html.includes("api/email/unsubscribe"));
check("text carries the unsubscribe link", text.includes(args.unsubscribeUrl));
check("both carry the postal address", html.includes("123 Main St") && text.includes("123 Main St"));
check("says bench options are season average, not a projection", text.includes("season average, not a weekly projection"));
check("links to the league in Sleeper", text.includes("https://sleeper.com/leagues/123/team"));
check("multi-problem subject counts starters", subject === "3 starters will score zero in TEP <Bros> & Co", subject);
check("lock time renders in ET", text.includes("Sun 1:00 PM ET"), text);
check("ruled-out line names the status", text.includes("is listed Out"));
const single = lineupAlertSubject({ ...args, leagues: [{ ...args.leagues[0], problems: [rbOut] }] });
check("single-problem subject names the player", single.includes("Player rb1") && single.includes("won't play"), single);

console.log("\n5. Unsubscribe tokens");
const key = "test-secret";
const t = unsubscribeToken("u1", LINEUP_ALERTS_LIST, key)!;
check("lineup token verifies for lineup alerts", verifyUnsubscribeToken("u1", t, LINEUP_ALERTS_LIST, key));
check("lineup token does not verify for the weekly brief", !verifyUnsubscribeToken("u1", t, WEEKLY_BRIEF_LIST, key));
check("lineup token does not verify for another user", !verifyUnsubscribeToken("u2", t, LINEUP_ALERTS_LIST, key));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
