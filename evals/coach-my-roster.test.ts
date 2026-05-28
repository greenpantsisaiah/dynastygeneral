/**
 * Coach my_roster build regression.
 *
 *   npx tsx --tsconfig tsconfig.json evals/coach-my-roster.test.ts
 *
 * Locks the named-roster build that ships in the Coach context as
 * `me.players`. Without this, the LLM cannot verify any claim about
 * who is on the user's roster (IDs alone produce hallucinations like
 * "you need a TE" when the user has Kincaid).
 *
 * The 2026-05-27 regression this test enforces against:
 *   The taxi PR's inline `.map()` callback referenced
 *   `formatRules.has_taxi` BEFORE `formatRules` was declared further
 *   down the route. That hit a temporal dead zone, threw a
 *   ReferenceError, the catch block swallowed it silently, and the
 *   user's named roster shipped EMPTY to the Coach LLM. The LLM then
 *   correctly reported "your me.players array is empty in this
 *   snapshot" and refused to recommend taxi candidates by name.
 *
 * The fix was to extract the build into a pure helper
 * (buildMyRosterForCoach) and call it AFTER formatRules is
 * available. This test invokes the helper directly with synthetic
 * data so any future refactor that drops the named roster or breaks
 * taxi flags fails CI before reaching prod.
 */

import {
  buildMyRosterForCoach,
  type ResolvedPlayerValue,
} from "../src/lib/coach/my-roster";
import type { FormatRules } from "../src/lib/engine/llm-contract";
import type { SleeperPlayer } from "../src/lib/sleeper/schemas";
import type { RosterSnapshot } from "../src/lib/strategy/league-state/snapshot";

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

const SF_DYNASTY_TAXI_RULES: FormatRules = {
  qb_starters_max: 2,
  rb_starters_max: 5,
  wr_starters_max: 5,
  te_starters_max: 4,
  k_starters_max: 0,
  dst_starters_max: 0,
  has_k: false,
  has_dst: false,
  second_qb_starts: true,
  te_premium: true,
  is_superflex: true,
  flex_eligible: ["RB", "WR", "TE"] as const,
  sf_eligible: ["QB", "RB", "WR", "TE"] as const,
  league_type: "dynasty",
  max_keepers: null,
  taxi_slots: 5,
  taxi_years: 2,
  has_taxi: true,
  ir_slots: 5,
  has_ir: true,
  best_ball: false,
  trade_deadline_week: null,
  playoff_week_start: null,
  waiver_type_raw: null,
};

const NO_TAXI_RULES: FormatRules = {
  ...SF_DYNASTY_TAXI_RULES,
  taxi_slots: 0,
  taxi_years: null,
  has_taxi: false,
};

function syntheticRoster(playerIds: string[]): RosterSnapshot {
  return {
    roster_id: 1,
    owner_id: "owner-1",
    owner_name: "izzydabomb",
    is_me: true,
    position_counts: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 },
    position_ranks: { QB: [], RB: [], WR: [], TE: [], K: [], DST: [] },
    player_ids: playerIds,
    avg_age: 24.5,
    starter_avg_age: 25,
    starter_talent_score: 0.6,
    wins: 0,
    losses: 0,
    ties: 0,
    taxi_player_ids: [],
    reserve_player_ids: [],
  };
}

function syntheticPlayer(args: {
  id: string;
  name: string;
  position: string;
  team: string;
  age: number;
  yearsExp: number;
  searchRank: number;
}): SleeperPlayer {
  return {
    player_id: args.id,
    full_name: args.name,
    first_name: args.name.split(" ")[0],
    last_name: args.name.split(" ").slice(1).join(" "),
    position: args.position,
    team: args.team,
    age: args.age,
    years_exp: args.yearsExp,
    search_rank: args.searchRank,
  };
}

