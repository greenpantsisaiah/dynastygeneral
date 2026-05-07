/**
 * Per-opponent trade-history fingerprint regression.
 *
 *   npx tsx --tsconfig tsconfig.json evals/opponent-trade-history.test.ts
 *
 * Locks the four-signature classifier (pick_flipper, pick_hoarder,
 * pick_seller, pick_quiet) and the future-vs-current breakdown derived
 * from snapshot.draft.traded_picks. Per memory project_coach_trade_creativity
 * architectural extension 5: this is the joeboch fingerprint Coach was
 * blind to in the 2026-05-08 izzydabomb session.
 */

import { buildOpponentTradeHistory } from "../src/lib/strategy/opponents/trade-history";
import type { TradedPick } from "../src/lib/sleeper/draft-state";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`);
  }
}

const SEASON = "2026";

function tp(season: string, round: number, original: number, current: number): TradedPick {
  return { season, round, original_owner: original, current_owner: current };
}

function run() {
  console.log("\n── 1. pick_flipper: high two-way volume, ~zero net ──");
  {
    // Joeboch fingerprint: sent 3 picks, received 3 picks. Net 0,
    // total volume 6 ≥ 4. Should classify as flipper.
    const tradedPicks: TradedPick[] = [
      tp("2026", 6, 5, 1),  // 5 sent
      tp("2026", 7, 5, 2),  // 5 sent
      tp("2026", 8, 5, 3),  // 5 sent
      tp("2027", 1, 1, 5),  // 5 received
      tp("2027", 2, 2, 5),  // 5 received
      tp("2027", 3, 3, 5),  // 5 received
    ];
    const h = buildOpponentTradeHistory({ rosterId: 5, tradedPicks, currentSeason: SEASON });
    check("signature is pick_flipper", h.signature === "pick_flipper", `actual: ${h.signature}`);
    check("picks_sent = 3", h.picks_sent === 3, `actual: ${h.picks_sent}`);
    check("picks_received = 3", h.picks_received === 3, `actual: ${h.picks_received}`);
    check("net_picks = 0", h.net_picks === 0, `actual: ${h.net_picks}`);
    check("future_picks_received counts only future seasons", h.future_picks_received === 3, `actual: ${h.future_picks_received}`);
    check("current_picks_sent counts only current season", h.current_picks_sent === 3, `actual: ${h.current_picks_sent}`);
  }

  console.log("\n── 2. pick_hoarder: net positive ≥ 2 ──");
  {
    const tradedPicks: TradedPick[] = [
      tp("2027", 1, 1, 5),
      tp("2027", 2, 2, 5),
      tp("2027", 3, 3, 5),
      tp("2026", 8, 5, 1), // one sent
    ];
    const h = buildOpponentTradeHistory({ rosterId: 5, tradedPicks, currentSeason: SEASON });
    check("signature is pick_hoarder", h.signature === "pick_hoarder", `actual: ${h.signature}`);
    check("net_picks = +2", h.net_picks === 2, `actual: ${h.net_picks}`);
  }

  console.log("\n── 3. pick_seller: net negative ≥ 2 ──");
  {
    const tradedPicks: TradedPick[] = [
      tp("2026", 5, 5, 1),
      tp("2026", 6, 5, 2),
      tp("2026", 7, 5, 3),
      tp("2027", 1, 1, 5), // one received
    ];
    const h = buildOpponentTradeHistory({ rosterId: 5, tradedPicks, currentSeason: SEASON });
    check("signature is pick_seller", h.signature === "pick_seller", `actual: ${h.signature}`);
    check("net_picks = -2", h.net_picks === -2, `actual: ${h.net_picks}`);
    check("current_picks_sent = 3", h.current_picks_sent === 3, `actual: ${h.current_picks_sent}`);
    check("future_picks_received = 1", h.future_picks_received === 1, `actual: ${h.future_picks_received}`);
  }

  console.log("\n── 4. pick_quiet: low volume ──");
  {
    const tradedPicks: TradedPick[] = [
      tp("2026", 8, 5, 1), // single trade, that's it
    ];
    const h = buildOpponentTradeHistory({ rosterId: 5, tradedPicks, currentSeason: SEASON });
    check("signature is pick_quiet", h.signature === "pick_quiet", `actual: ${h.signature}`);
  }

  console.log("\n── 5. Empty traded_picks: pick_quiet, zero counts ──");
  {
    const h = buildOpponentTradeHistory({ rosterId: 5, tradedPicks: [], currentSeason: SEASON });
    check("signature is pick_quiet", h.signature === "pick_quiet", `actual: ${h.signature}`);
    check("picks_sent = 0", h.picks_sent === 0);
    check("picks_received = 0", h.picks_received === 0);
    check("summary mentions no pick trades", h.summary.includes("No pick trades"), `summary: ${h.summary}`);
  }

  console.log("\n── 6. Untraded picks (original === current) ignored ──");
  {
    // Sleeper sometimes returns rows for untraded picks (when they were
    // touched but never moved). These should NOT count.
    const tradedPicks: TradedPick[] = [
      tp("2026", 1, 5, 5), // same → ignore
      tp("2027", 2, 5, 5), // same → ignore
      tp("2026", 6, 5, 1), // real send
    ];
    const h = buildOpponentTradeHistory({ rosterId: 5, tradedPicks, currentSeason: SEASON });
    check("untraded rows excluded; only real flow counts", h.picks_sent === 1 && h.picks_received === 0);
  }

  console.log("\n── 7. Future-pick punt summary text ──");
  {
    // Punted future capital for current production: 2 future sent, 2
    // current received.
    const tradedPicks: TradedPick[] = [
      tp("2027", 1, 5, 1),
      tp("2027", 2, 5, 2),
      tp("2026", 6, 1, 5),
      tp("2026", 7, 2, 5),
    ];
    const h = buildOpponentTradeHistory({ rosterId: 5, tradedPicks, currentSeason: SEASON });
    check("flipper signature on equal-volume punt", h.signature === "pick_flipper", `actual: ${h.signature}`);
    check("summary includes 'Punted future'", h.summary.includes("Punted future"), `summary: ${h.summary}`);
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
