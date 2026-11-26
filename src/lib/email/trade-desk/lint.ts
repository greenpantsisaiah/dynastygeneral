/**
 * Content lint for the Tuesday Trade Desk (BUILD_SPEC "Content lint").
 * Runs where the cron calls the renderer; any failure blocks the
 * broadcast (previews still go to the admin list, with the failures
 * listed on top so Isaiah sees exactly what would have been blocked).
 * Lines a machine can check live here; judgment lines are design-qa's.
 */

import { cardTitle, deskSubject } from "./render";
import type { TradeDeskModel } from "./model";
import { itemSentences, type DecisionItem } from "@/lib/decisions/items";

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

/**
 * Every name a user or their league chose (league, team, manager, player).
 * The copy rules police OUR words: a team called "Pushkin" or "100% Juice"
 * must never block that user's brief every week (coordinator, 2026-11-26).
 */
export function userSuppliedNames(m: TradeDeskModel): string[] {
  const names = new Set<string>();
  const add = (n: string | null | undefined) => {
    const t = n?.trim();
    if (t) names.add(t);
  };
  add(m.ownerName);
  for (const l of m.leagues) {
    add(l.leagueName);
    const r = l.week?.result;
    if (r?.kind === "h2h") add(r.opp_label);
    for (const sh of l.week?.shifts ?? []) {
      add(sh.manager);
      add(sh.injury?.player);
      for (const n of sh.action_players ?? []) add(n);
    }
    for (const c of l.verdict?.candidates ?? []) {
      add(c.player.name);
      for (const b of c.buyers) {
        add(b.label);
        for (const r of [b.ask?.floor, b.ask?.fair, b.ask?.great]) {
          add(r?.name);
          add(r?.plus?.name);
        }
      }
    }
  }
  return [...names].sort((a, b) => b.length - a.length);
}

/** Text with every user-supplied name blanked out, for the copy checks. */
export function withoutNames(text: string, names: string[]): string {
  let out = text;
  for (const n of names) out = out.split(n).join(" ");
  return out;
}

const PLACEHOLDER_ADDRESS = /\[mailing address|\(mailing address\)/i;

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
  const names = userSuppliedNames(m);
  const ours = withoutNames(body, names);
  if (/(^|[^\d.<>])(0|100)%/.test(ours)) f.push("a 0% or 100% probability (use <2% / >98%)");
  if (/\b0 (value )?(points|pts)\b|about 0\b|worth 0\b/.test(body)) f.push("a zero value line");

  // Same sentence twice, analyst lines included: each card's analysts must
  // cite that league's own facts (desk1 review, 2026-11-26).
  const sentences = body.split(/(?<=[.?])\s+|\n/).map((s) => s.trim()).filter((s) => s.length > 40 && /[.?]$/.test(s));
  const dup = sentences.find((s, i) => sentences.indexOf(s) !== i);
  if (dup) f.push(`sentence rendered twice: "${dup.slice(0, 80)}"`);

  const rendered = new Set(m.leagues.map((l) => l.leagueId));
  for (const id of args.expectedLeagueIds) if (!rendered.has(id)) f.push(`league ${id} is neither rendered nor explained`);
  for (const l of m.leagues) if (!body.includes(l.leagueName.trim())) f.push(`league "${l.leagueName}" missing from the body`);

  const oursText = withoutNames(args.text, names);
  const oursSubject = withoutNames(args.subject, names);
  for (const [re, what] of BANNED) {
    if (re.test(ours) || re.test(oursText) || re.test(oursSubject)) f.push(`contains ${what}`);
  }

  if (Buffer.byteLength(args.html, "utf8") > MAX_HTML_BYTES) f.push(`HTML is ${Math.round(Buffer.byteLength(args.html, "utf8") / 1024)} KB (limit 95)`);
  if (!args.text.trim()) f.push("missing plain-text part");
  if (!args.unsubscribeUrl || !args.html.includes(args.unsubscribeUrl.replace(/&/g, "&amp;")) && !args.html.includes(args.unsubscribeUrl)) f.push("missing unsubscribe link");
  if (!args.mailingAddress || !body.includes(args.mailingAddress)) f.push("missing postal address");
  else if (PLACEHOLDER_ADDRESS.test(args.mailingAddress)) f.push("postal address is a placeholder (no address found in the environment)");
  if (args.subject !== deskSubject(m)) f.push("subject does not match the first card");
  if (BANNED_SUBJECT_LEAD.test(args.subject.trim())) f.push("subject leads with the product name instead of the decision");
  return f;
}

/** Subjects lead with the decision or the hook (Isaiah, 2026-11-26). */
export const BANNED_SUBJECT_LEAD = /^(weekly brief|brief|dynasty general)\b/i;

/**
 * The same copy rules over the shared decision items (BUILD_SPEC: the lint
 * runs once on the items, then once more on the email), so /home inherits
 * every rule the email follows.
 */
export function lintDecisionItems(items: DecisionItem[], names: string[]): string[] {
  const f: string[] = [];
  const ids = items.map((i) => i.id);
  if (new Set(ids).size !== ids.length) f.push("two decision items share an id");
  const sentences: string[] = [];
  for (const item of items) {
    for (const raw of itemSentences(item)) {
      const ours = withoutNames(raw, names);
      for (const [re, what] of BANNED) if (re.test(ours)) f.push(`item ${item.id} contains ${what}`);
      if (/\bNaN\b|undefined|\bnull\b/.test(raw)) f.push(`item ${item.id} renders NaN, undefined or null`);
      if (/(^|[^\d.<>])(0|100)%/.test(ours)) f.push(`item ${item.id} has a 0% or 100% probability`);
      // The repeat rule is for the email; app-only items (e.g. two leagues past
      // the same deadline) may honestly share a sentence.
      if (item.delivery.emailed) sentences.push(...raw.split(/(?<=[.?])\s+/).map((x) => x.trim()).filter((x) => x.length > 40 && /[.?]$/.test(x)));
    }
  }
  const dup = sentences.find((x, i) => sentences.indexOf(x) !== i);
  if (dup) f.push(`item sentence repeated: "${dup.slice(0, 80)}"`);
  return [...new Set(f)];
}
