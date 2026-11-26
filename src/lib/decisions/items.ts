/**
 * Decision items: the one list the weekly emails and the in-app home both
 * render from (founder direction 2026-11-26: "the app is home, the email is
 * the teaser", with tight alignment between the two).
 *
 * Contract:
 * - One builder (to be added in this module) produces DecisionItem[] per
 *   user per NFL week. Surfaces only lay items out; they never reword them.
 *   Every user-facing sentence (title, why, verdict, fallback, voice lines)
 *   is written by the builder, so one content lint covers both surfaces.
 * - Every item has a stable id. An email button links to
 *   `{app}/home?item={id}`; the home scrolls to that item and opens it.
 * - The app is a superset: every emailed item appears in the app, and the
 *   app may also show items with `emailed: false` (below the email bar).
 *
 * The builder (buildDecisionItems, below) reads the Trade Desk model and
 * writes every sentence once, with the same copy functions the email uses,
 * so the email and /home cannot word a decision two ways.
 */

import type { Stance, VoiceName } from "@/lib/strategy/verdict/voices";
import { MIN_CARD_VALUE_KEPT, STANCE_LABEL, isShortAt, playoffDelta, sellLeaningCount, type DeskLeague, type TradeCard, type TradeDeskModel } from "@/lib/email/trade-desk/model";
import { fmtPct, fmtScore, playoffRange as rangeOf, RANGE_LABEL } from "@/lib/email/trade-desk/league-week";
import {
  allShifts,
  cardTitle,
  deadlineChip,
  fallbackLine,
  heroHeadline,
  heroSub,
  KIND_LABEL,
  MAX_SHIFT_ROWS,
  ordinal,
  sellEffect,
  sellingLabel,
  shiftsHeadline,
  verdictLine,
  weekHeadline,
} from "@/lib/email/trade-desk/render";

export type DecisionKind =
  /** A trade worth trying before the league's trade deadline. */
  | "trade"
  /** A manager whose season changed range, or who lost a key starter. */
  | "shift"
  /** The user's highest-stakes head-to-head game this week. */
  | "swing"
  /** A starter who will score zero (out, bye, empty) or, later, a graded lineup change. */
  | "lineup"
  /** An NFL player the user should root for or against across all games. */
  | "rootfor"
  /** One row per league in the "Week n across your leagues" table. */
  | "week_row"
  /** App only: the analysts' call for a league with no trade worth trying, and why. */
  | "league_call";

/** Which surfaces an item is allowed on. */
export interface DecisionDelivery {
  /** True when the item clears the email bar and appears in an email. */
  emailed: boolean;
  /** Which email carries it, when emailed. */
  email?: "tuesday_trade_desk" | "sunday_game_day" | "lineup_alert" | "welcome_brief";
}

/** Playoff range labels (BUILD_SPEC: Favorite 80%+, In the hunt 50-80, Bubble 25-50, Long shot 2-25, No chance under 2%). */
export type PlayoffRange = "favorite" | "in_the_hunt" | "bubble" | "long_shot" | "no_chance";

/** A labeled number, e.g. { label: "Playoffs", value: "In the hunt", sub: "70%, range 60 to 80 · 3rd of 12" }. */
export interface DecisionStat {
  label: string;
  value: string;
  sub?: string;
}

/** One analyst's read on a trade. */
export interface DecisionVoice {
  voice: VoiceName;
  stance: Stance;
  /** The stance as shown on the scale, e.g. "Lean sell", "Buy". */
  stance_label: string;
  /** One sentence; cites only numbers present in the item's stats. */
  line: string;
}

