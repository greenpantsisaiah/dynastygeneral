/**
 * Median-game leagues in the season simulator (Sleeper league_average_match).
 *
 *   npx tsx --tsconfig tsconfig.json evals/median-game.test.ts
 *
 * Why (2026-11-26): in "Smells like jabroni spirit" (best ball, median game
 * on) the league page showed Sleeper's 11-11 while /home and the email
 * showed 5-6, and playoff odds were simulated on head-to-head games only,
 * ignoring half the decisions that seed the playoffs. Ground truth here is
 * Sleeper's own roster.settings.wins / losses from the committed snapshot.
 */

import { loadRealLeagueSnapshot } from "./fixtures/real-leagues/load";
import { buildSimInputFromSleeper, medianResults } from "../src/lib/strategy/verdict/from-sleeper";
import { simulateSeason } from "../src/lib/strategy/verdict/season-sim";
import { playoffSettings } from "../src/lib/strategy/verdict/load";
import type { SleeperLeague, SleeperMatchup } from "../src/lib/sleeper/schemas";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` (${detail})` : ""}`);
}

const snap = loadRealLeagueSnapshot("izzydabomb", { allowStale: true });
const entry = snap.leagues.find((l) => l.league.name === "Smells like jabroni spirit");
if (!entry) throw new Error("jabroni league missing from snapshot");
const league = entry.league as unknown as SleeperLeague;
const settings = league.settings as Record<string, number>;
const resultsWeek = settings.last_scored_leg;
const matchupsByWeek: Record<number, SleeperMatchup[]> = {};
for (const [w, rows] of Object.entries(entry.matchups)) matchupsByWeek[Number(w)] = rows as unknown as SleeperMatchup[];
const rosters = entry.rosters as Array<{ roster_id: number; owner_id: string | null; settings: Record<string, number> }>;
const ids = rosters.map((r) => r.roster_id);
const myId = rosters.find((r) => r.owner_id === snap.user.user_id)?.roster_id ?? -1;
const ps = playoffSettings(league);

console.log("── medianResults ──");
{
  const r = medianResults(new Map([[1, 100], [2, 90], [3, 80], [4, 70]]));
  check("top half wins, bottom half loses", r.get(1) === "W" && r.get(2) === "W" && r.get(3) === "L" && r.get(4) === "L");
  const odd = medianResults(new Map([[1, 100], [2, 90], [3, 80]]));
  check("odd field: the median score ties", odd.get(2) === "T" && odd.get(1) === "W" && odd.get(3) === "L");
}

console.log("── settings ──");
check("league_average_match read as medianGame", ps.medianGame === true);
check("a league without it reads false", playoffSettings({ ...league, settings: { ...settings, league_average_match: 0 } } as SleeperLeague).medianGame === false);

const args = { rosterIds: ids, matchupsByWeek, firstUnplayedWeek: resultsWeek + 1, playoffWeekStart: ps.playoffWeekStart, playoffTeams: ps.playoffTeams };
const h2h = buildSimInputFromSleeper(args);
const withMedian = buildSimInputFromSleeper({ ...args, medianGame: true });

console.log("── records match Sleeper's standings ──");
let mismatches = 0;
for (const r of rosters) {
  const t = withMedian.teams.find((x) => x.roster_id === r.roster_id)!;
  if (t.wins !== r.settings.wins || t.losses !== r.settings.losses) {
    mismatches++;
    console.log(`    roster ${r.roster_id}: built ${t.wins}-${t.losses}, Sleeper ${r.settings.wins}-${r.settings.losses}`);
  }
}
check("every roster's record equals Sleeper settings.wins/losses", mismatches === 0, `${mismatches} mismatches of ${rosters.length}`);
const meH2h = h2h.teams.find((t) => t.roster_id === myId)!;
const meMed = withMedian.teams.find((t) => t.roster_id === myId)!;
check("my record reads 11-11 with the median game", meMed.wins === 11 && meMed.losses === 11, `${meMed.wins}-${meMed.losses}`);
check("head-to-head only reads 5-6 (the old bug)", meH2h.wins === 5 && meH2h.losses === 6, `${meH2h.wins}-${meH2h.losses}`);

console.log("── simulator plays the median in remaining weeks ──");
const before = simulateSeason(h2h, { seed: 7 });
const after = simulateSeason(withMedian, { seed: 7 });
if (!before.ok || !after.ok) throw new Error("simulator declined");
const weeks = after.model.weeks_remaining;
const added = (sim: typeof after, input: typeof withMedian) =>
  input.teams.reduce((s, t) => s + sim.odds[t.roster_id].mean_wins - (t.wins + t.ties * 0.5), 0);
const n = ids.length;
check("median off: league adds n/2 wins per remaining week", Math.abs(added(before, h2h) - (n / 2) * weeks) < 1e-6, added(before, h2h).toFixed(2));
check("median on: league adds n wins per remaining week", Math.abs(added(after, withMedian) - n * weeks) < 1e-6, added(after, withMedian).toFixed(2));
check("model reports median_game", after.model.median_game === true && before.model.median_game === false);
const sumPlayoff = Object.values(after.odds).reduce((s, o) => s + o.playoff_pct, 0);
check("playoff odds still sum to the field size", Math.abs(sumPlayoff - ps.playoffTeams) < 1e-9, sumPlayoff.toFixed(3));

console.log("\n── before / after (real data, seed 7) ──");
for (const id of ids) {
  const b = before.odds[id];
  const a = after.odds[id];
  const t = withMedian.teams.find((x) => x.roster_id === id)!;
  console.log(
    `  roster ${String(id).padStart(2)}${id === myId ? " (me)" : "     "} ${t.wins}-${t.losses}  playoff ${(b.playoff_pct * 100).toFixed(1)}% -> ${(a.playoff_pct * 100).toFixed(1)}%  title ${(b.title_pct * 100).toFixed(1)}% -> ${(a.title_pct * 100).toFixed(1)}%`,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
