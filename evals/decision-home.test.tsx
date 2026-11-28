/**
 * /home renders the shared decision items without rewording them: every
 * builder sentence appears verbatim, the focused item is opened, analyst
 * dots never overlap (one per analyst, always three), closed-window
 * leagues get no trade card, and the page carries no em dash, no "push",
 * no "title odds".
 * Run: npm run test:decision-home
 */

import { renderToStaticMarkup } from "react-dom/server";
import type { TeamTile } from "../src/lib/decisions/character";
import { DecisionHome } from "../src/components/home/decision-feed";
import { decisionItemId, type DecisionDigest, type DecisionItem } from "../src/lib/decisions/items";

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

const base = { season: "2026", week: 12, priority: 0, deadline: null, deadline_label: null, delivery: { emailed: true } };
const evansId = decisionItemId("trade", "2026", 12, "eu", "evans");
const henryId = decisionItemId("trade", "2026", 12, "12m", "henry");
const items: DecisionItem[] = [
  {
    ...base, id: evansId, kind: "trade", league_id: "eu", league_name: "Europa", priority: 10, direction: "sell",
    deadline_label: "Closes Thu Nov 26, 7:15 PM CT", kicker: "Worth trying · 1 of 2 · Europa",
    title: "Offer Mike Evans to gridirongoat, who just lost his WR1.", manager: "gridirongoat",
    stats: [{ label: "Playoffs", value: "In the hunt", sub: "70%, range 60 to 80 · 3rd of 12" }, { label: "Win the league", value: "15%", sub: "fair share is 10%" }, { label: "If you sell Evans", value: "−3 pts", sub: "to 12%" }],
    voices: [
      { voice: "strategist", stance: "sell", stance_label: "Sell now", line: "Evans turns 34 in August." },
      { voice: "moneyball", stance: "lean_sell", stance_label: "Lean sell", line: "Keeps about 9 value points." },
      { voice: "gambler", stance: "push", stance_label: "Keep going", line: "15% beats a fair share of 10%." },
    ],
    verdict: "2 of 3 lean sell, if the price is right.", if_it_doesnt_land: "tacoTuesday and dbo are also short a WR.",
    package_note: null, cta_label: "Open the offer to gridirongoat",
  },
  {
    ...base, id: henryId, kind: "trade", league_id: "12m", league_name: "12 Man", priority: 9, direction: "buy",
    deadline_label: "Closes Thu Nov 26, 7:15 PM CT", kicker: "Worth trying · 2 of 2 · 12 Man",
    title: "Ask pmac about Derrick Henry. He just fell to no chance.", manager: "pmac",
    stats: [{ label: "Playoffs", value: "Bubble" }, { label: "With Henry", value: "36%" }, { label: "His value by August", value: "~0" }],
    voices: [
      { voice: "gambler", stance: "push", stance_label: "Buy", line: "Pay a 2nd if you have to." },
      { voice: "moneyball", stance: "lean_push", stance_label: "Lean buy", line: "Good price up to a 3rd." },
      { voice: "strategist", stance: "lean_push", stance_label: "Lean buy", line: "Cap it at a 3rd." },
    ],
    verdict: "All 3 lean buy; they split on price.", if_it_doesnt_land: "If pmac wants more than a 2nd, walk away.",
    package_note: null, cta_label: "Open the offer to pmac",
  },
  { ...base, id: decisionItemId("week_row", "2026", 11, "eu", "row"), kind: "week_row", week: 11, league_id: "eu", league_name: "Europa", title: "Europa", format_record: "Dynasty · 7-4", result: "W 131-118", playoffs: 0.6836, playoffs_change: 8, recs: 1, refused_reason: null },
  { ...base, id: decisionItemId("week_row", "2026", 11, "bb", "row"), kind: "week_row", week: 11, league_id: "bb", league_name: "Smells like jabroni spirit", title: "x", format_record: "Best ball · 4th", result: "3rd in pts", playoffs: null, playoffs_change: null, recs: 0, refused_reason: null },
  { ...base, id: decisionItemId("week_row", "2026", 11, "dd", "row"), kind: "week_row", week: 11, league_id: "dd", league_name: "Dynasty Disasters", title: "x", format_record: "Dynasty · 0-11", result: "L 88-131", playoffs: null, playoffs_change: null, recs: 0, refused_reason: "Not enough scored weeks" },
  { ...base, id: decisionItemId("shift", "2026", 12, "12m", "pmac"), kind: "shift", league_id: "12m", league_name: "12 Man", title: "pmac", manager: "pmac", range_from: "bubble", range_to: "no_chance", cause: "Lost 3 straight; 35% to under 2%", for_you: "seller" },
  { ...base, id: decisionItemId("league_call", "2026", 12, "bb", "call"), kind: "league_call", league_id: "bb", league_name: "Smells like jabroni spirit", delivery: { emailed: false }, priority: 105, title: "Nothing to trade this week.", stance: null, stance_label: "Nothing to trade", context: "Playoffs 15% · Best ball · 5-6", reason: "Best ball league: no trades, waivers or lineup moves, so there is nothing to buy or sell.", voices: [] },
  { ...base, id: decisionItemId("league_call", "2026", 12, "im", "call"), kind: "league_call", league_id: "im", league_name: "Imaginary Football", delivery: { emailed: false }, priority: 209, title: "Keep your roster: no sale beats holding it.", stance: "push", stance_label: "Keep going", context: "Playoffs 90% · Redraft · 7-4", reason: "3 of 3 analysts lean keep; none would sell at today's prices.", voices: [{ voice: "gambler", stance: "push", stance_label: "Keep going", line: "At 7-4 you are a favorite." }] },
  { ...base, id: decisionItemId("trade", "2026", 12, "fc", "idea"), kind: "trade", league_id: "fc", league_name: "The Final Countdown", delivery: { emailed: false }, direction: "buy", kicker: "", title: "dbo is selling after the Josh Allen injury.", manager: "dbo", stats: [], voices: [], verdict: "", if_it_doesnt_land: "", package_note: null, cta_label: "Open" },
];
const digest: DecisionDigest = {
  kicker: "Tue Nov 24 · Week 11 is in · Week 12 ahead",
  headline: "2 trades worth trying before Thursday's deadline.",
  subline: "Your other 6 leagues need nothing from you this week.",
  week_summary: "4-3 last week. Your playoff chances rose in 4 leagues, fell in 2.",
  shifts_summary: "6 teams changed their season. 3 are now sellers.",
};
const hrefs = {
  offer: (i: { league_id: string | null }) => `/leagues/${i.league_id}?tab=trades`,
  coach: (i: { league_id: string | null }) => `/leagues/${i.league_id}?coach=1`,
  sleeper: (i: { league_id: string | null }) => `https://sleeper.com/leagues/${i.league_id}/team`,
  league: (id: string) => `/leagues/${id}`,
  item: (i: { id: string }) => `/home?item=${encodeURIComponent(i.id)}`,
  allLeagues: "/leagues",
};

