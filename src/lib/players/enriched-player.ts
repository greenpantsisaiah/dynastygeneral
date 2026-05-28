/**
 * Enriched player resolver (CANONICAL, Phase C2 of MODEL_LIVE_PLAN).
 *
 * Single per-player resolver that reconciles the four disagreeing
 * definitions of a "player" the audit named (SQL `player_signals`,
 * TS `PlayerSignalsRow`, the wider rubric-read shape
 * `PlayerSignalsRowWide`, and Sleeper meta). Returns ONE
 * `EnrichedPlayer` shape every downstream consumer reads from:
 * identity (Sleeper meta), market (FantasyCalc value + ADP), signals
 * (`player_signals` wide), team_signals, health, inflection_inputs,
 * and a `missing` list naming every field that is null with the
 * reason and the consumer impact.
 *
 * The `missing` list is the no-silent-null contract. A downstream
 * consumer that reads a null field knows WHY (table_empty,
 * row_missing, column_null, not_acquired, not_provided) and what
 * that means for the surface (e.g. "rubric falls back to position
 * base rate"). The contract removes the ambiguity behind the audit's
 * Leak 4: was this signal null because the column has no row, or
 * because the caller forgot to pass it?
 *
 * Two entry points:
 *   - `resolveEnrichedPlayer(player_id, args?)`: one player.
 *   - `resolveEnrichedPlayers({ playerIds, ... })`: batch (the hub +
 *     Coach form, no N+1).
 *
 * Both accept optional pre-fetched maps so a caller that already has
 * `playersMap` / `playerSignalsMap` / `teamSignalsMap` (the hub does)
 * never pays the fetch twice. The resolver fetches only what is not
 * provided.
 *
 * Registered in `CANONICAL_SOURCES.md` under "Enriched player
 * resolver". No surface outside this file reads `player_signals`,
 * `team_signals`, `player_health`, or `resolvePlayerValues` directly;
 * consume the resolver.
 */

import {
  humanize,
  resolvePlayers,
  type HumanPlayer,
} from "@/lib/players/cache";
import type { SleeperPlayer } from "@/lib/sleeper/schemas";
import {
  resolvePlayerValues,
  type PlayerValue,
} from "@/lib/players/values";
import {
  getPlayerSignalsMap,
  getTeamSignalsMap,
  type PlayerSignalsRowWide,
} from "@/lib/players/player-signals";
import {
  getPlayerHealthMap,
  isPlayerHealthTableEmpty,
  type PlayerHealthRow,
} from "@/lib/players/player-health";
import { getDraftPickMap } from "@/lib/players/draft-capital";
import {
  buildOpportunityProfile,
  type PlayerSeasonStats,
} from "@/lib/players/season-stats";
import { buildInflectionInputsFromHumanPlayer } from "@/lib/engine/inflection/build-inputs";
import type { InflectionInputs } from "@/lib/engine/inflection/types";
import type { TeamSignalsRow } from "@/lib/signals/schema";
import {
  normalizePosition,
  type Position,
} from "@/lib/strategy/archetypes/schema";

/**
 * Why a field on EnrichedPlayer is null.
 *
 * - `table_empty`: the source table has zero rows. We have not
 *   ingested this data yet. Different from row_missing because the
 *   gap is "not acquired" rather than "not for this player".
 * - `row_missing`: the source table has rows, but none for this
 *   player_id. Distinct so the caller can tell "we have signals for
 *   most players but not this one" from "we have no signals at all".
 * - `column_null`: the row exists but the specific column is null
 *   (the most common shape today; the audit's headline).
 * - `not_acquired`: the data source is structurally not available
 *   (e.g. FantasyCalc has no entry, no ADP variant for this format).
 * - `not_provided`: the caller did not pass the optional map and the
 *   resolver could not derive it (e.g. ADP lookup not given).
 */
export type MissingReason =
  | "table_empty"
  | "row_missing"
  | "column_null"
  | "not_acquired"
  | "not_provided";

