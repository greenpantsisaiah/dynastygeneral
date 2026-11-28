/**
 * Renders the app's decision surfaces from the committed real-league
 * snapshot, offline (cloud sessions cannot reach Sleeper): the /home feed
 * and the league page's "This week's call" trade card, at three moments:
 *   - live: the feed as rebuilt from the snapshot,
 *   - emailed: the email's trade shown as emailed (overlay), with the live
 *     rebuild forced to a different buyer, to prove the app keeps the email's,
 *   - after the trade-by time: the trade gone in the app.
 * Plus the no-leagues email. Static HTML with the built app CSS.
 *
 * With --games=<nflverse games.csv>, also renders /home on the weekend
 * after the trade-by time, with the week's lineup panel leading
 * (home_weekend_lineups.html), at --lineups-now (default Sunday 10 AM CT).
 *
 * Usage: npx tsx scripts/render-app-from-snapshot.tsx <username> <outDir> [--css=path] [--games=path] [--lineups-now=ISO]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
(globalThis as { React?: unknown }).React = React;
import { loadRealLeagueSnapshot } from "../evals/fixtures/real-leagues/load";
import { installSnapshotFetch } from "./lib/snapshot-replay";

async function main() {
  const [username, outDir = "render-out"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const cssPath = process.argv.find((a) => a.startsWith("--css="))?.split("=")[1];
  const snap = loadRealLeagueSnapshot(username);
  installSnapshotFetch(snap);
  const { buildBriefLeagues, briefOwnerName } = await import("../src/lib/email/build-brief");
  const { composeWeeklyBrief } = await import("../src/lib/email/weekly-brief");
  const { overlayEmailedTrades, emailedTradeRows } = await import("../src/lib/decisions/emailed");
  const { forLeaguePage } = await import("../src/lib/decisions/league-decision");
  const { DecisionHome, TradeCard } = await import("../src/components/home/decision-feed");
  type TradeItem = import("../src/lib/decisions/items").TradeItem;
  const ns = snap.nfl_state as { season: string; week: number; season_type: string; season_start_date?: string };
  const now = new Date(snap.captured_at);
  const { leagues, resultsWeek } = await buildBriefLeagues({ username, season: ns.season, nflWeek: ns.week, seasonType: ns.season_type, logTag: "render-app", now });
  const compose = (ls: typeof leagues, at: Date) =>
    composeWeeklyBrief({
      ownerName: briefOwnerName(snap.user.display_name, snap.user.username),
      sleeperUsername: snap.user.username,
      tier: "pro", leagues: ls, resultsWeek, nflWeek: ns.week, seasonStartDate: ns.season_start_date, season: ns.season,
      appUrl: "https://dynastygeneral.app", unsubscribeUrl: "https://dynastygeneral.app/u", mailingAddress: "1 Sample Street, Chicago, IL (sample render)",
      sendDate: at, preview: true,
    });
  const brief = compose(leagues, now);
  const saved = emailedTradeRows({ userId: "u", items: brief.items, templateVersion: "render", sendMode: "preview", sentAt: now }).map((r) => r.item as TradeItem);
  const css = cssPath ? readFileSync(cssPath, "utf8") : "";
  const hrefs = {
    offer: (t: TradeItem) => `/leagues/${t.league_id}/trade`,
    coach: (t: TradeItem) => `/leagues/${t.league_id}/coach`,
    sleeper: () => "https://sleeper.com",
    league: (id: string) => `/leagues/${id}`,
    item: (i: { id: string }) => `/home?item=${encodeURIComponent(i.id)}`,
    allLeagues: "/leagues",
  };
  const page = (title: string, body: string) =>
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style></head><body class="bg-background text-foreground"><main class="mx-auto max-w-3xl p-4">${body}</main></body></html>`;
  mkdirSync(outDir, { recursive: true });

  // 1. /home live.
  writeFileSync(join(outDir, "home_live.html"), page("home live", renderToStaticMarkup(<DecisionHome digest={brief.digest} items={brief.items} focusId={null} hrefs={hrefs} />)));
  // 2. /home hours later: the live rebuild names someone else; the emailed trade wins.
  const drifted = brief.items.map((i) => (i.kind === "trade" ? { ...i, manager: "Revolver420", title: i.title.replace(/to \S+,/, "to Revolver420,"), verdict: "(live rebuild, different buyer)" } : i));
  const later = new Date(now.getTime() + 4 * 3_600_000);
  const o = overlayEmailedTrades({ items: drifted, digest: brief.digest, emailed: saved, now: later });
  writeFileSync(join(outDir, "home_emailed.html"), page("home emailed", renderToStaticMarkup(<DecisionHome digest={o.digest} items={o.items} focusId={saved[0]?.id ?? null} hrefs={hrefs} />)));
  // 3. League page card (same emailed item).
  if (saved[0]) {
    const card = forLeaguePage(saved[0]);
    writeFileSync(join(outDir, "league_card.html"), page("league card", `<h2 class="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2">This week&apos;s call</h2>${renderToStaticMarkup(<TradeCard item={card} open={false} focused={false} offerHref="#" coachHref="#" />)}`));
  }
  // 4. After the trade-by time: gone from email-built items and from the overlay.
  const deadline = saved[0]?.deadline ? new Date(new Date(saved[0].deadline).getTime() + 60_000) : later;
  const after = compose(leagues, deadline);
  const o2 = overlayEmailedTrades({ items: after.items, digest: after.digest, emailed: saved, now: deadline });
  writeFileSync(join(outDir, "home_after_deadline.html"), page("home after deadline", renderToStaticMarkup(<DecisionHome digest={o2.digest} items={o2.items} focusId={null} hrefs={hrefs} />)));
  // 4b. The weekend: trade window closed, this week's lineups lead the page.
  const gamesPath = process.argv.find((a) => a.startsWith("--games="))?.split("=")[1];
  if (gamesPath) {
    const { parseNflSchedule } = await import("../src/lib/email/game-day/schedule");
    const { loadLineupPanel } = await import("../src/lib/email/game-day/load");
    const { buildLineupDesk } = await import("../src/lib/email/game-day/panel");
    const sunday = new Date(process.argv.find((a) => a.startsWith("--lineups-now="))?.split("=")[1] ?? "2026-11-29T16:00:00Z");
    const schedule = parseNflSchedule(readFileSync(gamesPath, "utf8"), ns.season, ns.week);
    const res = await loadLineupPanel({ username, season: ns.season, week: ns.week, now: sunday, schedule, logTag: "render-app" });
    if ("error" in res) throw new Error(res.error);
    const { leagues: withChar } = await buildBriefLeagues({ username, season: ns.season, nflWeek: ns.week, seasonType: ns.season_type, logTag: "render-app", now, withCharacter: true });
    const { teamTile } = await import("../src/lib/decisions/character");
    const teams = withChar.flatMap((l) => {
      const t = l.character ? teamTile(l.leagueId, l.leagueName, l.character) : null;
      return t ? [t] : [];
    }).sort((a, b) => b.order - a.order);
    const wk = compose(leagues, sunday);
    const o3 = overlayEmailedTrades({ items: wk.items, digest: wk.digest, emailed: saved, now: sunday });
    writeFileSync(join(outDir, "home_weekend_lineups.html"), page("home weekend", renderToStaticMarkup(<DecisionHome digest={o3.digest} items={o3.items} focusId={null} hrefs={hrefs} lineups={buildLineupDesk(res.panel)} teams={teams} />)));
  }
  // 5. No leagues (email).
  const none = compose([], now);
  writeFileSync(join(outDir, "brief_no_leagues.html"), none.html);
  writeFileSync(join(outDir, "brief_no_leagues.txt"), none.text);
  console.log(`trades live ${brief.items.filter((i) => i.kind === "trade").length}, emailed overlay ${o.items.filter((i) => i.kind === "trade").length}, after deadline ${o2.items.filter((i) => i.kind === "trade").length}; no-leagues lint ${none.lint.length ? none.lint.join("|") : "clean"}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
