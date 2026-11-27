/**
 * Emailed trade lifecycle on the committed real-league snapshot.
 *
 *   npx tsx --tsconfig tsconfig.json evals/emailed-trade-real-league.test.ts
 *
 * Builds the weekly brief for every real-league user at capture time, saves
 * its trade items the way the cron does, then rebuilds one minute past each
 * trade-by time. Before the deadline the overlay must show the emailed trade;
 * after it the league's call must say the window closed, never a drop-size
 * reason with a number that contradicts the email (design-qa, PR #161).
 */

import { listRealLeagueSnapshots, loadRealLeagueSnapshot } from "./fixtures/real-leagues/load";
import { installSnapshotFetch } from "../scripts/lib/snapshot-replay";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` (${detail})` : ""}`);
}

async function main() {
  const origWarn = console.warn;
  const origLog = console.log;
  const origError = console.error;
  console.warn = () => {};
  console.error = () => {};
  const { buildBriefLeagues, briefOwnerName } = await import("../src/lib/email/build-brief");
  const { composeWeeklyBrief } = await import("../src/lib/email/weekly-brief");
  const { overlayEmailedTrades, emailedTradeRows } = await import("../src/lib/decisions/emailed");
  type TradeItem = import("../src/lib/decisions/items").TradeItem;
  type LeagueCallItem = import("../src/lib/decisions/items").LeagueCallItem;
  let sawTrade = 0;
  for (const username of listRealLeagueSnapshots()) {
    const snap = loadRealLeagueSnapshot(username);
    const restore = installSnapshotFetch(snap);
    const ns = snap.nfl_state as { season: string; week: number; season_type: string; season_start_date?: string };
    const now = new Date(snap.captured_at);
    console.log = () => {};
    const { leagues, resultsWeek } = await buildBriefLeagues({ username, season: ns.season, nflWeek: ns.week, seasonType: ns.season_type, logTag: "eval", now });
    console.log = origLog;
    const compose = (at: Date) =>
      composeWeeklyBrief({
        ownerName: briefOwnerName(snap.user.display_name, snap.user.username),
        sleeperUsername: snap.user.username,
        tier: "pro", leagues, resultsWeek, nflWeek: ns.week, seasonStartDate: ns.season_start_date, season: ns.season,
        appUrl: "https://dynastygeneral.app", unsubscribeUrl: "https://dynastygeneral.app/u", mailingAddress: "1 Sample Street (eval)",
        sendDate: at, preview: true,
      });
    const brief = compose(now);
    const saved = emailedTradeRows({ userId: "u", items: brief.items, templateVersion: "eval", sendMode: "preview", sentAt: now }).map((r) => r.item as TradeItem);
    console.log(`\n${username}: ${saved.length} emailed trade(s)`);
    for (const t of saved) {
      if (!t.deadline) continue;
      sawTrade++;
      const before = new Date(new Date(t.deadline).getTime() - 60_000);
      const o1 = overlayEmailedTrades({ items: compose(before).items, digest: brief.digest, emailed: saved, now: before });
      check(`${t.league_name}: emailed trade shows before trade-by`, o1.items.some((i) => i.kind === "trade" && i.id === t.id));
      const after = new Date(new Date(t.deadline).getTime() + 60_000);
      const rebuilt = compose(after);
      const o2 = overlayEmailedTrades({ items: rebuilt.items, digest: rebuilt.digest, emailed: saved, now: after });
      check(`${t.league_name}: no trade card after trade-by`, !o2.items.some((i) => i.kind === "trade" && i.league_id === t.league_id));
      const emailedLeagues = new Set(saved.map((x) => x.league_id));
      const stray = o2.items.filter((i): i is LeagueCallItem => i.kind === "league_call" && i.reason.includes("has passed") && !emailedLeagues.has(i.league_id));
      check(`${t.league_name}: no league without a trade says the trade is off`, stray.length === 0, stray.map((x) => x.league_name).join(", "));
      const lc = o2.items.find((i): i is LeagueCallItem => i.kind === "league_call" && i.league_id === t.league_id);
      if (lc && lc.stance && (lc.stance === "sell" || lc.stance === "lean_sell")) {
        check(`${t.league_name}: call says the window closed`, lc.reason.includes("has passed"), lc.reason);
        check(`${t.league_name}: call states no drop-size number`, !/value point/.test(lc.reason), lc.reason);
      }
    }
    restore();
  }
  console.warn = origWarn;
  console.error = origError;
  check("at least one real league emailed a trade", sawTrade > 0, `${sawTrade}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