export type MissingFieldFlag = {
  /** Dotted path of the missing field, e.g. "player_signals.target_share_prior_year". */
  field: string;
  reason: MissingReason;
  /** One-line plain-English note on what the absence means downstream. */
  consumer_impact: string;
};

export type EnrichedPlayer = {
  // Identity (Sleeper meta)
  player_id: string;
  name: string;
  position: Position | null;
  team: string | null;
  age: number | null;
  years_exp: number | null;
  /** Sleeper draft search_rank (the static draft-board sort proxy). */
  search_rank: number | null;

  // Market
  /** FantasyCalc value, normalized 0-100 (TE-premium multiplied when applicable). */
  value: number | null;
  /** Alias of `value` today; reserved for Stage 5 KTC ingest unlock. */
  ktc_value: number | null;
  /** Overall rank in the FantasyCalc dataset for the league's format. */
  overall_rank: number | null;
  /** Position rank in the FantasyCalc dataset for the league's format. */
  position_rank: number | null;
  /** Player's ADP (rookie or format-variant lookup, when provided). */
  adp: number | null;

  // Per-player signals (the wide row the rubric reads)
  signals: PlayerSignalsRowWide | null;
  // Per-team signals (scheme / OL / coaching)
  team_signals: TeamSignalsRow | null;
  // Per-player health row (empty in production today; the resolver
  // tries so the contract surfaces the gap honestly)
  health: PlayerHealthRow | null;

  /**
   * Inflection inputs for the bifurcation engine. Null when the
   * player's position is not skill (QB/RB/WR/TE) because the
   * inflection resolver only models those positions. Otherwise the
   * full inputs (10 args, including the prev-season usage +
   * opportunity profile + career mileage + draft capital) the
   * `buildInflectionInputsFromHumanPlayer` helper expects.
   */
  inflection_inputs: InflectionInputs | null;

  /**
   * Every nullable field that came back null, with the reason and
   * the consumer impact. The no-silent-null contract: a downstream
   * consumer that reads `enriched.value` and gets null can scan this
   * list to see whether the gap is "no FantasyCalc match" or "value
   * map was not pre-built and FantasyCalc is unreachable".
   */
  missing: MissingFieldFlag[];
};

/** Shared options accepted by both single + batch resolvers. */
export type EnrichedPlayerOptions = {
  /** Pre-fetched Sleeper meta. Resolver fetches via `resolvePlayers` when absent. */
  playersMap?: Map<string, SleeperPlayer>;
  /** Pre-fetched FantasyCalc values. Resolver fetches via `resolvePlayerValues` when absent. */
  valueMap?: Map<string, PlayerValue>;
  /**
   * Lighter-weight value source for surfaces that already have a
   * value-by-id JSON map (e.g. the hub's `playerValuesByIdJson`).
   * Consulted only when `valueMap` is absent. Returns the normalized
   * 0-100 value for a player_id, or null when not in the map.
   */
  valueLookup?: (player_id: string) => number | null;
  /** Pre-fetched `player_signals` map. Resolver fetches via `getPlayerSignalsMap` when absent. */
  playerSignalsMap?: Map<string, PlayerSignalsRowWide>;
  /** Pre-fetched `team_signals` map. Resolver fetches via `getTeamSignalsMap` when absent. */
  teamSignalsMap?: Map<string, TeamSignalsRow>;
  /** Pre-fetched `player_health` map. Resolver fetches via `getPlayerHealthMap` when absent. */
  playerHealthMap?: Map<string, PlayerHealthRow>;
  /** Prior-season /stats map keyed by player_id (used for inflection workload + opportunity). */
  prevSeasonStats?: Map<string, PlayerSeasonStats>;
  /** Season-before /stats map keyed by player_id (used for inflection two-year trend). */
  prevPrevSeasonStats?: Map<string, PlayerSeasonStats>;
  /** Career carries + targets sums per player_id (RB mileage signal). */
  careerUsage?: Map<string, { carries: number; targets: number }>;
  /**
   * NFL overall draft pick per player_id. When absent, the resolver
   * falls back to `signals.draft_pick_no` from the wide signals row,
   * then to `getDraftPickMap()` (cached).
   */
  draftPickByPlayerId?: Map<string, number>;
  /**
   * League-wide rostered humans used to build the same-team-same-position
   * groupings inflection needs. When absent, inflection inputs for skill
   * positions still resolve but `same_team_same_position` is empty
   * (graceful: the inflection model degrades to base-rate signals only).
   */
  rosterContext?: HumanPlayer[];
  /**
   * FantasyCalc format args used to fetch `valueMap` when no map / lookup
   * is provided. Optional: when absent and no other value source is set,
   * `value` resolves to null with a `not_provided` flag.
   */
  valueFormat?: {
    isSuperflex: boolean;
    isPpr: boolean;
    isHalfPpr: boolean;
    isTePremium?: boolean;
  };
  /** ADP lookup. Returns null when this player's ADP is not available. */
  adpLookup?: (player_id: string) => number | null;
};

