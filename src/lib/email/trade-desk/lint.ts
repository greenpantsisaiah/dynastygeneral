/**
 * Content lint for the Tuesday Trade Desk (BUILD_SPEC "Content lint").
 * Runs where the cron calls the renderer; any failure blocks the
 * broadcast (previews still go to the admin list, with the failures
 * listed on top so Isaiah sees exactly what would have been blocked).
 * Lines a machine can check live here; judgment lines are design-qa's.
 */

import { cardTitle, deskSubject } from "./render";
import type { TradeDeskModel } from "./model";

export const MAX_HTML_BYTES = 95 * 1024;

const BANNED: Array<[RegExp, string]> = [
  [/—/, "em dash"],
  [/!/, "exclamation point"],
  [/\bpush/i, "the word \"push\""],
  [/title odds/i, "the phrase \"title odds\""],
  [/\bEV\b/, "bare \"EV\""],
  [/receipts/i, "the word \"receipts\""],
];

function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    // Cell and block ends become line breaks, so a stat tile never fuses with a sentence.
    .replace(/<\/(td|div|p|h2|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/[ \t]+/g, " ");
}

export function lintTradeDesk(args: {
  model: TradeDeskModel;
  html: string;
  text: string;
  subject: string;
  /** nfl_state.week at send time. */
  nflWeek: number;
  /** Every league id the user is in (from Sleeper), to catch silent drops. */
  expectedLeagueIds: string[];
  unsubscribeUrl: string;
  mailingAddress: string;
}): string[] {
  const f: string[] = [];
  const m = args.model;
  const body = visibleText(args.html);

  if (m.ownerName.includes("@")) f.push("greeting contains \"@\"");
  if (m.aheadWeek !== m.resultsWeek + 1) f.push("ahead week is not results week + 1");
  if (m.resultsWeek !== args.nflWeek && m.resultsWeek !== args.nflWeek - 1) {
    f.push(`results week ${m.resultsWeek} disagrees with nfl_state week ${args.nflWeek}`);
  }

  for (const c of m.cards) {
    if (!c.verdict.trade_window.open) f.push(`trade card in ${c.leagueName}, whose trade window is closed`);
    if (!c.buyer) f.push(`trade card in ${c.leagueName} has no buyer`);
  }
  const ids = m.cards.map((c) => c.leagueId);
  if (new Set(ids).size !== ids.length) f.push("a league has two trade cards");
  // Each decision once: a card title appears exactly as often as cards carry it.
  const titles = m.cards.map(cardTitle);
  for (const t of new Set(titles)) {
    const want = titles.filter((x) => x === t).length;
    const seen = body.split(t).length - 1;
    if (seen !== want) f.push(`card title "${t}" appears ${seen} times`);
  }

  // Zero / NaN / out-of-range probability checks on what a reader sees.
  if (/\bNaN\b|undefined|\bnull\b/.test(body)) f.push("NaN, undefined or null rendered");
  if (/\b0\.0\b/.test(body)) f.push("\"0.0\" rendered");
  if (/(^|[^\d.<>])(0|100)%/.test(body)) f.push("a 0% or 100% probability (use <2% / >98%)");
  if (/\b0 (value )?(points|pts)\b|about 0\b|worth 0\b/.test(body)) f.push("a zero value line");

  // Same sentence twice.
  const sentences = body.split(/(?<=[.?])\s+|\n/).map((s) => s.trim()).filter((s) => s.length > 40 && /[.?]$/.test(s));
  // Analyst lines are templates over each league's numbers; the same line in
  // two leagues is two readings, not one decision said twice.
  const voiceLines = new Set(
    m.cards.flatMap((c) => c.verdict.panel.voices.flatMap((v) => v.line.split(/(?<=[.?])\s+/).map((x) => x.trim()))),
  );
  const dup = sentences.find((s, i) => sentences.indexOf(s) !== i && !voiceLines.has(s));
  if (dup) f.push(`sentence rendered twice: "${dup.slice(0, 80)}"`);

  const rendered = new Set(m.leagues.map((l) => l.leagueId));
  for (const id of args.expectedLeagueIds) if (!rendered.has(id)) f.push(`league ${id} is neither rendered nor explained`);
  for (const l of m.leagues) if (!body.includes(l.leagueName.trim())) f.push(`league "${l.leagueName}" missing from the body`);

  for (const [re, what] of BANNED) {
    if (re.test(body) || re.test(args.text) || re.test(args.subject)) f.push(`contains ${what}`);
  }

  if (Buffer.byteLength(args.html, "utf8") > MAX_HTML_BYTES) f.push(`HTML is ${Math.round(Buffer.byteLength(args.html, "utf8") / 1024)} KB (limit 95)`);
  if (!args.text.trim()) f.push("missing plain-text part");
  if (!args.unsubscribeUrl || !args.html.includes(args.unsubscribeUrl.replace(/&/g, "&amp;")) && !args.html.includes(args.unsubscribeUrl)) f.push("missing unsubscribe link");
  if (!args.mailingAddress || !body.includes(args.mailingAddress)) f.push("missing postal address");
  if (args.subject !== deskSubject(m)) f.push("subject does not match the first card");
  return f;
}
