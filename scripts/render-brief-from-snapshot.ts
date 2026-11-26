/**
 * Renders the weekly brief for a captured real-league snapshot, offline.
 * Usage: npx tsx scripts/render-brief-from-snapshot.ts <username> <outDir> [--tier=free|pro]
 * Writes brief.html, brief.txt and leagues.json (the verdict objects).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadRealLeagueSnapshot } from "../evals/fixtures/real-leagues/load";
import { installSnapshotFetch } from "./lib/snapshot-replay";

async function main() {
  const [username, outDir = "render-out"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const tier = (process.argv.find((a) => a.startsWith("--tier="))?.split("=")[1] ?? "pro") as "free" | "pro";
  if (!username) throw new Error("usage: render-brief-from-snapshot.ts <username> <outDir> [--tier=free|pro]");
  const snap = loadRealLeagueSnapshot(username);
  installSnapshotFetch(snap);
  const { buildBriefLeagues, briefOwnerName } = await import("../src/lib/email/build-brief");
  const { composeWeeklyBrief } = await import("../src/lib/email/weekly-brief");
  const ns = snap.nfl_state as { season: string; week: number; season_type: string; season_start_date?: string };
  // Render as of the capture time, so the week logic sees the same clock.
  const now = new Date(snap.captured_at);
  const { leagues, resultsWeek } = await buildBriefLeagues({
    username, season: ns.season, nflWeek: ns.week, seasonType: ns.season_type, logTag: "render", now,
  });
  // --leagues=Name1,Name2 renders a subset (e.g. only closed leagues for the 0-trades case).
  const only = process.argv.find((a) => a.startsWith("--leagues="))?.split("=")[1]?.split(",");
  const shown = only ? leagues.filter((l) => only.some((n) => l.leagueName.startsWith(n))) : leagues;
  const brief = composeWeeklyBrief({
    ownerName: briefOwnerName(snap.user.display_name, snap.user.username),
    sleeperUsername: snap.user.username,
    tier, leagues: shown, resultsWeek, nflWeek: ns.week, seasonStartDate: ns.season_start_date, season: ns.season,
    appUrl: "https://dynastygeneral.app",
    unsubscribeUrl: "https://dynastygeneral.app/api/email/unsubscribe?preview=1",
    mailingAddress: "1 Sample Street, Chicago, IL (sample render)",
    sendDate: now,
    preview: true,
  });
  mkdirSync(outDir, { recursive: true });
  const tag = only ? `_${only.length}lg` : "";
  writeFileSync(join(outDir, `brief_${tier}${tag}.html`), brief.html);
  writeFileSync(join(outDir, `brief_${tier}${tag}.txt`), `Subject: ${brief.subject}\n\n${brief.text}`);
  writeFileSync(join(outDir, `items_${tier}${tag}.json`), JSON.stringify({ digest: brief.digest, items: brief.items }, null, 2));
  writeFileSync(join(outDir, "leagues.json"), JSON.stringify(leagues, null, 2));
  console.log(`lint: ${brief.lint.length ? brief.lint.join(" | ") : "clean"}`);
  console.log(`rendered ${leagues.length} leagues (results week ${resultsWeek}) to ${outDir}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
