/**
 * Real-league integrity smoke: runs the live hub pipeline over every league
 * in the committed real-league snapshot (evals/fixtures/real-leagues) and
 * fails on any SEVERE engine-integrity issue.
 *
 *   npx tsx --tsconfig tsconfig.json evals/real-league-integrity.test.ts
 *
 * Why (2026-11-26): Isaiah tapped a trade chip in the weekly email and
 * landed on his Europa league page under a red "ENGINE INTEGRITY ISSUE ·
 * POSITION UNKNOWN" banner. Travis Hunter is listed by Sleeper as
 * `position: "DB"` with `fantasy_positions: ["DB", "WR"]`; the engine read
 * only `position`, so a rostered fantasy WR counted as nothing. Every unit
 * test passed because none of them used a real roster. This test runs the
 * same snapshot -> priced pool -> integrity suite the hub runs, against the
 * real leagues our users play in, so that class of bug fails CI instead of
 * reaching a user.
 *
 * Offline: Sleeper + FantasyCalc are replayed from the snapshot
 * (scripts/lib/snapshot-replay.ts). Supabase-backed signals are absent, so
 * the rubric reads market + age only (same as evals/value-sanity.test.ts).
 * A stale snapshot is allowed here (logged) so CI does not go red on a
 * calendar date; the weekly capture keeps it fresh.
 */

import { loadRealLeagueSnapshot, listRealLeagueSnapshots, isStale } from "./fixtures/real-leagues/load";
import { installSnapshotFetch } from "../scripts/lib/snapshot-replay";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` (${detail})` : ""}`);
}

async function main() {
  // Quiet the pipeline's own console noise (missing Supabase env, etc.) so
  // the test output reads as a checklist. Errors are still captured below.
  const origWarn = console.warn;
  console.warn = () => {};
  const origError = console.error;
  console.error = () => {};

  const { getLeague, getRosters, getLeagueUsers } = await import("../src/lib/sleeper/client");
  const { resolveDraftState } = await import("../src/lib/sleeper/draft-state");
  const { buildLeagueContext } = await import("../src/lib/engine/league-context");
  const { runEngineIntegrityChecks } = await import("../src/lib/players/integrity");

  for (const username of listRealLeagueSnapshots()) {
    const snap = loadRealLeagueSnapshot(username, { allowStale: true });
    if (isStale(snap.captured_at)) console.log(`  (note: ${username} snapshot is stale, captured ${snap.captured_at})`);
    const restore = installSnapshotFetch(snap);
    try {
      for (const entry of snap.leagues) {
        const leagueId = entry.league.league_id;
        const name = `${username} / ${entry.league.name.trim()}`;
        try {
          const [league, rosters, users] = await Promise.all([
            getLeague(leagueId),
            getRosters(leagueId),
            getLeagueUsers(leagueId),
          ]);
          const draftState = await resolveDraftState(leagueId, snap.user.user_id);
          const ctx = await buildLeagueContext({
            league,
            rosters,
            users,
            draftState,
            mySleeperUserId: snap.user.user_id,
          });
          const report = runEngineIntegrityChecks({
            snap: ctx.snapshot,
            available: ctx.pricedPool.available,
            playerValues: ctx.pricedPool.valueMap,
            decision: null,
            rosterPositionsRaw: league.roster_positions ?? [],
            playersFetchedAt: Date.now(),
          });
          const severe = report.issues.filter((i) => i.severity === "severe");
          check(
            `${name}: no severe integrity issue`,
            severe.length === 0,
            severe.map((i) => `${i.kind}: ${i.headline} [${i.evidence}]`).join("; ") || undefined,
          );
        } catch (err) {
          check(`${name}: pipeline runs`, false, err instanceof Error ? `${err.message}\n${err.stack}` : String(err));
        }
      }
    } finally {
      restore();
    }
  }

  console.warn = origWarn;
  console.error = origError;
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
