/**
 * Phase C2 EnrichedPlayer regression.
 *
 *   npx tsx --tsconfig tsconfig.json evals/enriched-player.test.ts
 *
 * Locks the canonical resolver (`src/lib/players/enriched-player.ts`):
 *
 *   1. A fully-populated player resolves with no warnings on its
 *      consumer fields; the rubric-relevant signals appear on
 *      `enriched.signals` and `enriched.team_signals` and the
 *      `missing` list contains no row-shape flags.
 *   2. A player with no `player_signals` row gets a top-level
 *      `player_signals` missing flag with reason "row_missing"
 *      (NOT "column_null"; the contract distinguishes them).
 *   3. A player on a team with no `team_signals` row gets a
 *      `team_signals` row_missing flag plus the inflection inputs
 *      still build (the inflection pipeline is independent of
 *      team_signals).
 *   4. An unknown Sleeper player_id returns null from the single
 *      resolver and is absent from the batch map.
 *   5. The 9-arg inflection gap (Leak 4) is closed: a skill player
 *      with prev-season stats + career usage + draft pick map fed
 *      to the resolver receives a fully-populated InflectionInputs.
 *   6. A non-skill position (K) returns an EnrichedPlayer with
 *      `inflection_inputs: null` and the position-not-modeled flag.
 *
 * The test stubs the canonical fetchers via the optional pre-fetched
 * maps so the run is offline and deterministic (no Supabase, no
 * Sleeper, no FantasyCalc).
 */