interface BaseItem {
  /** Stable id: `{kind}:{season}w{week}:{leagueId}:{subject}`. Use decisionItemId(). */
  id: string;
  kind: DecisionKind;
  season: string;
  /** NFL week the item is about (the week ahead for trades and lineups). */
  week: number;
  /** Null for cross-league items (rootfor). */
  league_id: string | null;
  league_name: string | null;
  /** ISO time after which the item can no longer be acted on, or null. */
  deadline: string | null;
  /** Deadline as shown, e.g. "Closes Thu Nov 26, 7:15 PM CT". */
  deadline_label: string | null;
  /** Sort key within the feed: higher is more urgent. */
  priority: number;
  /** The headline sentence, phrased as the action or the fact. */
  title: string;
  delivery: DecisionDelivery;
}

export interface TradeItem extends BaseItem {
  kind: "trade";
  direction: "sell" | "buy";
  /** "Worth trying · 1 of 2 · Europa". */
  kicker: string;
  /** Exactly three tiles: playoffs, win the league, effect of the move. */
  stats: DecisionStat[];
  voices: DecisionVoice[];
  /** "2 of 3 lean sell, if the price is right. Open by asking for ..." */
  verdict: string;
  /** "If it doesn't land: ..." (the clause after the colon). */
  if_it_doesnt_land: string;
  /** Counterparty manager display name. */
  manager: string;
  /** App only: the full package the analysts priced, when it has more than one piece. */
  package_note: string | null;
  /** Button label, e.g. "Open the offer to gridirongoat". */
  cta_label: string;
}

export interface ShiftItem extends BaseItem {
  kind: "shift";
  manager: string;
  range_from: PlayoffRange | null;
  range_to: PlayoffRange | null;
  /** Short cause with numbers: "Josh Allen out 4-6 weeks; 60% to 25%". */
  cause: string;
  /** Null when trading is impossible (best ball, past the deadline). */
  for_you: "seller" | "buyer" | "rival" | null;
}

export interface SwingItem extends BaseItem {
  kind: "swing";
  opponent: string;
  /** Wins out of 100 simulated games. */
  win_of_100: number;
  /** Ten margin bins, counts out of 100, lowest margin first. */
  margin_bins: number[];
  /** Playoff chance if the user wins and if they lose, 0-1. */
  playoffs_if_win: number | null;
  playoffs_if_loss: number | null;
}

export interface LineupItem extends BaseItem {
  kind: "lineup";
  /** "out" | "bye" | "empty" today; "change" once graded lineup advice exists. */
  problem: "out" | "bye" | "empty" | "change";
  /** The fact or the change, e.g. "Jaylen Waddle (WR) is listed Out and still in your flex spot." */
  detail: string;
  /** "On your bench: ..." */
  options_line: string;
  cta_label: string;
}

export interface RootForItem extends BaseItem {
  kind: "rootfor";
  player_id: string;
  player_name: string;
  kickoff: string;
  you_start: number;
  they_start: number;
  call: "root_for" | "root_against" | "wash";
}

export interface WeekRowItem extends BaseItem {
  kind: "week_row";
  /** "Dynasty · 7-4" or "Best ball · 4th". */
  format_record: string;
  /** "W 131-118", "L 104-126", or "3rd in pts". */
  result: string | null;
  /** Playoff chance 0-1, null when refused or not applicable. */
  playoffs: number | null;
  /** Change since last week in points, e.g. +8. */
  playoffs_change: number | null;
  /** Number of trade and lineup items for this league this week. */
  recs: number;
  /** When the season sim declined (ok: false), its reason; numbers are then hidden. */
  refused_reason: string | null;
}

/**
 * App only. Every league with a season read and no trade card gets one, so
 * the feed never ends at the last trade and each league says what the
 * analysts think and why nothing needs doing (2026-11-26, Isaiah: "it's
 * unclear what calls to action there are on any of my leagues").
 */
export interface LeagueCallItem extends BaseItem {
  kind: "league_call";
  /** The panel's headline stance, or null when trading is closed. */
  stance: Stance | null;
  /** "Keep going", "Lean sell", "Nothing to trade". */
  stance_label: string;
  /** "Playoffs 90% · Redraft · 7-4". */
  context: string;
  /** Why there is no trade card, one sentence. */
  reason: string;
  voices: DecisionVoice[];
}

