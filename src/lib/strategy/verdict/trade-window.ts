/**
 * Can the user still make the move the verdict is about? The contend-or-sell
 * verdict is advice to trade, so it is only actionable while trades are
 * open. Best ball leagues have no trades, waivers or lineups; after the
 * trade deadline nobody can buy or sell. Reads the canonical format rules
 * (buildFormatRulesFromSnapshot: best_ball, trade_deadline_week), never
 * re-parses league settings itself.
 *
 * Sleeper's trade_deadline is the last week trades are allowed, so trades
 * are closed once the NFL week is past it. Sleeper stores "no deadline" as
 * a large sentinel (99).
 *
 * Bug class avoided: 2026-11-25 first weekly brief told Isaiah to sell
 * players in a best ball league ("Smells like Jabroni Spirit") where he
 * cannot trade, add or drop anyone.
 */

import type { FormatRules } from "@/lib/engine/llm-contract";

export type TradeWindowClosedReason = "best_ball" | "deadline_passed";

export type TradeWindow =
  | { open: true; deadline_week: number | null }
  | { open: false; reason: TradeWindowClosedReason; deadline_week: number | null; label: string };

/** Sleeper's "no trade deadline" sentinel is 99; anything past week 18 means none. */
const LAST_REAL_WEEK = 18;

export function tradeWindow(
  rules: Pick<FormatRules, "best_ball" | "trade_deadline_week">,
  nflWeek: number | null | undefined,
): TradeWindow {
  const deadline =
    typeof rules.trade_deadline_week === "number" && rules.trade_deadline_week > 0 && rules.trade_deadline_week <= LAST_REAL_WEEK
      ? rules.trade_deadline_week
      : null;
  if (rules.best_ball) {
    return {
      open: false,
      reason: "best_ball",
      deadline_week: deadline,
      label: "Best ball league: no trades, waivers or lineup moves, so there is nothing to buy or sell.",
    };
  }
  if (deadline != null && typeof nflWeek === "number" && nflWeek > deadline) {
    return {
      open: false,
      reason: "deadline_passed",
      deadline_week: deadline,
      label: `Trade deadline passed after week ${deadline}, so there is nothing to buy or sell until the offseason.`,
    };
  }
  return { open: true, deadline_week: deadline };
}
