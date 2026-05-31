/**
 * Route-participation regression. Phase B #3 of MODEL_LIVE_PLAN.md.
 *
 *   npx tsx --tsconfig tsconfig.json evals/route-participation.test.ts
 *
 * Locks two things so neither the season-aware aggregation nor the
 * rubric reads silently drift:
 *
 * 1. `aggregateRouteParticipation` (the pure half of the canonical
 *    nflverse compute): route rate = dropbacks-on-field / team-dropbacks,
 *    mid-season trade attribution (denominator follows the player's team
 *    that game), the GP floor, the WR/TE-only filter, and the no->100%
 *    cap. Per-season by construction; the test feeds synthetic
 *    pbp_participation rows for ONE season.
 *
 * 2. The WR / TE rubric reads of `route_participation` (MODEL_CARD 4.3
 *    volume floor / 4.4 ~60% hard threshold): a below-floor TE is
 *    discounted vs an at-floor TE; a high-route WR is lifted vs a
 *    low-route WR; absence of the signal is neutral (no silent default).
 */

import {
  aggregateRouteParticipation,
  type Crosswalk,
} from "../src/lib/signals/nflverse";
import { evaluateWr, evaluateTe } from "../src/lib/engine/evaluation";
import type { EvaluationContext } from "../src/lib/engine/evaluation/types";

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

// Minimal crosswalk: gsis -> sleeper, plus a fallback position map.
function xwalk(
  gsisToSleeper: Record<string, string>,
  posBySleeper: Record<string, string> = {},
): Crosswalk {
  return {
    gsisToSleeper: new Map(Object.entries(gsisToSleeper)),
    pfrToSleeper: new Map(),
    nameBySleeper: new Map(),
    posBySleeper: new Map(Object.entries(posBySleeper)),
    birthYearBySleeper: new Map(),
    draftYearBySleeper: new Map(),
  };
}

// Build a pbp_participation-shaped row. `db` = is this play a dropback
// (sets time_to_throw). `offense` = [gsis, pos] pairs on the field.
function play(args: {
  team: string;
  game: string;
  db: boolean;
  offense: [string, string][];
}): Record<string, string> {
  return {
    nflverse_game_id: args.game,
    possession_team: args.team,
    time_to_throw: args.db ? "2.7" : "",
    offense_players: args.offense.map((o) => o[0]).join(";"),
    offense_positions: args.offense.map((o) => o[1]).join(";"),
  };
}

// ---- 1. aggregation math ----
console.log("aggregateRouteParticipation:");
{
  // Game A: team KC, 10 dropbacks. WR "g1" on field for 9 (90%). TE "g2"
  // for all 10 (100%). Non-WR/TE "g3" every play (dropped). A 20%-route
  // WR "g4" present (2/10) is KEPT: the floor guards the team-dropback
  // DENOMINATOR (sample size), not a low individual route share.
  const rows: Record<string, string>[] = [];
  for (let i = 0; i < 10; i++) {
    const onField: [string, string][] = [
      ["g2", "TE"],
      ["g3", "RB"],
    ];
    if (i < 9) onField.push(["g1", "WR"]);
    if (i < 2) onField.push(["g4", "WR"]);
    rows.push(play({ team: "KC", game: "2024_01_KC_LV", db: true, offense: onField }));
  }
  // one non-dropback play, everyone on field (should not move denom/num)
  rows.push(
    play({
      team: "KC",
      game: "2024_01_KC_LV",
      db: false,
      offense: [["g1", "WR"], ["g2", "TE"], ["g3", "RB"], ["g4", "WR"]],
    }),
  );
  // Game B: a different team's blowout where WR "g5" appears in only a
  // 3-dropback garbage-time window. Below the floor -> dropped.
  for (let i = 0; i < 3; i++)
    rows.push(play({ team: "NYJ", game: "2024_01_NYJ_X", db: true, offense: [["g5", "WR"]] }));

  const out = aggregateRouteParticipation(
    rows,
    xwalk({ g1: "s1", g2: "s2", g3: "s3", g4: "s4", g5: "s5" }),
    5, // floor on team_dropbacks: KC's 10 qualifies, NYJ's 3 does not
  );

  check("WR 9/10 dropbacks -> 0.90", out.get("s1")?.route_rate === 0.9, String(out.get("s1")?.route_rate));
  check("TE 10/10 dropbacks -> 1.00", out.get("s2")?.route_rate === 1, String(out.get("s2")?.route_rate));
  check("non-WR/TE (RB) excluded", !out.has("s3"));
  check("low individual route (2/10) KEPT, rate 0.20", out.get("s4")?.route_rate === 0.2, String(out.get("s4")?.route_rate));
  check("below team-dropback floor (3) excluded", !out.has("s5"));
  check("non-dropback play not counted (denom stays 10)", out.get("s2")?.team_dropbacks === 10, String(out.get("s2")?.team_dropbacks));
  check("position resolved from on-field tag", out.get("s1")?.position === "WR");
}

