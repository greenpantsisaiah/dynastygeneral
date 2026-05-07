/**
 * Per-opponent trade history derivation.
 *
 * Reads `snapshot.draft.traded_picks` (already populated at snapshot
 * build, no extra Sleeper call) and produces a counterparty fingerprint
 * Coach can use to read opponent psychology in trade construction.
 *
 * Per memory project_coach_trade_creativity.md (architectural extension
 * 5, 2026-05-08): "Sleeper exposes per-roster trade history; Coach
 * today doesn't have it. Behavioral patterns are massively informative:
 * 'joeboch executed 2 trades in 48 hours, both flipping later picks for
 * earlier picks' tells you he treats picks as currency and is win-now-
 * urgent." Today the Coach context lists opponents with position_counts
 * and patterns; it has no view into how those opponents have used their
 * pick capital. This module closes that gap using data already in the
 * snapshot.
 *
 * Future-pick-only because Sleeper's traded_picks endpoint is the
 * cheapest comprehensive source. Player-trade history (via
 * getTransactions per-week) is a separate, more expensive fetch and
 * not included here. A future module can add it as
 * `player_trade_history` on the same opponent slot.
 */

import type { TradedPick } from "@/lib/sleeper/draft-state";

export type TradeSignatureLabel =
  // Sent more picks than received; consistent net out-flow of capital.
  | "pick_seller"
  // Received more picks than sent; net in-flow.
  | "pick_hoarder"
  // High two-way flow (sent AND received many); treats picks as
  // currency. The joeboch fingerprint.
  | "pick_flipper"
  // Net flat or low absolute volume; not a meaningful trader of picks.
  | "pick_quiet";

export type OpponentTradeHistory = {
  roster_id: number;
  // Counts across ALL seasons exposed in traded_picks (current + future).
  // We count picks not trades because Sleeper exposes individual pick
  // movements; one trade can cover multiple picks. Approximating
  // "trade count" from picks would over-count.
  picks_sent: number;
  picks_received: number;
  // Net ownership change. Positive = picks_received > picks_sent.
  net_picks: number;
  // Subset focused on future seasons (>= currentSeasonInt + 1). Useful
  // for separating "punted future for now" from "stockpiled future."
  future_picks_sent: number;
  future_picks_received: number;
  // Subset for the current season specifically.
  current_picks_sent: number;
  current_picks_received: number;
  signature: TradeSignatureLabel;
  // Plain-text human-readable summary. Coach can quote it directly.
  summary: string;
};

const FLIPPER_VOLUME_THRESHOLD = 4;
const ACTIVE_VOLUME_THRESHOLD = 2;

export function buildOpponentTradeHistory(args: {
  rosterId: number;
  tradedPicks: TradedPick[];
  currentSeason: string;
}): OpponentTradeHistory {
  const { rosterId, tradedPicks, currentSeason } = args;
  const currentSeasonInt = Number.parseInt(currentSeason, 10);

  let picksSent = 0;
  let picksReceived = 0;
  let futureSent = 0;
  let futureReceived = 0;
  let currentSent = 0;
  let currentReceived = 0;

  for (const tp of tradedPicks) {
    if (tp.original_owner === tp.current_owner) continue;
    const seasonInt = Number.parseInt(tp.season, 10);
    const isFuture = Number.isFinite(seasonInt) && Number.isFinite(currentSeasonInt) && seasonInt > currentSeasonInt;
    const isCurrent = Number.isFinite(seasonInt) && seasonInt === currentSeasonInt;
    if (tp.original_owner === rosterId) {
      picksSent++;
      if (isFuture) futureSent++;
      if (isCurrent) currentSent++;
    }
    if (tp.current_owner === rosterId) {
      picksReceived++;
      if (isFuture) futureReceived++;
      if (isCurrent) currentReceived++;
    }
  }

  const netPicks = picksReceived - picksSent;
  const totalVolume = picksSent + picksReceived;

  let signature: TradeSignatureLabel;
  if (totalVolume >= FLIPPER_VOLUME_THRESHOLD && Math.abs(netPicks) <= 1) {
    signature = "pick_flipper";
  } else if (totalVolume < ACTIVE_VOLUME_THRESHOLD) {
    signature = "pick_quiet";
  } else if (netPicks >= 2) {
    signature = "pick_hoarder";
  } else if (netPicks <= -2) {
    signature = "pick_seller";
  } else {
    signature = "pick_quiet";
  }

  const summary = composeSummary({
    signature,
    picksSent,
    picksReceived,
    futureSent,
    futureReceived,
    currentSent,
    currentReceived,
  });

  return {
    roster_id: rosterId,
    picks_sent: picksSent,
    picks_received: picksReceived,
    net_picks: netPicks,
    future_picks_sent: futureSent,
    future_picks_received: futureReceived,
    current_picks_sent: currentSent,
    current_picks_received: currentReceived,
    signature,
    summary,
  };
}

function composeSummary(args: {
  signature: TradeSignatureLabel;
  picksSent: number;
  picksReceived: number;
  futureSent: number;
  futureReceived: number;
  currentSent: number;
  currentReceived: number;
}): string {
  const { signature, picksSent, picksReceived, futureSent, futureReceived, currentSent, currentReceived } = args;
  if (signature === "pick_quiet") {
    if (picksSent === 0 && picksReceived === 0) return "No pick trades on file.";
    return `${picksSent} pick${picksSent === 1 ? "" : "s"} sent, ${picksReceived} received. Low volume.`;
  }
  const parts: string[] = [];
  if (signature === "pick_flipper") {
    parts.push(`Pick flipper: ${picksSent} sent and ${picksReceived} received.`);
  } else if (signature === "pick_hoarder") {
    parts.push(`Pick hoarder: net +${picksReceived - picksSent} (${picksReceived} received, ${picksSent} sent).`);
  } else if (signature === "pick_seller") {
    parts.push(`Pick seller: net ${picksReceived - picksSent} (${picksSent} sent, ${picksReceived} received).`);
  }
  if (futureSent > 0 && currentReceived > 0) {
    parts.push(`Punted future capital (${futureSent} future picks sent) for current production (${currentReceived} current picks received).`);
  } else if (futureReceived > 0 && currentSent > 0) {
    parts.push(`Sold current capital (${currentSent} current picks sent) for future (${futureReceived} future picks received).`);
  } else if (futureSent + currentSent > 0 && futureReceived + currentReceived === 0) {
    parts.push(`Net out-flow: ${futureSent + currentSent} picks gone with no replacements.`);
  }
  return parts.join(" ");
}