const html = renderToStaticMarkup(<DecisionHome digest={digest} items={items} focusId={henryId} hrefs={hrefs} />);
const plain = renderToStaticMarkup(<DecisionHome digest={digest} items={items} focusId={null} hrefs={hrefs} />);
const out = process.env.HOME_RENDER_OUT;
if (out) require("node:fs").writeFileSync(out, html);

console.log("\n1. Wording comes from the builder");
for (const s of [digest.headline, digest.subline, digest.week_summary!, digest.shifts_summary!, "Offer Mike Evans to gridirongoat, who just lost his WR1.", "2 of 3 lean sell, if the price is right.", "Lost 3 straight; 35% to under 2%"]) {
  check(`renders verbatim: ${s.slice(0, 40)}`, html.includes(s.replace(/'/g, "&#x27;")));
}

console.log("\n2. Focus and order");
const detailsTags = html.match(/<details[^>]*>/g) ?? [];
check("focused item (from the email link) is opened", detailsTags.some((t) => t.includes(`id="${henryId}"`) && t.includes(" open")));
check("other trade is closed when another is focused", detailsTags.some((t) => t.includes(`id="${evansId}"`) && !t.includes(" open")));
check("with no focus, the first trade is opened", (plain.match(/<details[^>]*>/g) ?? []).some((t) => t.includes(`id="${evansId}"`) && t.includes(" open")));
check("feed is ordered by priority", html.indexOf(evansId) < html.indexOf(henryId));
check("item below the email bar lands in 'Only in the app'", html.includes("Only in the app") && html.includes("dbo is selling"));
check("not-emailed item is not in the Needs you feed", (html.match(/<details[^>]*id="trade:/g) ?? []).length === 2);

console.log("\n2b. Every league says what to do (Isaiah 2026-11-26)");
check("league calls render after the trades, highest priority first", html.indexOf(evansId) < html.indexOf("Keep your roster: no sale beats holding it.") && html.indexOf("Keep your roster: no sale beats holding it.") < html.indexOf("Nothing to trade this week."));
check("a league call carries its reason", html.includes("none would sell at today&#x27;s prices"));
check("a league call links into its league", html.includes('href="/leagues/im"'));
check("week table links to all leagues", html.includes('href="/leagues"') && html.includes("All my leagues"));
check("a week row with no recs shows the call's stance, linked to the call card", html.includes(`href="#${decisionItemId("league_call", "2026", 12, "bb", "call")}"`));

console.log("\n2c. Do-nothing calls fold into one quiet list (Isaiah 2026-11-28)");
const quietStart = html.indexOf("No trade move this week");
check("quiet list exists", quietStart > 0);
check("'Keep your roster' (not actionable) sits in the quiet list, not as a card", quietStart > 0 && html.indexOf("Keep your roster: no sale beats holding it.") > quietStart);
check("quiet rows keep their item id so email links land", html.includes(`<details id="${decisionItemId("league_call", "2026", 12, "im", "call")}"`));
const playId = decisionItemId("league_call", "2026", 12, "rd", "call");
const withPlay: DecisionItem[] = [
  ...items,
  { ...base, id: playId, kind: "league_call", league_id: "rd", league_name: "777.", delivery: { emailed: false }, priority: 298, title: "Play to win this season.", stance: "push", stance_label: "Keep going", context: "Playoffs 98% · Redraft · 6-5", reason: "Redraft rosters reset after the season, so a sale banks nothing.", voices: [], actionable: true },
];
const playHtml = renderToStaticMarkup(<DecisionHome digest={digest} items={withPlay} focusId={null} hrefs={hrefs} />);
const playCard = playHtml.indexOf(`<article id="${playId}"`);
check("an actionable call renders as a full card", playCard > 0);
check("the actionable card comes before the quiet list", playCard > 0 && playCard < playHtml.indexOf("No trade move this week in your other leagues"));

console.log("\n2d. Lineups lead the page when no trade is worth trying");
const desk = {
  week: 12,
  headline: "2 lineup fixes before Sun 12:00 PM. 777. is the game that moves your season.",
  sub: "Your three analysts read all 7 lineups as they stand now. They agree on the holes and split on what matters most.",
  reads: [
    { voice: "strategist" as const, name: "The Strategist", letter: "S", title: "Fill the hole first", lines: ["Parker Washington is Out and still in your 777. lineup."], source: "From Sleeper injury status." },
    { voice: "moneyball" as const, name: "The Moneyballer", letter: "M", title: "1 slot leaves points on the bench", lines: ["In Europa, X sits at 14.0."], source: "Points per game." },
    { voice: "gambler" as const, name: "The Gambler", letter: "G", title: "Play for 777.", lines: ["777. is the game that moves your season."], source: "From 5,000 simulated seasons." },
  ],
  agree: "All 3 agree on benching Parker Washington in 777.",
  actions: [{ leagueId: "rd", leagueName: "777.", verb: "Fix" as const, when: "locks Sun 12:00 PM" }],
  hasFix: true,
  skipped: null,
};
const noTrades = items.filter((i) => i.kind !== "trade");
const lHtml = renderToStaticMarkup(<DecisionHome digest={digest} items={noTrades} focusId={null} hrefs={hrefs} lineups={desk} />);
check("lineup headline becomes the page headline", lHtml.includes(desk.headline));
const escH = digest.headline.replace(/'/g, "&#x27;");
check("trade headline moves into the subline", lHtml.includes(escH));
check("lineup card sits above the league calls", lHtml.indexOf('id="lineups"') > 0 && lHtml.indexOf('id="lineups"') < lHtml.indexOf("No trade move this week"));
check("all three analysts read the lineups", (lHtml.match(/title="(Strategist|Moneyballer|Gambler): /g) ?? []).length >= 3 || ["Strategist", "Moneyballer", "Gambler"].every((n) => lHtml.includes(n)));
check("each action opens the lineup in Sleeper", lHtml.includes('href="https://sleeper.com/leagues/rd/team"') && lHtml.includes("Fix 777. →"));
const tHtml = renderToStaticMarkup(<DecisionHome digest={digest} items={items} focusId={null} hrefs={hrefs} lineups={desk} />);
check("with trade cards, the trade headline still leads", tHtml.includes(`>${escH}<`) && tHtml.indexOf(evansId) < tHtml.indexOf('id="lineups"'));
const teams: TeamTile[] = [
  {
    leagueId: "12m",
    leagueName: "12 Man",
    chip: "Rebuilder",
    note: "Patient build. War year projects 2028.",
    playoff: { pct: 0.7, label: "70%" },
    title: { pct: 0.01, label: "<2%" },
    best: { position: "QB", rank: 5, total: 12 },
    thinnest: { position: "RB", rank: 10, total: 12 },
    rival: { manager: "Willfredson", record: "9-2", myRecord: "7-4", titleLabel: "35%", myTitleLabel: "<2%", titlePct: 0.35, myTitlePct: 0.01, gamesBack: 2, favorite: false },
    order: 0.01,
  },
];
const cHtml = renderToStaticMarkup(<DecisionHome digest={digest} items={noTrades} focusId={null} hrefs={hrefs} lineups={desk} teams={teams} />);
check("your teams render before the lineups and decisions", cHtml.indexOf("Patient build. War year projects 2028.") > 0 && cHtml.indexOf("Patient build") < cHtml.indexOf('id="lineups"'));
check("each team links to its league and shows its rival", cHtml.includes('href="/leagues/12m"') && cHtml.includes("Willfredson") && cHtml.includes("2 GB"));
const many = Array.from({ length: 5 }, (_, i) => ({ ...teams[0], leagueId: `l${i}`, leagueName: `League ${i}` }));
const mHtml = renderToStaticMarkup(<DecisionHome digest={digest} items={noTrades} focusId={null} hrefs={hrefs} lineups={desk} teams={many} />);
check("more than 3 teams: the rest fold under one tap, none dropped", mHtml.includes("Show 2 more teams") && mHtml.includes("League 4") && mHtml.indexOf("League 2") < mHtml.indexOf("Show 2 more teams"));
check("rival bars share the odds meters' 0-100% scale", cHtml.includes("width:35%") && cHtml.includes("width:3%"));
check("favorite label is about title odds, not record", renderToStaticMarkup(<DecisionHome digest={digest} items={noTrades} focusId={null} hrefs={hrefs} lineups={desk} teams={[{ ...teams[0], rival: { ...teams[0].rival!, favorite: true } }]} />).includes("Title favorite · top threat"));
check("tile leads with the odds numbers", cHtml.includes("70%") && cHtml.includes("Playoffs") && cHtml.includes("Win it all"));
check("room meters: one dot per team, rank shown", cHtml.includes("5th/12") && cHtml.includes("10th/12") && (cHtml.match(/rounded-full bg-border-strong/g) ?? []).length >= 22);
check("no em dash with lineups", !lHtml.includes("\u2014"));

console.log("\n3. Analysts");
const dots = (html.match(/title="(Strategist|Moneyballer|Gambler): /g) ?? []).length;
check("every trade shows all three analysts on the scale", dots === 6, String(dots));
check("buy scale reads Pass ... Buy", html.includes(">Pass<") && html.includes(">Buy<"));
check("sell scale reads Sell now ... Keep going", html.includes(">Sell now<") && html.includes(">Keep going<"));

console.log("\n4. Leagues table");
check("week table rounds playoff % with the email's fmtPct (0.6836 -> 70%, never 68%)", html.includes("70%") && !html.includes("68%"));
check("refused sim shows its reason, not a number", html.includes("Not enough scored weeks"));
check("rec chip links to that league's card", html.includes(`href="#${evansId}"`));
const bbRow = html.slice(html.indexOf(`id="${decisionItemId("week_row", "2026", 11, "bb", "row")}"`)).split("</li>")[0];
check("best ball row has no playoff percent", bbRow.includes("jabroni") && !/\d+%/.test(bbRow));

console.log("\n5. Voice");
check("no em dash", !html.includes("—"));
check("no 'push' in copy", !/\bpush\b/i.test(html.replace(/stance[^"]*"/g, "")));
check("no 'title odds'", !/title odds/i.test(html));
check("no exclamation points in copy", !/>[^<]*![^<]*</.test(html));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
