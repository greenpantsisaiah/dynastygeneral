/**
 * Weekly brief email (Tuesday Trade Desk, BUILD_SPEC PR 1): one fixture per
 * edge state the spec names (trades, 0 trades, best ball only, past
 * deadline only, no leagues, 8+ leagues, sim refused), each rendered and
 * run through the content lint; free vs Pro; escaping; compliance; send
 * guard; unsubscribe tokens.
 * Run: npm run test:weekly-brief
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SleeperMatchup } from "../src/lib/sleeper/schemas";
import { buildContendOrSellVerdict, type ContendOrSellVerdict } from "../src/lib/strategy/verdict/compose";
import { buildSimInputFromSleeper } from "../src/lib/strategy/verdict/from-sleeper";
import { DEFAULT_SIMS } from "../src/lib/strategy/verdict/season-sim";
import { lastCompletedWeek } from "../src/lib/strategy/verdict/weeks";
import { buildLeagueWeek, fmtPct, playoffRange, shiftAction } from "../src/lib/email/trade-desk/league-week";
import { buildAskLadder } from "../src/lib/strategy/verdict/ask";
import { leagueHref } from "../src/lib/email/trade-desk/render";
import { tradeBy } from "../src/lib/email/trade-desk/deadline";
import { resolveMailingAddress } from "../src/lib/email/mailing-address";
import { lintDecisionItems, BANNED_SUBJECT_LEAD } from "../src/lib/email/trade-desk/lint";
import { briefFrom } from "../src/lib/email/sender";
import { strategist } from "../src/lib/strategy/verdict/voices";
import type { DeskLeague } from "../src/lib/email/trade-desk/model";
import { briefRenderTier, composeWeeklyBrief, WEEKLY_BRIEF_TEMPLATE_VERSION } from "../src/lib/email/weekly-brief";
import { FLAGS } from "../src/lib/flags/registry";
import { unsubscribeToken, verifyUnsubscribeToken } from "../src/lib/email/unsubscribe";
import { briefSendKind, honorForce, resolveSendMode } from "../src/lib/email/send-guard";

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

// ---------- fixture league: 12 teams, weeks 1-11 scored, 12-14 left ----------
const ids = Array.from({ length: 12 }, (_, i) => i + 1);
const RESULTS_WEEK = 11;
function season(): Record<number, SleeperMatchup[]> {
  const out: Record<number, SleeperMatchup[]> = {};
  for (let w = 1; w <= 14; w++) {
    const rows: SleeperMatchup[] = [];
    for (let k = 0; k < 6; k++) {
      const a = ids[(k + w) % 12];
      const b = ids[(11 - k + w) % 12];
      for (const id of [a, b]) {
        const pts = w <= RESULTS_WEEK ? 90 + id * 4 + (((id * 7 + w * 13) % 21) - 10) * 2 : 0;
        rows.push({ roster_id: id, matchup_id: k + 1, points: pts, starters: [`p${id}`] } as SleeperMatchup);
      }
    }
    out[w] = rows;
  }
  return out;
}
const matchups = season();
const ME = 3; // a weak team, so the analysts lean sell
const sim = buildSimInputFromSleeper({ rosterIds: ids, matchupsByWeek: matchups, firstUnplayedWeek: RESULTS_WEEK + 1, playoffWeekStart: 15, playoffTeams: 6 });
function verdict(window: ContendOrSellVerdict["trade_window"] = { open: true, deadline_week: 12 }, tag = ""): ContendOrSellVerdict {
  const r = buildContendOrSellVerdict({
    sim,
    rosterId: ME,
    sims: 2000,
    tradeWindow: window,
    players: [
      { player_id: "old", name: `Old Receiver${tag}`, position: "WR", age: 33, value: 35, ppg_started: 16, weeks_started: 9, replacement_ppg: 8 },
      { player_id: "vet", name: `Vet Back${tag}`, position: "RB", age: 29, value: 28, ppg_started: 12, weeks_started: 9, replacement_ppg: 9 },
    ],
    buyers: () => ids.map((id) => ({ roster_id: id, label: id === 11 ? `<script>Evil</script>${tag}` : `Team ${id}${tag}`, title_pct: 0, playoff_pct: 0, startable_at_pos: id % 4, starters_at_pos: 3 })),
  });
  if (!r.ok) throw new Error(r.reason);
  return r.verdict;
}
const week = (bestBall = false) =>
  buildLeagueWeek({
    rosters: ids.map((id) => ({ roster_id: id, manager: `Team ${id}`, is_me: id === ME, player_ids: [`p${id}`], starters: [`p${id}`] })),
    matchupsByWeek: matchups,
    resultsWeek: RESULTS_WEEK,
    playoffWeekStart: 15,
    playoffTeams: 6,
    bestBall,
  });
const BEST_BALL = { open: false as const, reason: "best_ball" as const, deadline_week: null, label: "Best ball league: no trades, waivers or lineup moves, so there is nothing to buy or sell." };
const PAST = { open: false as const, reason: "deadline_passed" as const, deadline_week: 11, label: "Trade deadline passed after week 11, so there is nothing to buy or sell until the offseason." };
const closed = (w: typeof BEST_BALL | typeof PAST) => ({ ...verdict(w), candidates: [] });

const L = (id: string, name: string, kind: DeskLeague["kind"], v: ContendOrSellVerdict | null, bb = false): DeskLeague => ({ leagueId: id, leagueName: name, kind, verdict: v, week: week(bb) });
const compose = (leagues: DeskLeague[], tier: "free" | "pro" = "pro", ownerName = "Izzy") =>
  composeWeeklyBrief({
    ownerName, tier, leagues, resultsWeek: RESULTS_WEEK, nflWeek: 12,
    appUrl: "https://dynastygeneral.app",
    unsubscribeUrl: "https://dynastygeneral.app/api/email/unsubscribe?u=x&t=y",
    mailingAddress: "PO Box 1, Chicago IL",
    sendDate: new Date("2026-12-01T13:00:00Z"),
  });

const sv = verdict();
check("fixture: the analysts lean sell (2+ of 3)", sv.panel.voices.filter((v) => v.stance === "sell" || v.stance === "lean_sell").length >= 2, sv.panel.voices.map((v) => v.stance).join(","));

const FIXTURES: Record<string, DeskLeague[]> = {
  trades: [L("1", "Finders & Keepers", "dynasty", sv), L("2", "Jabroni", "best_ball", closed(BEST_BALL), true)],
  zero_trades: [L("1", "Europa", "dynasty", closed(PAST)), L("2", "Jabroni", "best_ball", closed(BEST_BALL), true)],
  best_ball_only: [L("2", "Jabroni", "best_ball", closed(BEST_BALL), true)],
  past_deadline_only: [L("1", "Europa", "dynasty", closed(PAST))],
  no_leagues: [],
  many_leagues: Array.from({ length: 9 }, (_, i) => L(`m${i}`, `League ${i + 1}`, i % 2 ? "redraft" : "dynasty", i < 4 ? verdict({ open: true, deadline_week: 12 }, ` ${i + 1}`) : closed(PAST))),
  sim_refused: [{ leagueId: "r", leagueName: "Too Early", kind: "redraft", verdict: null, week: null, note: "No read this week (not enough scored weeks this season to estimate weekly variance)." }],
};

console.log("\n── every edge fixture renders lint-clean (free and pro) ──");
for (const [name, leagues] of Object.entries(FIXTURES)) {
  for (const tier of ["free", "pro"] as const) {
    const b = compose(leagues, tier);
    check(`${name} / ${tier}: lint clean`, b.lint.length === 0, b.lint.join(" | "));
    // RENDER_DIR=<dir> writes each fixture for screenshots (QUALITY_BAR item 3).
    if (process.env.RENDER_DIR) writeFileSync(join(process.env.RENDER_DIR, `fixture_${name}_${tier}.html`), b.html);
  }
}

console.log("\n── trade cards ──");
const pro = compose(FIXTURES.trades, "pro");
const free = compose(FIXTURES.trades, "free");
check("one card for the open league, none for best ball", (pro.text.match(/WORTH TRYING/g) ?? []).length === 1);
check("card is phrased as an attempt to a short buyer", /Offer (Old Receiver|Vet Back) to Team \d+, who (is short a starting|has no)/.test(pro.text));
check("subject leads with the trade count and deadline day", /^\d+ trades? worth trying( before \w{3} \w{3} \d+)?: offer .+ to .+$/.test(pro.subject), pro.subject);
check("subject never leads with the product name", !BANNED_SUBJECT_LEAD.test(pro.subject));
for (const bad of ["Brief: week 11", "Weekly brief for you", "Dynasty General: week 11", "brief week 11"]) check(`subject lint rejects "${bad}"`, BANNED_SUBJECT_LEAD.test(bad));
check("subject lint allows the no-trade hook", !BANNED_SUBJECT_LEAD.test("Week 11 is in: 3-4 across your 8 leagues"));
check("hero counts the cards and cites the simulator constant", pro.text.includes("1 trade worth trying") && pro.text.includes(`${DEFAULT_SIMS.toLocaleString("en-US")} simulated seasons`));
check("verdict says 'if the price is right'", pro.text.includes("lean sell, if the price is right"));
check("fallback names next buyers or why keeping is fine", pro.text.includes("If it doesn't land:"));
check("best ball league is in the week table, never a card", pro.text.includes("Jabroni (Best ball") && !/WORTH TRYING[^\n]*Jabroni/.test(pro.text));
check("pro gets the offer button, free the locked panel", pro.html.includes("Open the offer to") && !free.html.includes("Open the offer to") && free.html.includes("Pro · The offer"));
check("free still sees the analysts and the buyer", free.text.includes("Moneyballer") && /Offer .* to Team \d+/.test(free.text));
check("no card title appears twice (no abbreviated preview up top)", (pro.text.match(/Offer (Old Receiver|Vet Back) to/g) ?? []).length === 1);

console.log("\n── zero trades and closed-only states ──");
const zero = compose(FIXTURES.zero_trades);
check("0 trades: says so in the headline", zero.text.includes("No trades worth trying this week."));
check("0 trades: explains the closed leagues", zero.text.includes("past the trade deadline or best ball"));
check("0 trades: founder ask changes", zero.text.includes("What would you want this email to tell you next Tuesday?"));
check("0 trades: subject is the week, not a card", zero.subject.startsWith("Week 11 is in"));
check("closed leagues never show sell words", !/Sell now|Lean sell|Open the offer/.test(compose(FIXTURES.best_ball_only).text + compose(FIXTURES.past_deadline_only).text));

console.log("\n── no leagues, many leagues, sim refused ──");
const none = compose(FIXTURES.no_leagues);
check("no leagues: connect nudge", none.html.includes("/connect") && none.text.includes("Connect Sleeper"));
const many = compose(FIXTURES.many_leagues);
check("9 leagues: every league rendered (no cap)", FIXTURES.many_leagues.every((l) => many.text.includes(l.leagueName)));
check("9 leagues: at most 3 cards", (many.text.match(/WORTH TRYING/g) ?? []).length <= 3);
const refused = compose(FIXTURES.sim_refused);
check("sim refused: shows the reason, no numbers", refused.text.includes("not enough scored weeks") && refused.text.includes("no odds yet"));

console.log("\n── week table ──");
check("record and result render with one-decimal scores", /\(Dynasty, \d+-\d+\): [WL] \d+\.\d-\d+\.\d/.test(pro.text), pro.text.split("\n").find((l) => l.includes("Finders")));
check("winning score bold in html", /<b style="font-weight:700;[^"]*">\d+\.\d<\/b>/.test(pro.html), (pro.html.match(/<b style="font-weight:700[^<]*<\/b>/g) ?? []).slice(0, 2).join(" "));
check("best ball shows points rank", /Jabroni \(Best ball[^)]*\): \d+(st|nd|rd|th) in pts of 12/.test(pro.text));

console.log("\n── compliance + escaping ──");
for (const [n, b] of [["free", free], ["pro", pro], ["none", none]] as const) {
  check(`${n}: unsubscribe + address in html and text`, b.html.includes("unsubscribe") && b.text.includes("PO Box 1, Chicago IL") && b.html.includes("PO Box 1, Chicago IL"));
  check(`${n}: beta + reply ask`, /BETA/.test(b.html) && b.text.includes("Hit reply") && b.text.includes("Isaiah, founder"));
}
check("team names are escaped in html", !pro.html.includes("<script>Evil") );
check("league name is escaped", pro.html.includes("Finders &amp; Keepers"));
const nameless = compose(FIXTURES.trades, "pro", "");
check("nameless owner: no dangling separator", !nameless.text.includes("· Week 11 is in") || nameless.text.split("\n")[2].startsWith("Week 11 is in"));

console.log("\n── content lint catches what it should ──");
const atName = compose(FIXTURES.trades, "pro", "someone@example.com");
check("lint: @ in greeting", atName.lint.some((l) => l.includes("@")));
const bad = composeWeeklyBrief({ ownerName: "Izzy", tier: "pro", leagues: FIXTURES.trades, resultsWeek: RESULTS_WEEK, nflWeek: 12, appUrl: "https://dynastygeneral.app", unsubscribeUrl: "https://x/u", mailingAddress: "", expectedLeagueIds: ["1", "2", "ghost"] });
check("lint: missing postal address", bad.lint.some((l) => l.includes("postal address")));
check("lint: a league neither rendered nor explained", bad.lint.some((l) => l.includes("ghost")));
const wrongWeek = composeWeeklyBrief({ ownerName: "Izzy", tier: "pro", leagues: FIXTURES.trades, resultsWeek: 7, nflWeek: 12, appUrl: "https://dynastygeneral.app", unsubscribeUrl: "https://x/u", mailingAddress: "PO" });
check("lint: week label disagrees with nfl_state", wrongWeek.lint.some((l) => l.includes("disagrees")));
const preview = composeWeeklyBrief({ ownerName: "a@b.c", tier: "pro", leagues: FIXTURES.trades, resultsWeek: RESULTS_WEEK, nflWeek: 12, appUrl: "https://dynastygeneral.app", unsubscribeUrl: "https://x/u", mailingAddress: "PO", preview: true });
check("preview lists lint failures on top", preview.text.startsWith("PREVIEW ONLY"));

console.log("\n── helpers ──");
check("fmtPct clamps the ends", fmtPct(0.001) === "<2%" && fmtPct(0.995) === ">98%" && fmtPct(0.43) === "45%");
check("ranges per spec", playoffRange(0.85) === "favorite" && playoffRange(0.6) === "in_the_hunt" && playoffRange(0.3) === "bubble" && playoffRange(0.1) === "long_shot" && playoffRange(0.01) === "no_chance" && playoffRange(0.24) === "bubble");
const tue = new Date("2026-12-01T15:00:00Z");
const sun = new Date("2026-11-29T23:00:00Z");
check("week final on Tuesday only when every row scored", lastCompletedWeek({ nflWeek: 11, matchupsByWeek: matchups, now: tue }) === 11);
check("Sunday night is not final even when every team scored", lastCompletedWeek({ nflWeek: 11, matchupsByWeek: matchups, now: sun }) === 10);
check("after Sleeper flips, the prior week is final", lastCompletedWeek({ nflWeek: 12, matchupsByWeek: matchups, now: tue }) === 11);
check("template version bumped for the Trade Desk", WEEKLY_BRIEF_TEMPLATE_VERSION.includes("desk"));


console.log("\n── desk1 review fixes ──");
check("trade-by: week 12 is Thanksgiving, 11:30 AM CT", tradeBy(12, "2026-09-09")?.label === "Thu Nov 26, 11:30 AM CT");
check("trade-by: week 13 is a Thursday night", tradeBy(13, "2026-09-09")?.label === "Thu Dec 3, 7:15 PM CT");
check("trade-by: no deadline or no start date prints no day", tradeBy(null, "2026-09-09") === null && tradeBy(12, null) === null);
const dated = composeWeeklyBrief({ ownerName: "Izzy", tier: "pro", leagues: FIXTURES.trades, resultsWeek: RESULTS_WEEK, nflWeek: 12, seasonStartDate: "2026-09-09", appUrl: "https://dynastygeneral.app", unsubscribeUrl: "https://x/u", mailingAddress: "PO Box 1, Chicago IL" });
check("hero names the trade-by day", dated.text.includes("1 trade worth trying before Thu Nov 26, 11:30 AM CT."), dated.text.split("\n")[3]);
check("card chip names the trade-by day", dated.text.includes("Trade before Thu Nov 26, 11:30 AM CT"));
check("dated brief is lint clean", dated.lint.length === 0, dated.lint.join(" | "));
check("playoffs tile leads with the range label", /Playoffs: (Favorite|In the hunt|Bubble|Long shot|No chance) \(/.test(pro.text));
check("one player per card: no other-piece line", !pro.text.includes("other piece worth moving"));
const cardVoices = pro.text.split("\n").filter((l) => /^  (Strategist|Moneyballer|Gambler) · /.test(l));
const lead = pro.text.match(/Offer (Old Receiver|Vet Back) to/)?.[1] ?? "?";
check("every analyst line names the card's player", cardVoices.length === 3 && cardVoices.every((l) => l.includes(lead)), cardVoices.join(" / "));
check("analyst lines cite the league record", cardVoices.some((l) => /At \d+-\d+/.test(l)));
const lostSeason = strategist({ teams: 12, title_pct: 0.001, playoff_pct: 0.005, title_delta: 0, value_kept_by_selling: 5, roster_retained_share: 0.99 }, { player: "X Y", record: "0-11" });
check("a lost season never calls the core young", !/young/.test(lostSeason.line) && lostSeason.line.includes("this season is over"), lostSeason.line);
check("refused: never claims a sale read, no recap headline", !refused.text.includes("no sale worth trying") && !/last week\./.test(refused.text), refused.text.split("\n").slice(3, 8).join(" / "));
check("refused: no double colon", !/: No read this week:/.test(refused.text));
check("all-closed hero never says 'in the rest'", !compose(FIXTURES.past_deadline_only).text.includes("in the rest"));
const weird = composeWeeklyBrief({ ownerName: "Izzy", tier: "pro", leagues: [{ ...FIXTURES.trades[0], leagueName: "Pushkin 100% Juice!" }, FIXTURES.trades[1]], resultsWeek: RESULTS_WEEK, nflWeek: 12, appUrl: "https://dynastygeneral.app", unsubscribeUrl: "https://x/u", mailingAddress: "PO Box 1, Chicago IL" });
check("lint skips user-chosen names ('Pushkin 100% Juice!')", weird.lint.length === 0, weird.lint.join(" | "));
const placeholder = composeWeeklyBrief({ ownerName: "Izzy", tier: "pro", leagues: FIXTURES.trades, resultsWeek: RESULTS_WEEK, nflWeek: 12, appUrl: "https://dynastygeneral.app", unsubscribeUrl: "https://x/u", mailingAddress: "(mailing address)" });
check("lint fails the address placeholder", placeholder.lint.some((l) => l.includes("placeholder")));
const closedWeek = buildLeagueWeek({
  rosters: ids.map((id) => ({ roster_id: id, manager: `Team ${id}`, is_me: id === ME, player_ids: [`p${id}`], starters: [`p${id}`] })),
  matchupsByWeek: matchups, resultsWeek: RESULTS_WEEK, playoffWeekStart: 15, playoffTeams: 6, bestBall: false, tradeOpen: false,
});
check("no for-you label where trading is closed", closedWeek.shifts.every((s) => s.role === null));
const openShifts = week().shifts;
check("shift why leads with the week's cause", openShifts.length === 0 || openShifts.every((s) => /^(Beat|Lost|Tied|Scored)/.test(s.why)), openShifts.map((s) => s.why).join(" / "));
check("no role legend: the for-you column explains itself", !pro.text.includes("For you: Seller:") && !/\bSeller\b/.test(pro.text));

console.log("\n── desk6: ask range, for-you actions, signed-out links ──");
const offers = [
  { player_id: "a", name: "Fair Guy", position: "WR", value: 50 },
  { player_id: "b", name: "Floor Guy", position: "TE", value: 45 },
  { player_id: "c", name: "Great Guy", position: "QB", value: 61 },
  { player_id: "d", name: "Same Pos", position: "RB", value: 50 },
  { player_id: "e", name: "Kicker", position: "K", value: 50 },
];
const ladder = buildAskLadder({ targetValue: 50, offers, excludePosition: "RB" });
check("ask ladder: fair is about even", ladder?.fair?.name === "Fair Guy", JSON.stringify(ladder));
check("ask ladder: floor sits under value", ladder?.floor?.name === "Floor Guy");
check("ask ladder: great is an overpay", ladder?.great?.name === "Great Guy");
check("ask ladder never offers the sold position or a kicker", ![ladder?.fair, ladder?.floor, ladder?.great].some((r) => r?.position === "RB" || r?.position === "K"));
const pair = buildAskLadder({ targetValue: 50, offers: [{ player_id: "m", name: "Main", position: "WR", value: 40 }, { player_id: "s", name: "Small", position: "TE", value: 24 }, { player_id: "t", name: "Tiny", position: "QB", value: 12 }], excludePosition: "RB" });
check("ask ladder builds a two-piece package when no single player fits", pair?.fair?.name === "Main" && pair.fair.plus?.name === "Small" && pair.fair.value === 52, JSON.stringify(pair));
check("two-piece package discounts the add-on (consolidation premium)", pair?.fair?.plus?.name !== "Tiny");
check("ask ladder is null with nothing in band", buildAskLadder({ targetValue: 50, offers: [{ player_id: "x", name: "X", position: "WR", value: 10 }], excludePosition: "RB" }) === null);
const simT = { teams: [{ roster_id: 1, wins: 7, losses: 4, ties: 0 }, { roster_id: 2, wins: 5, losses: 6, ties: 0 }] };
const r1 = { roster_id: 1, manager: "Me", is_me: true, player_ids: [], starters: [] };
const r2 = { roster_id: 2, manager: "Them", is_me: false, player_ids: [], starters: [] };
check("rival action names the games gap", shiftAction({ role: "rival", roster: r2, me: r1, sim: simT, hurt: null })?.text === "Rival: now 2 games back of you");
check("buyer action names the injured starter", shiftAction({ role: "buyer", roster: r2, me: r1, sim: simT, hurt: { name: "Bijan Robinson", position: "RB" } })?.text === "Needs a RB with Bijan Robinson out");
check("pro shift rows print a concrete for-you line, never a bare label", !/For you: (Seller|Buyer|Rival)\./.test(pro.text));
check("league links carry the username for signed-out readers", leagueHref("https://x.app", { sleeperUsername: "izzy dabomb" } as never, "123", "/trade") === "https://x.app/leagues/123/trade?username=izzy%20dabomb");


console.log("\n── shared decision items (email and /home read one list) ──");
const items = dated.items;
const trades = items.filter((i) => i.kind === "trade");
check("one trade item per card", trades.length === 1);
check("every trade sentence the item carries is in the email verbatim", trades.every((t) => t.kind === "trade" && [t.title, t.verdict, t.deadline_label!, ...t.voices.map((v) => v.line)].every((x) => dated.text.includes(x))));
check("trade item has three stat tiles and a deadline time", trades.every((t) => t.kind === "trade" && t.stats.length === 3 && !!t.deadline));
check("trade id uses the week ahead", trades.every((t) => t.id.startsWith("trade:2026w12:1:")), trades.map((t) => t.id).join());
check("one week row per league", items.filter((i) => i.kind === "week_row").length === FIXTURES.trades.length);
check("digest headline and subline are the email's hero", dated.text.includes(dated.digest.headline) && dated.text.includes(dated.digest.subline));
const shiftItems = items.filter((i) => i.kind === "shift");
check("at most 8 shift items are emailed; the rest are app-only", shiftItems.filter((i) => i.delivery.emailed).length <= 8);
check("item ids are unique", new Set(items.map((i) => i.id)).size === items.length);
const refusedRow = compose(FIXTURES.sim_refused).items.find((i) => i.kind === "week_row");
check("refused league row carries its reason", refusedRow?.kind === "week_row" && !!refusedRow.refused_reason && refusedRow.playoffs === null);
const tampered = items.map((i) => (i.kind === "trade" ? { ...i, verdict: "Push now!" } : i));
check("the item lint applies the copy rules", lintDecisionItems(tampered, []).some((l) => l.includes("exclamation")));

console.log("\n── /home design check fixes ──");
const card0 = dated.items.find((i) => i.kind === "trade");
const row0 = dated.items.find((i) => i.kind === "week_row" && i.league_id === card0?.league_id);
check("card playoffs tile and the league row read one number", card0?.kind === "trade" && row0?.kind === "week_row" && row0.playoffs != null && card0.stats[0].sub!.startsWith(fmtPct(row0.playoffs)), `${card0?.kind === "trade" ? card0.stats[0].sub : ""} vs ${row0?.kind === "week_row" ? row0.playoffs : ""}`);
check("the Moneyballer names the offseason drop, not a value", card0?.kind === "trade" && card0.voices.some((v) => v.voice === "moneyball" && /offseason drop/.test(v.line)) && !/keeps about \d+ value/.test(dated.text));
const oneClosed = compose([FIXTURES.past_deadline_only[0]]);
check("one closed league reads singular", oneClosed.text.includes("Your 1 league is past the trade deadline") && !oneClosed.text.includes("All 1 league"));

console.log("\n── mailing address from any env var name ──");
const SAMPLE = "1 Sample Rd., Springfield, IL 62701";
check("our name wins", resolveMailingAddress({ EMAIL_MAILING_ADDRESS: SAMPLE, MAILING_ADDRESS: "2 Other St, Austin, TX 78701" })?.source === "EMAIL_MAILING_ADDRESS");
check("a common alternate is found", resolveMailingAddress({ MAILING_ADDRESS: SAMPLE })?.value === SAMPLE);
check("any *ADDRESS* var holding a postal address is found", resolveMailingAddress({ RESEND_FOOTER_ADDRESS: SAMPLE })?.source === "RESEND_FOOTER_ADDRESS");
check("an email address or URL is never taken as postal", resolveMailingAddress({ FROM_ADDRESS: "brief@dynastygeneral.app", SITE_ADDRESS: "https://dynastygeneral.app" }) === null);

console.log("\n── beta: no paywall in the email until the split is switched on ──");
check("split off: a free account renders the full brief", briefRenderTier("free", false) === "pro");
check("split on: tiers render as they are", briefRenderTier("free", true) === "free" && briefRenderTier("pro", true) === "pro");
check("brief_pro_split ships off", FLAGS.brief_pro_split.rollout[0] === 0);
const beta = compose(FIXTURES.trades, briefRenderTier("free", false));
check("beta brief has no /pricing link and no locked panel", !beta.html.includes("/pricing") && !beta.html.includes("Pro · The offer"));

console.log("\n── unsubscribe tokens ──");
const uid = "11111111-2222-3333-4444-555555555555";
const tok = unsubscribeToken(uid, "weekly_brief", "k1")!;
check("token verifies for its user", verifyUnsubscribeToken(uid, tok, "weekly_brief", "k1"));
check("token fails for another user", !verifyUnsubscribeToken("11111111-2222-3333-4444-555555555556", tok, "weekly_brief", "k1"));
check("token fails under another key", !verifyUnsubscribeToken(uid, tok, "weekly_brief", "k2"));
check("no key, no token", unsubscribeToken(uid, "weekly_brief", null) === null);

console.log("\n── send guard (no broadcast without an approved template) ──");
const V = WEEKLY_BRIEF_TEMPLATE_VERSION;
const g = (o: Partial<Parameters<typeof resolveSendMode>[0]>) =>
  resolveSendMode({ templateVersion: V, approvedVersion: undefined, previewTo: undefined, replyTo: "owner@dg.app", requestedMode: null, ...o });
check("approved version matching the deploy broadcasts", g({ approvedVersion: V }).mode === "broadcast");
const noApproval = g({});
check("no approval previews to the reply-to inbox only", noApproval.mode === "preview" && noApproval.to.join() === "owner@dg.app");
const stale = g({ approvedVersion: "2020-01-01.old" });
check("stale approval never broadcasts", stale.mode === "preview" && stale.reason.includes("mismatch"));
check("explicit preview list wins over reply-to", (() => { const r = g({ previewTo: "A@x.com, b@y.com" }); return r.mode === "preview" && r.to.join() === "a@x.com,b@y.com"; })());
check("?mode=preview forces preview even when approved", g({ approvedVersion: V, requestedMode: "preview" }).mode === "preview");
check("no approval and no admin address refuses", g({ replyTo: undefined }).mode === "refuse");
check("force is ignored on broadcasts", !honorForce(true, "broadcast") && honorForce(true, "preview"));
check("a new approved version gets a new broadcast key (deliberate resend)", briefSendKind("wb_w12", "v1", "broadcast") !== briefSendKind("wb_w12", "v2", "broadcast"));
check("preview key never equals the broadcast key", briefSendKind("wb_w12", "v1", "preview") !== briefSendKind("wb_w12", "v1", "broadcast"));

console.log("\n── sender display name ──");
check("default From carries the brand name", briefFrom(undefined) === "Dynasty General <brief@dynastygeneral.app>", briefFrom(undefined));
check("bare EMAIL_FROM gets the brand name", briefFrom("alerts@dynastygeneral.app") === "Dynasty General <alerts@dynastygeneral.app>");
check("EMAIL_FROM with a display name is kept", briefFrom("DG Team <x@dynastygeneral.app>") === "DG Team <x@dynastygeneral.app>");
check("blank EMAIL_FROM falls back to the default", briefFrom("  ") === "Dynasty General <brief@dynastygeneral.app>");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