export type DecisionItem = TradeItem | ShiftItem | SwingItem | LineupItem | RootForItem | WeekRowItem | LeagueCallItem;

/** Stable item id; the email link and the home anchor both use it. */
export function decisionItemId(kind: DecisionKind, season: string, week: number, leagueId: string | null, subject: string): string {
  return `${kind}:${season}w${week}:${leagueId ?? "all"}:${subject}`;
}

/** Deep link from an email to the item on the home. */
export function decisionItemHref(appUrl: string, id: string): string {
  return `${appUrl.replace(/\/$/, "")}/home?item=${encodeURIComponent(id)}`;
}

/**
 * The hero and section lines, written once so the email and /home print
 * the same text.
 */
export interface DecisionDigest {
  /** "izzydabomb · Week 11 is in · Week 12 ahead" */
  kicker: string;
  headline: string;
  subline: string;
  /** "3-4 last week. Your playoff chances ..." or null when no league has a result. */
  week_summary: string | null;
  /** "8 teams changed their season. ..." or null when nothing shifted. */
  shifts_summary: string | null;
}

const deEntity = (t: string) => t.replace(/&minus;/g, "-").replace(/&lt;/g, "<");

function tradeItem(c: TradeCard, i: number, m: TradeDeskModel, season: string): TradeItem {
  const v = c.verdict;
  const eff = sellEffect(c);
  const pkg = v.candidates.length > 1 ? `The analysts also priced selling ${v.candidates.map((x) => x.player.name).join(" and ")} together.` : null;
  return {
    id: decisionItemId("trade", season, m.aheadWeek, c.leagueId, c.lead.player.player_id),
    kind: "trade",
    season,
    week: m.aheadWeek,
    league_id: c.leagueId,
    league_name: c.leagueName,
    deadline: c.tradeBy?.iso ?? null,
    deadline_label: deadlineChip(c),
    priority: 1000 - i,
    title: cardTitle(c),
    delivery: { emailed: true, email: "tuesday_trade_desk" },
    direction: "sell",
    kicker: `Worth trying · ${i + 1} of ${m.cards.length} · ${c.leagueName}`,
    stats: [
      { label: "Playoffs", value: RANGE_LABEL[rangeOf(c.playoffPct)], sub: `${fmtPct(c.playoffPct)} · ${ordinal(v.league.rank_by_title_odds)} of ${v.league.teams} by odds` },
      { label: "Win the league", value: fmtPct(v.odds.title_pct), sub: `fair share is ${Math.round(v.league.fair_title_share * 100)}%` },
      { label: sellingLabel(c), value: deEntity(eff.big), sub: deEntity(eff.sub) },
    ],
    voices: c.panel.voices.map((x) => ({ voice: x.voice, stance: x.stance, stance_label: STANCE_LABEL[x.stance], line: x.line })),
    verdict: verdictLine(c),
    if_it_doesnt_land: fallbackLine(c),
    manager: c.buyer.label,
    package_note: pkg,
    cta_label: `Open the offer to ${c.buyer.label}`,
  };
}

function weekRow(l: DeskLeague, m: TradeDeskModel, season: string): WeekRowItem {
  const w = l.week;
  const r = w?.result;
  const rec = w ? `${w.record.wins}-${w.record.losses}${w.record.ties ? `-${w.record.ties}` : ""}` : null;
  const result = !r
    ? null
    : r.kind === "points_rank"
      ? `${ordinal(r.rank)} in pts`
      : `${r.won == null ? "T" : r.won ? "W" : "L"} ${fmtScore(r.my)}-${fmtScore(r.opp)}`;
  return {
    id: decisionItemId("week_row", season, m.resultsWeek, l.leagueId, "row"),
    kind: "week_row",
    season,
    week: m.resultsWeek,
    league_id: l.leagueId,
    league_name: l.leagueName,
    deadline: null,
    deadline_label: null,
    priority: 0,
    title: l.leagueName,
    delivery: { emailed: true, email: "tuesday_trade_desk" },
    format_record: [KIND_LABEL[l.kind], rec].filter(Boolean).join(" · "),
    result,
    playoffs: w?.playoff_now ?? null,
    playoffs_change: playoffDelta(w),
    recs: m.recsByLeague[l.leagueId] ?? 0,
    refused_reason: w?.odds_note ?? (l.verdict ? null : l.note ?? null),
  };
}

