/**
 * The Tuesday Trade Desk model: what the email says, decided once, before
 * any HTML. The renderer only lays it out; the content lint reads it.
 * Every decision appears once (Isaiah, 2026-11-25: no abbreviated preview
 * of a card higher up).
 *
 * A trade card exists only when (BUILD_SPEC PR 1, section 3):
 *   - the league's trade window is open (trade_window canonical),
 *   - at least 2 of the 3 analysts lean sell on THIS player (the
 *     candidate's own panel; it is a recommendation to TRY, so a split
 *     panel is not a card),
 *   - a buyer is genuinely short at the position (startable at or below
 *     starter need from rankBuyers' inputs), and
 *   - every value on the card rounds to at least 1.
 */

import type { ContendOrSellVerdict, SellCandidate } from "@/lib/strategy/verdict/compose";
import type { BuyerRead } from "@/lib/strategy/verdict/buyers";
import type { Panel, Stance, VoiceName } from "@/lib/strategy/verdict/voices";
import { DEFAULT_SIMS } from "@/lib/strategy/verdict/season-sim";
import type { LeagueWeek } from "./league-week";
import { tradeBy, type TradeBy } from "./deadline";

export type LeagueKind = "dynasty" | "keeper" | "redraft" | "best_ball";
export type BriefTier = "free" | "pro";

export interface DeskLeague {
  leagueId: string;
  leagueName: string;
  kind: LeagueKind;
  verdict: ContendOrSellVerdict | null;
  week: LeagueWeek | null;
  /** Why the league has no verdict / no week (shown, never hidden). */
  note?: string;
}

export const MAX_CARDS = 3;
const SELL_LEANING: Stance[] = ["sell", "lean_sell"];

export interface TradeCard {
  leagueId: string;
  leagueName: string;
  deadlineWeek: number | null;
  /** The safe moment to trade by (first kickoff of the deadline week). */
  tradeBy: TradeBy | null;
  sellLeaning: number;
  /** One player per card (desk1 review); other package pieces live in the app. */
  lead: SellCandidate;
  /** The analysts on selling this player alone. */
  panel: Panel;
  buyer: BuyerRead;
  fallbackBuyers: BuyerRead[];
  verdict: ContendOrSellVerdict;
}

/** A buyer the email may name: short at the position, not merely deep. */
export function isShortAt(b: BuyerRead): boolean {
  return b.startable_at_pos <= b.starters_at_pos;
}

export function sellLeaningCount(p: Panel): number {
  return p.voices.filter((x) => SELL_LEANING.includes(x.stance)).length;
}

function cardFor(l: DeskLeague, seasonStartDate: string | null | undefined): TradeCard | null {
  const v = l.verdict;
  if (!v || !v.trade_window.open) return null;
  for (const c of v.candidates) {
    const n = sellLeaningCount(c.panel);
    if (n < 2) continue;
    const buyers = c.buyers.filter(isShortAt);
    if (buyers.length === 0) continue;
    if (Math.round(c.decay.value_now) < 1 || Math.round(c.decay.value_lost) < 1) continue;
    return {
      leagueId: l.leagueId,
      leagueName: l.leagueName,
      deadlineWeek: v.trade_window.deadline_week,
      tradeBy: tradeBy(v.trade_window.deadline_week, seasonStartDate),
      sellLeaning: n,
      lead: c,
      panel: c.panel,
      buyer: buyers[0],
      fallbackBuyers: buyers.slice(1, 3),
      verdict: v,
    };
  }
  return null;
}

export interface TradeDeskModel {
  ownerName: string;
  tier: BriefTier;
  resultsWeek: number;
  aheadWeek: number;
  /** Simulated seasons per league, read from the simulator constant. */
  sims: number;
  cards: TradeCard[];
  leagues: DeskLeague[];
  recsByLeague: Record<string, number>;
  record: { wins: number; losses: number; ties: number };
  rose: number;
  fell: number;
}

export function buildTradeDeskModel(args: {
  ownerName: string;
  tier: BriefTier;
  resultsWeek: number;
  leagues: DeskLeague[];
  /** nfl_state.season_start_date, for the trade-by day. */
  seasonStartDate?: string | null;
}): TradeDeskModel {
  const cards = args.leagues
    .map((l) => cardFor(l, args.seasonStartDate))
    .filter((c): c is TradeCard => c != null)
    .sort(
      (a, b) =>
        (a.deadlineWeek ?? 99) - (b.deadlineWeek ?? 99) ||
        b.lead.decay.value_lost - a.lead.decay.value_lost,
    )
    .slice(0, MAX_CARDS);
  const recsByLeague: Record<string, number> = {};
  for (const c of cards) recsByLeague[c.leagueId] = (recsByLeague[c.leagueId] ?? 0) + 1;

  const record = { wins: 0, losses: 0, ties: 0 };
  let rose = 0;
  let fell = 0;
  for (const l of args.leagues) {
    const r = l.week?.result;
    if (r?.kind === "h2h") {
      if (r.won === true) record.wins++;
      else if (r.won === false) record.losses++;
      else record.ties++;
    }
    const d = playoffDelta(l.week);
    if (d != null && d > 0) rose++;
    if (d != null && d < 0) fell++;
  }
  return {
    ownerName: args.ownerName,
    tier: args.tier,
    resultsWeek: args.resultsWeek,
    aheadWeek: args.resultsWeek + 1,
    sims: DEFAULT_SIMS,
    cards,
    leagues: args.leagues,
    recsByLeague,
    record,
    rose,
    fell,
  };
}

/** Change in the PRINTED playoff chance (rounded to 5), so the arrow never
 * disagrees with the two numbers a reader can see. */
export function playoffDelta(w: LeagueWeek | null | undefined): number | null {
  if (!w || w.playoff_now == null || w.playoff_before == null) return null;
  return round5(w.playoff_now) - round5(w.playoff_before);
}
export function round5(p: number): number {
  return Math.round((p * 100) / 5) * 5;
}

export const VOICE_NAME: Record<VoiceName, string> = {
  strategist: "Strategist",
  moneyball: "Moneyballer",
  gambler: "Gambler",
};
export const VOICE_COLOR: Record<VoiceName, string> = {
  strategist: "#7C5CC4",
  moneyball: "#2A6FB8",
  gambler: "#C76A12",
};
/** Scale stops, left to right. Index = position on the five-stop scale. */
export const STANCE_STOP: Record<Stance, number> = { sell: 0, lean_sell: 1, split: 2, lean_push: 3, push: 4 };
export const STANCE_LABEL: Record<Stance, string> = {
  sell: "Sell now",
  lean_sell: "Lean sell",
  split: "Split",
  lean_push: "Lean keep",
  push: "Keep going",
};
