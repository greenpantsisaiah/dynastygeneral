/**
 * Opportunity-profile canonical regression.
 *
 *   npx tsx --tsconfig tsconfig.json evals/opportunity-profile.test.ts
 *
 * Locks the Stage 1 "data right" harvest (ARCHITECTURE_UNIFICATION_PLAN.md
 * addendum 2026-05-25): the usage fields already present in the Sleeper
 * /stats feed (snap share, air yards / aDOT, drops, red-zone targets) are
 * parsed by season-stats and turned into the research-defensible
 * opportunity read by buildOpportunityProfile. Fixtures use Adonai
 * Mitchell's real 2025 line (the founder eye-test case) so the derived
 * metrics are checked against ground truth, and the all-null case proves
 * graceful degradation for seasons without usage data.
 */

import {
  buildOpportunityProfile,
  type PlayerSeasonStats,
} from "../src/lib/players/season-stats";

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

const approx = (a: number | null, b: number, eps = 0.01) =>
  a != null && Math.abs(a - b) <= eps;

function run() {
  // Adonai Mitchell, 2025 (real line): 16 gp, 74 tgt, 33 rec, 453 yds,
  // 2 TD, 373 air yds, 2 drops, 7 RZ tgt, ~49.6% snap share.
  const mitchell2025: PlayerSeasonStats = {
    player_id: "11625",
    pts_ppr: 87.9,
    pts_half_ppr: null,
    pts_std: null,
    games_played: 16,
    carries: 0,
    targets: 74,
    receptions: 33,
    rec_yards: 453,
    rec_tds: 2,
    air_yards: 373,
    drops: 2,
    rz_targets: 7,
    off_snaps: 496,
    team_off_snaps: 1000,
  };
  const p = buildOpportunityProfile(mitchell2025);

  check("snap_share = off/team snaps", approx(p.snap_share, 0.496), `${p.snap_share}`);
  check("targets_per_game = 74/16", approx(p.targets_per_game, 4.625), `${p.targets_per_game}`);
  check("adot = air_yards/targets", approx(p.adot, 373 / 74), `${p.adot}`);
  check("drop_rate = drops/targets", approx(p.drop_rate, 2 / 74), `${p.drop_rate}`);
  check("rz_targets_per_game = 7/16", approx(p.rz_targets_per_game, 7 / 16), `${p.rz_targets_per_game}`);
  check("snap_share clamps within 0-1", (p.snap_share ?? 0) >= 0 && (p.snap_share ?? 0) <= 1, `${p.snap_share}`);

  // Graceful degradation: a season with no usage fields (older Sleeper
  // data) yields all-null, never NaN or a thrown error.
  const noUsage: PlayerSeasonStats = {
    player_id: "x",
    pts_ppr: 50,
    pts_half_ppr: null,
    pts_std: null,
    games_played: 10,
    carries: null,
    targets: null,
    receptions: null,
    rec_yards: null,
    rec_tds: null,
    air_yards: null,
    drops: null,
    rz_targets: null,
    off_snaps: null,
    team_off_snaps: null,
  };
  const e = buildOpportunityProfile(noUsage);
  check(
    "all-null usage degrades to null metrics (no NaN)",
    e.snap_share === null &&
      e.targets_per_game === null &&
      e.adot === null &&
      e.drop_rate === null &&
      e.rz_targets_per_game === null,
    JSON.stringify(e),
  );

  // Undefined stats (player absent that season) is also graceful.
  const u = buildOpportunityProfile(undefined);
  check("undefined stats degrades to null metrics", u.snap_share === null && u.targets === null);

  // Zero team snaps must not divide-by-zero into Infinity.
  const zeroTeam = buildOpportunityProfile({ ...mitchell2025, team_off_snaps: 0 });
  check("zero team snaps yields null snap_share (no Infinity)", zeroTeam.snap_share === null, `${zeroTeam.snap_share}`);

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