function leagueCall(l: DeskLeague, m: TradeDeskModel, season: string): LeagueCallItem | null {
  const v = l.verdict;
  if (!v) return null;
  const playoffs = l.week?.playoff_now ?? v.odds.playoff_pct;
  const rec = l.week ? `${l.week.record.wins}-${l.week.record.losses}${l.week.record.ties ? `-${l.week.record.ties}` : ""}` : null;
  const context = [`Playoffs ${fmtPct(playoffs)}`, KIND_LABEL[l.kind], rec].filter(Boolean).join(" · ");
  const base = {
    id: decisionItemId("league_call", season, m.aheadWeek, l.leagueId, "call"),
    kind: "league_call" as const,
    season,
    week: m.aheadWeek,
    league_id: l.leagueId,
    league_name: l.leagueName,
    deadline: null,
    deadline_label: null,
    delivery: { emailed: false } as DecisionDelivery,
    context,
  };
  if (!v.trade_window.open) {
    return {
      ...base,
      priority: 100 + Math.round(playoffs * 10),
      title: "Nothing to trade this week.",
      stance: null,
      stance_label: "Nothing to trade",
      reason: v.trade_window.label,
      voices: [],
    };
  }
  const head = v.panel.headline;
  const voices = v.panel.voices.map((x) => ({ voice: x.voice, stance: x.stance, stance_label: STANCE_LABEL[x.stance], line: x.line }));
  const keepers = v.panel.voices.filter((x) => x.stance === "push" || x.stance === "lean_push").length;
  if (v.horizon === "this_season") {
    // Redraft: rosters reset after the season, so there is nothing to sell for.
    const over = head === "split";
    return {
      ...base,
      priority: 200 + Math.round(playoffs * 10),
      title: over ? "Season is over; redraft has nothing to sell for." : "Play to win this season.",
      stance: head,
      stance_label: STANCE_LABEL[head],
      reason: over
        ? "Redraft rosters reset after the season, so no trade changes anything that carries over."
        : "Redraft rosters reset after the season, so a sale banks nothing. Trade only for players who add weekly points.",
      voices,
    };
  }
  const sellSide = head === "sell" || head === "lean_sell";
  let title: string;
  let reason: string;
  if (sellSide) {
    const c = v.candidates.find((x) => sellLeaningCount(x.panel) >= 2) ?? v.candidates[0];
    title = "The analysts lean sell, but no sale is worth chasing yet.";
    // Mirrors cardFor's gates in order, so the reason names the gate that failed.
    const n = c ? sellLeaningCount(c.panel) : 0;
    if (!c) reason = "No player on the roster has a buyer worth pricing.";
    else if (n < 2) reason = `${n === 0 ? "None" : "Only one"} of the three analysts would sell ${c.player.name} on his own.`;
    else if (c.buyers.filter(isShortAt).length === 0) reason = `No team is short at ${c.player.position}, so nobody needs ${c.player.name} enough to pay full value.`;
    else if (Math.round(c.decay.value_now) < 1) reason = `${c.player.name} is worth under 1 value point on our 0 to 100 scale, too little to trade.`;
    else reason = `Selling ${c.player.name} now avoids under ${MIN_CARD_VALUE_KEPT} value points of offseason drop, too little to force a deal.`;
  } else if (head === "split") {
    title = "The analysts split, so hold your roster.";
    reason = "No move gets two of the three analysts behind it.";
  } else {
    title = "Keep your roster: no sale beats holding it.";
    const sellers = v.panel.voices.filter((x) => x.stance === "sell" || x.stance === "lean_sell").length;
    reason =
      sellers === 0
        ? `${keepers} of 3 analysts lean keep; none would sell at today's prices.`
        : `${keepers} of 3 analysts lean keep; ${sellers} would sell but ${sellers === 1 ? "is" : "are"} outvoted.`;
  }
  return {
    ...base,
    priority: (sellSide ? 300 : head === "split" ? 250 : 200) + Math.round(playoffs * 10),
    title,
    stance: head,
    stance_label: STANCE_LABEL[head],
    reason,
    voices,
  };
}