export type EnrichedPlayerBatchArgs = EnrichedPlayerOptions & {
  playerIds: readonly string[];
};

const SKILL_POSITIONS: ReadonlySet<Position> = new Set([
  "QB",
  "RB",
  "WR",
  "TE",
]);

/** Build a (team:position) -> HumanPlayer[] index from a league-wide roster. */
function buildTeamPosIndex(
  rosterContext: HumanPlayer[],
): Map<string, HumanPlayer[]> {
  const out = new Map<string, HumanPlayer[]>();
  for (const p of rosterContext) {
    if (!p.team || !p.position) continue;
    const key = `${p.team}:${p.position.toUpperCase()}`;
    const arr = out.get(key);
    if (arr) arr.push(p);
    else out.set(key, [p]);
  }
  return out;
}

/**
 * Resolve a batch of player_ids into EnrichedPlayer rows. Single
 * fetch per data source (or no fetch when the caller pre-provides
 * the map). The hub + Coach call this; the per-player wrapper
 * delegates to it.
 */
export async function resolveEnrichedPlayers(
  args: EnrichedPlayerBatchArgs,
): Promise<Map<string, EnrichedPlayer>> {
  const out = new Map<string, EnrichedPlayer>();
  if (args.playerIds.length === 0) return out;

  const ids = [...new Set(args.playerIds)];

  // 1. Sleeper meta. The identity backbone. A player_id with no
  //    sleeper row is unknown to us; we omit it from the map.
  const playersMap =
    args.playersMap ?? (await resolvePlayers(ids));

  // 2. FantasyCalc values. Three resolution paths in priority order:
  //    pre-fetched valueMap > valueLookup > a fetch via resolvePlayerValues
  //    when valueFormat is supplied. When none of the three resolves a
  //    player, `value` stays null with a not_provided / not_acquired flag.
  let valueMap: Map<string, PlayerValue> | null = args.valueMap ?? null;
  if (!valueMap && !args.valueLookup && args.valueFormat) {
    valueMap = await resolvePlayerValues({
      ids,
      isSuperflex: args.valueFormat.isSuperflex,
      isPpr: args.valueFormat.isPpr,
      isHalfPpr: args.valueFormat.isHalfPpr,
      isTePremium: args.valueFormat.isTePremium,
    });
  }
  const valueSourceProvided =
    valueMap !== null || typeof args.valueLookup === "function";

  // 3. Per-player and per-team signals. Already 24h-cached behind the
  //    canonical getters; pre-fetched maps short-circuit.
  const playerSignalsMap =
    args.playerSignalsMap ?? (await getPlayerSignalsMap());
  const teamSignalsMap =
    args.teamSignalsMap ?? (await getTeamSignalsMap());

  // 4. Health. Empty in production today; the loader is cheap (one
  //    select against an empty table) and the cache survives the
  //    table being empty so subsequent calls don't re-hit. We also
  //    note whether the table is empty (table_empty vs row_missing).
  const playerHealthMap =
    args.playerHealthMap ?? (await getPlayerHealthMap());
  const healthTableEmpty = args.playerHealthMap
    ? args.playerHealthMap.size === 0
    : await isPlayerHealthTableEmpty();

  // 5. Draft capital. Prefer the explicit map; fall back to the
  //    canonical getDraftPickMap (cached) so per-player surfaces
  //    don't need to know about the upstream signal table.
  const draftPickByPlayerId =
    args.draftPickByPlayerId ?? (await getDraftPickMap());

  // 6. Same-team-same-position index from the optional roster context.
  //    Without it, inflection same_team_same_position is empty (the
  //    successor / position-room signals degrade to neutral).
  const teamPosIndex = args.rosterContext
    ? buildTeamPosIndex(args.rosterContext)
    : null;

  for (const id of ids) {
    const sp = playersMap.get(id);
    if (!sp) continue; // unknown to Sleeper: omit, don't fabricate.

    const human = humanize(sp);
    const position = normalizePosition(human.position);
    const missing: MissingFieldFlag[] = [];

    // Market value resolution.
    let valueNum: number | null = null;
    let overallRank: number | null = null;
    let positionRank: number | null = null;
    if (valueMap) {
      const v = valueMap.get(id);
      if (v) {
        valueNum = v.value;
        overallRank = v.overall_rank;
        positionRank = v.position_rank;
      }
    }
    if (valueNum == null && args.valueLookup) {
      const v = args.valueLookup(id);
      if (typeof v === "number") valueNum = v;
    }
    if (valueNum == null) {
      missing.push({
        field: "value",
        reason: valueSourceProvided ? "not_acquired" : "not_provided",
        consumer_impact: valueSourceProvided
          ? "no FantasyCalc match for this player; trade-pricing math has no anchor"
          : "no value source provided; rubric runs without market prior",
      });
    }

    // ADP resolution.
    let adp: number | null = null;
    if (args.adpLookup) {
      const a = args.adpLookup(id);
      if (typeof a === "number") adp = a;
    }
    if (adp == null) {
      missing.push({
        field: "adp",
        reason: args.adpLookup ? "not_acquired" : "not_provided",
        consumer_impact: args.adpLookup
          ? "no ADP variant carries this player; rubric falls back to search_rank prior"
          : "no ADP lookup provided; rubric falls back to search_rank prior",
      });
    }

    // Per-player signals.
    const signals = playerSignalsMap.get(id) ?? null;
    if (!signals) {
      missing.push({
        field: "player_signals",
        reason: playerSignalsMap.size === 0 ? "table_empty" : "row_missing",
        consumer_impact:
          "rubric runs on Bayesian prior; no per-player signals (rb_role_tier, compounding_news_count, contract_year_flag, etc.) available",
      });
    } else {
      flagPlayerSignalNulls(missing, signals, position);
    }

    // Per-team signals.
    let teamSignals: TeamSignalsRow | null = null;
    if (human.team) {
      teamSignals = teamSignalsMap.get(human.team) ?? null;
      if (!teamSignals) {
        missing.push({
          field: "team_signals",
          reason: teamSignalsMap.size === 0 ? "table_empty" : "row_missing",
          consumer_impact:
            "rubric runs without team-context (scheme, OL grades, OC tenure, 12-personnel rate)",
        });
      } else {
        flagTeamSignalNulls(missing, teamSignals, position);
      }
    } else {
      missing.push({
        field: "player.team",
        reason: "column_null",
        consumer_impact:
          "Sleeper has no team for this player (pre-NFL-draft rookie or free agent); team_signals cannot resolve",
      });
    }

    // Health.
    const health = playerHealthMap.get(id) ?? null;
    if (!health) {
      missing.push({
        field: "player_health",
        reason: healthTableEmpty ? "table_empty" : "row_missing",
        consumer_impact: healthTableEmpty
          ? "player_health not yet ingested; rubric carries no injury-risk signal"
          : "no per-player health row; rubric carries no injury-risk signal for this player",
      });
    }

    // Inflection inputs (skill positions only).
    let inflectionInputs: InflectionInputs | null = null;
    if (position && SKILL_POSITIONS.has(position)) {
      const sameTeamSamePosition = teamPosIndex
        ? (
            teamPosIndex.get(`${human.team ?? ""}:${position}`) ?? []
          ).filter((p) => p.id !== human.id)
        : [];
      const prevStat = args.prevSeasonStats?.get(id);
      const prevPrevStat = args.prevPrevSeasonStats?.get(id);
      const career = args.careerUsage?.get(id);

      // Draft capital priority: explicit map > signals row > canonical.
      const draftPickOverall =
        draftPickByPlayerId.get(id) ??
        (typeof signals?.draft_pick_no === "number"
          ? signals.draft_pick_no
          : null);

      inflectionInputs = buildInflectionInputsFromHumanPlayer({
        player: human,
        sameTeamSamePosition,
        prevSeasonCarries: prevStat?.carries ?? null,
        prevSeasonTargets: prevStat?.targets ?? null,
        prevPrevSeasonCarries: prevPrevStat?.carries ?? null,
        prevPrevSeasonTargets: prevPrevStat?.targets ?? null,
        prevSeasonOpportunity: prevStat
          ? buildOpportunityProfile(prevStat)
          : null,
        prevPrevSeasonOpportunity: prevPrevStat
          ? buildOpportunityProfile(prevPrevStat)
          : null,
        careerCarries: career?.carries ?? null,
        careerTargets: career?.targets ?? null,
        draftPickOverall,
        compoundingNewsCount:
          typeof signals?.compounding_news_count === "number"
            ? signals.compounding_news_count
            : null,
      });

      // Flag the inflection-input gaps a consumer might trip over.
      if (!prevStat) {
        missing.push({
          field: "inflection_inputs.prev_season",
          reason: "not_provided",
          consumer_impact:
            "no prior-season /stats for this player; workload-trend + opportunity signals render data_missing",
        });
      }
      if (!career && position === "RB") {
        missing.push({
          field: "inflection_inputs.career_usage",
          reason: "not_provided",
          consumer_impact:
            "no career carries / targets sum for this RB; mileage signal + 1500-carry cliff trigger render data_missing",
        });
      }
      if (draftPickOverall == null && human.yearsExp === 0) {
        missing.push({
          field: "inflection_inputs.draft_pick_overall",
          reason: "not_acquired",
          consumer_impact:
            "no NFL draft pick for this rookie; rookie-debut card's draft-capital signal renders data_missing",
        });
      }
    } else {
      missing.push({
        field: "inflection_inputs",
        reason: "not_acquired",
        consumer_impact:
          position == null
            ? "player has no fantasy position; bifurcation engine does not model this player"
            : `${position} is not a bifurcation-modeled position (skill-only: QB/RB/WR/TE)`,
      });
    }

    out.set(id, {
      player_id: human.id,
      name: human.name,
      position,
      team: human.team,
      age: human.age,
      years_exp: human.yearsExp,
      search_rank:
        typeof sp.search_rank === "number" ? sp.search_rank : null,
      value: valueNum,
      ktc_value: valueNum,
      overall_rank: overallRank,
      position_rank: positionRank,
      adp,
      signals,
      team_signals: teamSignals,
      health,
      inflection_inputs: inflectionInputs,
      missing,
    });
  }

  return out;
}