function run() {
  console.log("\n── buildMyRosterForCoach ──");

  // Scenario 1: realistic post-draft dynasty roster with mix of rookies
  // / sophomores / vets. The 2026-05-27 bug class: an empty named
  // roster ships when the helper hits an error. This must produce a
  // populated array.
  {
    const me = syntheticRoster([
      "loveland-1",
      "judkins-2",
      "higgins-3",
      "ej-4",
      "vet-5",
    ]);
    const resolved = new Map<string, SleeperPlayer>([
      [
        "loveland-1",
        syntheticPlayer({
          id: "loveland-1",
          name: "Colston Loveland",
          position: "TE",
          team: "CHI",
          age: 22,
          yearsExp: 0,
          searchRank: 28,
        }),
      ],
      [
        "judkins-2",
        syntheticPlayer({
          id: "judkins-2",
          name: "Quinshon Judkins",
          position: "RB",
          team: "CLE",
          age: 22,
          yearsExp: 0,
          searchRank: 39,
        }),
      ],
      [
        "higgins-3",
        syntheticPlayer({
          id: "higgins-3",
          name: "Jayden Higgins",
          position: "WR",
          team: "HOU",
          age: 23,
          yearsExp: 1,
          searchRank: 80,
        }),
      ],
      [
        "ej-4",
        syntheticPlayer({
          id: "ej-4",
          name: "Emmett Johnson",
          position: "RB",
          team: "KC",
          age: 22,
          yearsExp: 0,
          searchRank: 250,
        }),
      ],
      [
        "vet-5",
        syntheticPlayer({
          id: "vet-5",
          name: "Davante Adams",
          position: "WR",
          team: "LV",
          age: 32,
          yearsExp: 11,
          searchRank: 50,
        }),
      ],
    ]);
    const valueMap = new Map<string, ResolvedPlayerValue>([
      ["loveland-1", { value: 53, overall_rank: 28, position_rank: 6 }],
      ["judkins-2", { value: 39, overall_rank: 45, position_rank: 14 }],
      ["higgins-3", { value: 18, overall_rank: 120, position_rank: 38 }],
      ["ej-4", { value: 4, overall_rank: 240, position_rank: 80 }],
      ["vet-5", { value: 42, overall_rank: 35, position_rank: 8 }],
    ]);
    const out = buildMyRosterForCoach({
      me,
      formatRules: SF_DYNASTY_TAXI_RULES,
      resolvedPlayers: resolved,
      prevSeasonStats: new Map(),
      playerValueMap: valueMap,
    });
    check(
      "named roster is non-empty when roster has player_ids",
      out.length === 5,
      `${out.length} players returned`,
    );
    check(
      "every player has a resolved name (not just an id)",
      out.every((p) => p.name && !p.name.startsWith("loveland-")),
      "names resolved through humanize",
    );
    check(
      "rookies + sophomores are taxi_eligible (years_exp <= taxi_years = 2)",
      out.find((p) => p.player_id === "loveland-1")?.taxi_eligible === true &&
        out.find((p) => p.player_id === "judkins-2")?.taxi_eligible === true &&
        out.find((p) => p.player_id === "higgins-3")?.taxi_eligible === true &&
        out.find((p) => p.player_id === "ej-4")?.taxi_eligible === true,
      "Loveland / Judkins / Higgins / EJ all eligible",
    );
    check(
      "11-yr vet is NOT taxi_eligible (years_exp > taxi_years)",
      out.find((p) => p.player_id === "vet-5")?.taxi_eligible === false,
      "Adams excluded",
    );
    check(
      "values populated from the value map (no second-pass needed)",
      out.find((p) => p.player_id === "loveland-1")?.value === 53 &&
        out.find((p) => p.player_id === "judkins-2")?.value === 39,
      "value-enriched in one pass",
    );
    check(
      "rank ordering: best Sleeper search_rank first",
      out[0]?.name === "Colston Loveland" &&
        out[out.length - 1]?.name === "Emmett Johnson",
      "rank 28 → ... → 250",
    );
  }

  // Scenario 2: league with no taxi. taxi_eligible must be false for
  // EVERY player regardless of years_exp.
  {
    const me = syntheticRoster(["rookie-1"]);
    const resolved = new Map<string, SleeperPlayer>([
      [
        "rookie-1",
        syntheticPlayer({
          id: "rookie-1",
          name: "Some Rookie",
          position: "WR",
          team: "NYJ",
          age: 22,
          yearsExp: 0,
          searchRank: 100,
        }),
      ],
    ]);
    const out = buildMyRosterForCoach({
      me,
      formatRules: NO_TAXI_RULES,
      resolvedPlayers: resolved,
      prevSeasonStats: new Map(),
      playerValueMap: new Map(),
    });
    check(
      "no-taxi league: rookie is NOT taxi_eligible",
      out[0]?.taxi_eligible === false,
      "has_taxi false dominates years_exp check",
    );
  }

  // Scenario 3: player currently on taxi / reserve is NOT eligible
  // (already there / room is for injured, not developmental).
  {
    const me: RosterSnapshot = {
      ...syntheticRoster(["already-taxi", "on-ir"]),
      taxi_player_ids: ["already-taxi"],
      reserve_player_ids: ["on-ir"],
    };
    const resolved = new Map<string, SleeperPlayer>([
      [
        "already-taxi",
        syntheticPlayer({
          id: "already-taxi",
          name: "Stashed Rookie",
          position: "RB",
          team: "SEA",
          age: 22,
          yearsExp: 0,
          searchRank: 150,
        }),
      ],
      [
        "on-ir",
        syntheticPlayer({
          id: "on-ir",
          name: "Hurt Rookie",
          position: "WR",
          team: "BUF",
          age: 22,
          yearsExp: 0,
          searchRank: 200,
        }),
      ],
    ]);
    const out = buildMyRosterForCoach({
      me,
      formatRules: SF_DYNASTY_TAXI_RULES,
      resolvedPlayers: resolved,
      prevSeasonStats: new Map(),
      playerValueMap: new Map(),
    });
    const taxi = out.find((p) => p.player_id === "already-taxi");
    const ir = out.find((p) => p.player_id === "on-ir");
    check(
      "currently_on_taxi flag fires",
      taxi?.currently_on_taxi === true,
      "Stashed Rookie marked on taxi",
    );
    check(
      "currently_on_reserve flag fires",
      ir?.currently_on_reserve === true,
      "Hurt Rookie marked on IR",
    );
    check(
      "currently_on_taxi player NOT re-suggested as taxi candidate",
      taxi?.taxi_eligible === false,
      "already there",
    );
    check(
      "currently_on_reserve player NOT a taxi candidate",
      ir?.taxi_eligible === false,
      "IR is a different room",
    );
  }

  // Scenario 4: empty roster (no player_ids). Returns [], does not
  // throw. Mirrors the early-return guard in the route.
  {
    const me = syntheticRoster([]);
    const out = buildMyRosterForCoach({
      me,
      formatRules: SF_DYNASTY_TAXI_RULES,
      resolvedPlayers: new Map(),
      prevSeasonStats: new Map(),
      playerValueMap: new Map(),
    });
    check(
      "empty roster returns empty array (no throw)",
      Array.isArray(out) && out.length === 0,
      "graceful early return",
    );
  }

  // Scenario 5: ID present in player_ids but absent from
  // resolvedPlayers Map. Drop the row, do not fake a name.
  {
    const me = syntheticRoster(["known-1", "unknown-2"]);
    const resolved = new Map<string, SleeperPlayer>([
      [
        "known-1",
        syntheticPlayer({
          id: "known-1",
          name: "Known Player",
          position: "QB",
          team: "MIA",
          age: 28,
          yearsExp: 5,
          searchRank: 40,
        }),
      ],
    ]);
    const out = buildMyRosterForCoach({
      me,
      formatRules: SF_DYNASTY_TAXI_RULES,
      resolvedPlayers: resolved,
      prevSeasonStats: new Map(),
      playerValueMap: new Map(),
    });
    check(
      "unresolved IDs are dropped, not faked",
      out.length === 1 && out[0]?.player_id === "known-1",
      "1 of 2 ids resolved",
    );
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
