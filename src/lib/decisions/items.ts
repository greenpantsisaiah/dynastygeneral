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
 * Types only for now. The builder lands with the Trade Desk email (PR 1 of
 * the weekly brief v2 build spec); /home renders the same list.
 */

import type { Stance, VoiceName } from "@/lib/strategy/verdict/voices";

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
  | "week_row";

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

export type DecisionItem = TradeItem | ShiftItem | SwingItem | LineupItem | RootForItem | WeekRowItem;

/** Stable item id; the email link and the home anchor both use it. */
export function decisionItemId(kind: DecisionKind, season: string, week: number, leagueId: string | null, subject: string): string {
  return `${kind}:${season}w${week}:${leagueId ?? "all"}:${subject}`;
}

/** Deep link from an email to the item on the home. */
export function decisionItemHref(appUrl: string, id: string): string {
  return `${appUrl.replace(/\/$/, "")}/home?item=${encodeURIComponent(id)}`;
}