{
  // Mid-season trade: player on TEAM A for game 1 (8 db) and TEAM B for
  // game 2 (12 db), on the field for every dropback both games. Route
  // rate must be 20/20 = 1.0 (denominator follows the player's team per
  // game), NOT inflated past 100% by a single-team denominator.
  const rows: Record<string, string>[] = [];
  for (let i = 0; i < 8; i++)
    rows.push(play({ team: "DAL", game: "g_w1", db: true, offense: [["t1", "WR"]] }));
  for (let i = 0; i < 12; i++)
    rows.push(play({ team: "BUF", game: "g_w2", db: true, offense: [["t1", "WR"]] }));

  const out = aggregateRouteParticipation(rows, xwalk({ t1: "tr1" }), 5);
  check("traded player route rate capped at 1.0", out.get("tr1")?.route_rate === 1, String(out.get("tr1")?.route_rate));
  check("traded player denom = both teams' dropbacks (20)", out.get("tr1")?.team_dropbacks === 20, String(out.get("tr1")?.team_dropbacks));
  const primary = out.get("tr1")?.team;
  check("primary team = the team with more games appeared", primary === "DAL" || primary === "BUF", String(primary));
}

{
  // Player with no crosswalk id is dropped (never silently keyed by gsis).
  const rows = [play({ team: "SF", game: "g", db: true, offense: [["unknown_gsis", "WR"]] })];
  const out = aggregateRouteParticipation(rows, xwalk({}), 0);
  check("uncrosswalked player dropped", out.size === 0);
}

// ---- 2. rubric reads ----
console.log("\nWR / TE rubric route reads:");
function ctx(over: Partial<EvaluationContext>): EvaluationContext {
  return {
    player: null,
    team: null,
    ktc_value: 5000, // a mid-market prior so effects are visible
    position: over.position ?? "WR",
    age: 26,
    is_rookie: false,
    years_exp: 4,
    ...over,
  };
}

{
  const hi = evaluateWr(ctx({ position: "WR", route_participation: 0.95 }));
  const lo = evaluateWr(ctx({ position: "WR", route_participation: 0.5 }));
  const none = evaluateWr(ctx({ position: "WR", route_participation: null }));
  check(
    "WR high route rate scores above low route rate",
    hi.point_estimate > lo.point_estimate,
    `${hi.point_estimate.toFixed(1)} vs ${lo.point_estimate.toFixed(1)}`,
  );
  check(
    "WR null route is neutral (between hi and lo, no silent default)",
    none.point_estimate < hi.point_estimate && none.point_estimate > lo.point_estimate,
    none.point_estimate.toFixed(1),
  );
  check(
    "WR route evidence absent when route is null",
    !none.evidence_stack.some((e) => e.signal === "route_participation"),
  );
}

{
  const aboveFloor = evaluateTe(ctx({ position: "TE", route_participation: 0.85 }));
  const belowFloor = evaluateTe(ctx({ position: "TE", route_participation: 0.4 }));
  const none = evaluateTe(ctx({ position: "TE", route_participation: null }));
  check(
    "TE below 60% floor scores below an at/above-floor TE",
    belowFloor.point_estimate < aboveFloor.point_estimate,
    `${belowFloor.point_estimate.toFixed(1)} vs ${aboveFloor.point_estimate.toFixed(1)}`,
  );
  check(
    "TE below floor fires the structural-cap evidence",
    belowFloor.evidence_stack.some((e) => e.signal === "route_participation_floor"),
  );
  check(
    "TE null route is neutral (no silent floor penalty)",
    none.point_estimate > belowFloor.point_estimate,
    none.point_estimate.toFixed(1),
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
