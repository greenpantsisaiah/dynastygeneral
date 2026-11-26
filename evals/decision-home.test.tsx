/**
 * /home renders the shared decision items without rewording them: every
 * builder sentence appears verbatim, the focused item is opened, analyst
 * dots never overlap (one per analyst, always three), closed-window
 * leagues get no trade card, and the page carries no em dash, no "push",
 * no "title odds".
 * Run: npm run test:decision-home
 */

import { renderToStaticMarkup } from "react-dom/server";
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