/** Per-player wrapper. Delegates to the batch form so the contract stays one place. */
export async function resolveEnrichedPlayer(
  player_id: string,
  args: EnrichedPlayerOptions = {},
): Promise<EnrichedPlayer | null> {
  const batch = await resolveEnrichedPlayers({ ...args, playerIds: [player_id] });
  return batch.get(player_id) ?? null;
}

// Per-position null flagging.
//
// Flag the load-bearing per-player signal columns the position rubric
// READS today, when their value is null. The TRUTH_AUDIT (A2) named
// these by position. Reading a null column is allowed (the rubric
// already degrades to its Bayesian prior) but the consumer should
// KNOW which column was null so the surface can render an honest
// "prior-driven" caveat (`isRubricPriorDriven`).
//
// Kept small (the rubric's actual reads, not every column) so the
// `missing` list stays scannable. Phase D rubric-rewrite work expands
// this list when new signals come online.

function flagPlayerSignalNulls(
  missing: MissingFieldFlag[],
  row: PlayerSignalsRowWide,
  position: Position | null,
): void {
  const note = (field: string, impact: string): void => {
    missing.push({
      field: `player_signals.${field}`,
      reason: "column_null",
      consumer_impact: impact,
    });
  };

  if (position === "RB") {
    if (row.rb_role_tier == null) {
      note(
        "rb_role_tier",
        "RB rubric HARD GATE: classifier falls back to base-rate role read",
      );
    }
    if (row.rb_traded_offseason_flag == null) {
      note(
        "rb_traded_offseason_flag",
        "RB rubric: new-team uncertainty signal renders neutral",
      );
    }
  }

  // Compounding-news count is read by every position rubric as an
  // arbitrage trigger. The audit found the value populated everywhere
  // but always 0 (default), so absence here is rare; we flag a null
  // explicitly when it appears.
  if (row.compounding_news_count == null) {
    note(
      "compounding_news_count",
      "rubric arbitrage trigger (>=3 news events) cannot fire",
    );
  }

  if (row.contract_year_flag == null) {
    note(
      "contract_year_flag",
      "rubric carries no contract-year variance modifier",
    );
  }
}