import {
  resolveEnrichedPlayer,
  resolveEnrichedPlayers,
  type EnrichedPlayer,
  type MissingFieldFlag,
} from "../src/lib/players/enriched-player";
import type { SleeperPlayer } from "../src/lib/sleeper/schemas";
import type { PlayerSignalsRowWide } from "../src/lib/players/player-signals";
import type { TeamSignalsRow } from "../src/lib/signals/schema";
import type { PlayerHealthRow } from "../src/lib/players/player-health";
import type { PlayerSeasonStats } from "../src/lib/players/season-stats";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ${"✓"} ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failed++;
    console.log(`  ${"✗"} ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function makeSleeper(
  id: string,
  overrides: Partial<SleeperPlayer> = {},
): SleeperPlayer {
  return {
    player_id: id,
    full_name: `Player ${id}`,
    first_name: "Player",
    last_name: id,
    position: "WR",
    team: "ATL",
    age: 24,
    years_exp: 2,
    status: "Active",
    injury_status: null,
    fantasy_positions: ["WR"],
    search_rank: 80,
    ...overrides,
  };
}

function makeSignals(
  id: string,
  overrides: Partial<PlayerSignalsRowWide> = {},
): PlayerSignalsRowWide {
  return {
    player_id: id,
    position: "WR",
    team: "ATL",
    age: 24,
    rb_role_tier: null,
    rb_traded_offseason_flag: null,
    rb_role_at_new_team_projected: null,
    rb_passdown_share_prior_year: null,
    compounding_news_count: 0,
    contract_years_remaining: null,
    recent_extension_flag: null,
    contract_year_flag: false,
    weight_lb: 200,
    height_in: 73,
    last_updated: "2026-05-26T00:00:00Z",
    updated_by: "test",
    ...overrides,
  };
}

function makeTeamSignals(
  team: string,
  overrides: Partial<TeamSignalsRow> = {},
): TeamSignalsRow {
  return {
    team,
    ol_continuity_score: 0.8,
    ol_grade_run: null,
    ol_grade_pass: null,
    rookie_ol_starters_count: 0,
    rookie_ol_position_breakdown: {},
    hc_id: null,
    hc_first_time_flag: null,
    hc_tenure_yrs: null,
    hc_background_tag: null,
    oc_id: null,
    oc_tenure_yrs: null,
    oc_first_year_with_team_flag: null,
    scheme_tag: null,
    staff_novelty_composite: 0,
    scheme_pace: null,
    pass_rate_neutral: null,
    personnel_12_rate: null,
    last_updated: "2026-05-26T00:00:00Z",
    updated_by: "test",
    ...overrides,
  };
}

function makeStats(
  id: string,
  overrides: Partial<PlayerSeasonStats> = {},
): PlayerSeasonStats {
  return {
    player_id: id,
    pts_ppr: 220,
    pts_half_ppr: 200,
    pts_std: 180,
    games_played: 16,
    carries: 0,
    targets: 130,
    receptions: 95,
    rec_yards: 1100,
    rec_tds: 8,
    air_yards: 1400,
    drops: 4,
    rz_targets: 18,
    snaps: 950,
    team_off_snaps: 1080,
    ...overrides,
  } as PlayerSeasonStats;
}

function hasField(flags: MissingFieldFlag[], field: string): boolean {
  return flags.some((f) => f.field === field);
}

function fieldFlag(
  flags: MissingFieldFlag[],
  field: string,
): MissingFieldFlag | undefined {
  return flags.find((f) => f.field === field);
}

async function run(): Promise<void> {
  console.log("\n-- Fully populated player --");
  {
    const id = "PLAYER_A";
    const playersMap = new Map<string, SleeperPlayer>([[id, makeSleeper(id)]]);
    const playerSignalsMap = new Map<string, PlayerSignalsRowWide>([
      [id, makeSignals(id)],
    ]);
    const teamSignalsMap = new Map<string, TeamSignalsRow>([
      ["ATL", makeTeamSignals("ATL")],
    ]);
    const playerHealthMap = new Map<string, PlayerHealthRow>([
      [
        id,
        {
          player_id: id,
          games_missed_3yr: 0,
          injury_history: [],
          chronic_flag: false,
          current_status: "Active",
          off_field_flag: false,
          holdout_flag: false,
          last_updated: "2026-05-26T00:00:00Z",
        },
      ],
    ]);
    const enriched = await resolveEnrichedPlayer(id, {
      playersMap,
      valueLookup: () => 65,
      adpLookup: () => 80,
      playerSignalsMap,
      teamSignalsMap,
      playerHealthMap,
      draftPickByPlayerId: new Map(),
    });

    check("resolves a sleeper-known player_id", enriched != null, id);
    check(
      "identity passes through (name + position + team)",
      enriched != null &&
        enriched.name === `Player ${id}` &&
        enriched.position === "WR" &&
        enriched.team === "ATL",
    );
    check(
      "market value resolves via valueLookup",
      enriched != null &&
        enriched.value === 65 &&
        enriched.ktc_value === 65 &&
        enriched.adp === 80,
    );
    check(
      "signals + team_signals + health all resolve to row objects",
      enriched != null &&
        enriched.signals != null &&
        enriched.team_signals != null &&
        enriched.health != null,
    );
    check(
      "no top-level shape gaps on the missing list",
      enriched != null &&
        !hasField(enriched.missing, "value") &&
        !hasField(enriched.missing, "adp") &&
        !hasField(enriched.missing, "player_signals") &&
        !hasField(enriched.missing, "team_signals") &&
        !hasField(enriched.missing, "player_health"),
    );
  }

  console.log("\n-- Player with no player_signals row --");
  {
    const id = "PLAYER_B";
    const playersMap = new Map<string, SleeperPlayer>([[id, makeSleeper(id)]]);
    // Another player's signals exist so the table-is-empty branch does
    // not fire; this is row_missing, not table_empty.
    const playerSignalsMap = new Map<string, PlayerSignalsRowWide>([
      ["OTHER_ID", makeSignals("OTHER_ID")],
    ]);
    const teamSignalsMap = new Map<string, TeamSignalsRow>([
      ["ATL", makeTeamSignals("ATL")],
    ]);
    const enriched = await resolveEnrichedPlayer(id, {
      playersMap,
      valueLookup: () => null,
      playerSignalsMap,
      teamSignalsMap,
      playerHealthMap: new Map(),
      draftPickByPlayerId: new Map(),
    });

    check("returns an EnrichedPlayer", enriched != null);
    check(
      "signals is null with row_missing reason",
      enriched != null &&
        enriched.signals === null &&
        fieldFlag(enriched.missing, "player_signals")?.reason === "row_missing",
    );
    check(
      "team_signals still resolves (independent of player_signals)",
      enriched != null && enriched.team_signals != null,
    );
    check(
      "value missing flag fires when valueLookup returns null",
      enriched != null && hasField(enriched.missing, "value"),
    );
  }

  console.log("\n-- Player on a team with no team_signals row --");
  {
    const id = "PLAYER_C";
    const playersMap = new Map<string, SleeperPlayer>([
      [id, makeSleeper(id, { team: "ATL" })],
    ]);
    const playerSignalsMap = new Map<string, PlayerSignalsRowWide>([
      [id, makeSignals(id)],
    ]);
    // Different team has a row so the table is NOT empty, but ATL's row is missing.
    const teamSignalsMap = new Map<string, TeamSignalsRow>([
      ["KC", makeTeamSignals("KC")],
    ]);
    const enriched = await resolveEnrichedPlayer(id, {
      playersMap,
      valueLookup: () => 50,
      playerSignalsMap,
      teamSignalsMap,
      playerHealthMap: new Map(),
      draftPickByPlayerId: new Map(),
    });

    check("returns an EnrichedPlayer", enriched != null);
    check(
      "team_signals is null with row_missing reason",
      enriched != null &&
        enriched.team_signals === null &&
        fieldFlag(enriched.missing, "team_signals")?.reason === "row_missing",
    );
    check(
      "inflection_inputs still builds (skill position, builder is independent of team_signals)",
      enriched != null && enriched.inflection_inputs != null,
    );
  }

  console.log("\n-- Unknown Sleeper player_id --");
  {
    const enriched = await resolveEnrichedPlayer("MISSING_PLAYER", {
      playersMap: new Map(),
      valueLookup: () => null,
      playerSignalsMap: new Map(),
      teamSignalsMap: new Map(),
      playerHealthMap: new Map(),
      draftPickByPlayerId: new Map(),
    });
    check("returns null when sleeper has no row", enriched === null);

    const batch = await resolveEnrichedPlayers({
      playerIds: ["MISSING_A", "MISSING_B"],
      playersMap: new Map(),
      valueLookup: () => null,
      playerSignalsMap: new Map(),
      teamSignalsMap: new Map(),
      playerHealthMap: new Map(),
      draftPickByPlayerId: new Map(),
    });
    check("batch omits unknown ids (does not insert nulls)", batch.size === 0);
  }

  console.log("\n-- Inflection 9-arg gap closed (Leak 4) --");
  {
    const id = "RB_PROVEN";
    const playersMap = new Map<string, SleeperPlayer>([
      [
        id,
        makeSleeper(id, {
          position: "RB",
          fantasy_positions: ["RB"],
          age: 27,
          years_exp: 4,
          team: "SF",
        }),
      ],
    ]);
    const playerSignalsMap = new Map<string, PlayerSignalsRowWide>([
      [
        id,
        makeSignals(id, {
          position: "RB",
          rb_role_tier: "bellcow",
          draft_pick_no: 32,
          compounding_news_count: 1,
        }),
      ],
    ]);
    const teamSignalsMap = new Map<string, TeamSignalsRow>([
      ["SF", makeTeamSignals("SF")],
    ]);
    const prevSeasonStats = new Map<string, PlayerSeasonStats>([
      [id, makeStats(id, { carries: 280, targets: 70 })],
    ]);
    const prevPrevSeasonStats = new Map<string, PlayerSeasonStats>([
      [id, makeStats(id, { carries: 240, targets: 60 })],
    ]);
    const careerUsage = new Map<string, { carries: number; targets: number }>([
      [id, { carries: 900, targets: 200 }],
    ]);
    const draftPickByPlayerId = new Map<string, number>([[id, 32]]);

    const enriched = await resolveEnrichedPlayer(id, {
      playersMap,
      valueLookup: () => 80,
      playerSignalsMap,
      teamSignalsMap,
      playerHealthMap: new Map(),
      prevSeasonStats,
      prevPrevSeasonStats,
      careerUsage,
      draftPickByPlayerId,
    });

    check("returns an EnrichedPlayer", enriched != null);
    check("inflection_inputs builds", enriched?.inflection_inputs != null);
    check(
      "career_carries threaded (non-null)",
      enriched?.inflection_inputs?.career_carries === 900,
    );
    check(
      "prev_season_carries threaded",
      enriched?.inflection_inputs?.prev_season_carries === 280,
    );
    check(
      "prev_prev_season_carries threaded",
      enriched?.inflection_inputs?.prev_prev_season_carries === 240,
    );
    check(
      "prev_season_opportunity profile threaded",
      enriched?.inflection_inputs?.prev_season_opportunity != null,
    );
    check(
      "draft_pick_overall threaded",
      enriched?.inflection_inputs?.draft_pick_overall === 32,
    );
    check(
      "compounding_news_count threaded",
      enriched?.inflection_inputs?.compounding_news_count === 1,
    );
    check(
      "no inflection_inputs.prev_season gap (data was provided)",
      !hasField(enriched?.missing ?? [], "inflection_inputs.prev_season"),
    );
  }

  console.log("\n-- Non-skill position (K) --");
  {
    const id = "KICKER_A";
    const playersMap = new Map<string, SleeperPlayer>([
      [
        id,
        makeSleeper(id, {
          position: "K",
          fantasy_positions: ["K"],
          team: "BAL",
        }),
      ],
    ]);
    const enriched = await resolveEnrichedPlayer(id, {
      playersMap,
      valueLookup: () => null,
      playerSignalsMap: new Map(),
      teamSignalsMap: new Map(),
      playerHealthMap: new Map(),
      draftPickByPlayerId: new Map(),
    });

    check("returns an EnrichedPlayer for K", enriched != null);
    check(
      "inflection_inputs is null (K is not bifurcation-modeled)",
      enriched != null && enriched.inflection_inputs === null,
    );
    check(
      "missing list calls out the non-modeled position",
      enriched != null &&
        fieldFlag(enriched.missing, "inflection_inputs")?.reason ===
          "not_acquired",
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
