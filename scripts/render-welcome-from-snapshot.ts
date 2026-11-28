/**
 * Renders the welcome brief for a captured real-league snapshot, offline.
 * Usage: npx tsx scripts/render-welcome-from-snapshot.ts <username> <outDir> [--no-trade]
 * Writes welcome_<username>.html and .txt. --no-trade renders the case where
 * every trade-by time has passed (no first move), as production does later in the week.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadRealLeagueSnapshot } from "../evals/fixtures/real-leagues/load";
import { installSnapshotFetch } from "./lib/snapshot-replay";

async function main() {
  const args = process.argv.slice(2);
  const noTrade = args.includes("--no-trade");
  const [username, outDir = "render-out"] = args.filter((a) => !a.startsWith("--"));
  if (!username) throw new Error("usage: render-welcome-from-snapshot.ts <username> <outDir> [--no-trade]");
  const snap = loadRealLeagueSnapshot(username, { allowStale: true });
  installSnapshotFetch(snap);
  const { buildWelcomeBrief } = await import("../src/lib/email/welcome-send");
  const brief = await buildWelcomeBrief({
    username,
    displayName: snap.user.display_name,
    tier: "pro",
    appUrl: "https://dynastygeneral.app",
    unsubscribeUrl: "https://dynastygeneral.app/api/email/unsubscribe?preview=1",
    mailingAddress: "1 Sample Street, Chicago, IL (sample render)",
    logTag: "render",
    now: new Date(snap.captured_at),
    preview: true,
    filterItems: noTrade ? (items) => items.filter((i) => i.kind !== "trade") : undefined,
  });
  if ("error" in brief) throw new Error(brief.error);
  mkdirSync(outDir, { recursive: true });
  const tag = noTrade ? `${username}_notrade` : username;
  writeFileSync(join(outDir, `welcome_${tag}.html`), brief.html);
  writeFileSync(join(outDir, `welcome_${tag}.txt`), `Subject: ${brief.subject}\n\n${brief.text}`);
  console.log(`subject: ${brief.subject}`);
  console.log(`lint: ${brief.lint.length ? brief.lint.join(" | ") : "clean"}`);
  console.log(`${brief.tiles.length} team tiles, first call: ${brief.firstCall?.id ?? "none"}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