/**
 * Flag the load-bearing team-signal columns the position rubric
 * reads today, when null. Same calibration rule as the per-player
 * version: list only what the rubric actually consumes, not every
 * column.
 */
function flagTeamSignalNulls(
  missing: MissingFieldFlag[],
  row: TeamSignalsRow,
  position: Position | null,
): void {
  const note = (field: string, impact: string): void => {
    missing.push({
      field: `team_signals.${field}`,
      reason: "column_null",
      consumer_impact: impact,
    });
  };

  if (position === "RB" && row.ol_continuity_score == null) {
    note(
      "ol_continuity_score",
      "RB rubric: OL continuity bonus / penalty cannot fire",
    );
  }

  if ((position === "WR" || position === "QB") && row.scheme_tag == null) {
    note(
      "scheme_tag",
      "rubric: scheme-specific bonuses (pass-heavy WR, late-round QB hit) cannot fire",
    );
  }

  if ((position === "QB" || position === "TE") && row.oc_tenure_yrs == null) {
    note(
      "oc_tenure_yrs",
      "rubric: OC continuity bonus cannot fire",
    );
  }

  if (
    (position === "QB" || position === "TE") &&
    row.oc_first_year_with_team_flag == null
  ) {
    note(
      "oc_first_year_with_team_flag",
      "rubric: new-OC variance modifier cannot fire",
    );
  }

  if (position === "TE" && row.personnel_12_rate == null) {
    note(
      "personnel_12_rate",
      "TE rubric: load-bearing 12-personnel usage signal cannot fire",
    );
  }

  if (position === "WR" && row.pass_rate_neutral == null) {
    note(
      "pass_rate_neutral",
      "WR rubric: team pass-rate bonus cannot fire",
    );
  }

  if (position === "QB" && row.ol_grade_pass == null) {
    note(
      "ol_grade_pass",
      "QB rubric: pass-protection grade cannot fire",
    );
  }
}