/**
 * Every Tuesday item for one user: trade cards, league shifts (all of them;
 * the first MAX_SHIFT_ROWS are emailed, the rest are app-only) and one week
 * row per league, plus the digest lines.
 */
export function buildDecisionItems(args: { model: TradeDeskModel; season: string }): { items: DecisionItem[]; digest: DecisionDigest } {
  const m = args.model;
  const items: DecisionItem[] = m.cards.map((c, i) => tradeItem(c, i, m, args.season));
  const shifts = allShifts(m, Number.POSITIVE_INFINITY);
  shifts.forEach((s, i) => {
    const move = s.from && s.to ? `${RANGE_LABEL[s.from]} to ${RANGE_LABEL[s.to]}` : `Key injury`;
    items.push({
      id: decisionItemId("shift", args.season, m.resultsWeek, s.leagueId, String(s.roster_id)),
      kind: "shift",
      season: args.season,
      week: m.resultsWeek,
      league_id: s.leagueId,
      league_name: s.league,
      deadline: null,
      deadline_label: null,
      priority: 500 - i,
      title: `${s.manager}: ${move}`,
      delivery: i < MAX_SHIFT_ROWS ? { emailed: true, email: "tuesday_trade_desk" } : { emailed: false },
      manager: s.manager,
      range_from: s.from,
      range_to: s.to,
      cause: s.why,
      for_you: s.role,
    });
  });
  for (const l of m.leagues) items.push(weekRow(l, m, args.season));
  const carded = new Set(m.cards.map((c) => c.leagueId));
  for (const l of m.leagues) {
    if (carded.has(l.leagueId)) continue;
    const call = leagueCall(l, m, args.season);
    if (call) items.push(call);
  }
  const emailedShifts = shifts.slice(0, MAX_SHIFT_ROWS);
  return {
    items,
    digest: {
      kicker: [m.ownerName, `Week ${m.resultsWeek} is in`, `Week ${m.aheadWeek} ahead`].filter(Boolean).join(" · "),
      headline: heroHeadline(m),
      subline: heroSub(m),
      week_summary: m.leagues.length ? weekHeadline(m) : null,
      shifts_summary: emailedShifts.length ? shiftsHeadline(emailedShifts) : null,
    },
  };
}

/** Every user-facing sentence on an item, for the content lint. */
export function itemSentences(item: DecisionItem): string[] {
  const out = [item.title];
  if (item.deadline_label) out.push(item.deadline_label);
  if (item.kind === "trade") {
    out.push(item.kicker, item.verdict, item.if_it_doesnt_land, item.cta_label, ...item.voices.map((v) => v.line));
    for (const st of item.stats) out.push(st.label, st.value, st.sub ?? "");
    if (item.package_note) out.push(item.package_note);
  }
  if (item.kind === "shift") out.push(item.cause);
  if (item.kind === "league_call") out.push(item.stance_label, item.context, item.reason, ...item.voices.map((v) => v.line));
  if (item.kind === "week_row") out.push(item.format_record, item.result ?? "", item.refused_reason ?? "");
  return out.filter(Boolean);
}
