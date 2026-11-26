/**
 * Renders the Sunday Game Day email (lineup panel slice) for a captured
 * real-league snapshot, offline. Kickoffs come from a local copy of the
 * nflverse games.csv because snapshot replay blocks the network.
 * Usage: npx tsx scripts/render-game-day-from-snapshot.ts <username> <outDir> <games.csv> [--now=ISO]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadRealLeagueSnapshot } from "../evals/fixtures/real-leagues/load";
import { installSnapshotFetch } from "./lib/snapshot-replay";

async function main() {
  const [username, outDir = "render-out", csvPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!username || !csvPath) throw new Error("usage: render-game-day-from-snapshot.ts <username> <outDir> <games.csv> [--now=ISO]");
  const snap = loadRealLeagueSnapshot(username);
  installSnapshotFetch(snap);
  const { parseNflSchedule } = await import("../src/lib/email/game-day/schedule");
  const { loadLineupPanel } = await import("../src/lib/email/game-day/load");
  const { composeGameDayEmail } = await import("../src/lib/email/game-day/email");
  const { briefOwnerName } = await import("../src/lib/email/build-brief");
  const ns = snap.nfl_state as { season: string; week: number };
  // Default clock: the Sunday 10 AM CT send for the captured week.
  const now = new Date(process.argv.find((a) => a.startsWith("--now="))?.split("=")[1] ?? "2026-11-29T16:00:00Z");
  const schedule = parseNflSchedule(readFileSync(csvPath, "utf8"), ns.season, ns.week);
  const res = await loadLineupPanel({ username, season: ns.season, week: ns.week, now, schedule, logTag: "render" });
  if ("error" in res) throw new Error(res.error);
  const email = composeGameDayEmail({
    ownerName: briefOwnerName(snap.user.display_name, snap.user.username),
    panel: res.panel,
    userNames: res.userNames,
    unsubscribeUrl: "https://dynastygeneral.app/api/email/unsubscribe?preview=1",
    mailingAddress: "1 Sample Street, Chicago, IL (sample render)",
    sendDate: now,
    preview: true,
  });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "game_day.html"), email.html);
  writeFileSync(join(outDir, "game_day.txt"), `Subject: ${email.subject}\n\n${email.text}`);
  writeFileSync(join(outDir, "panel.json"), JSON.stringify(res.panel, null, 2));
  console.log(`lint: ${email.lint.length ? email.lint.join(" | ") : "clean"}`);
  console.log(`read ${res.panel.leagues.length} lineups, skipped ${res.panel.skipped.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
