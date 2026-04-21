import { z } from "zod";

export const sleeperUserSchema = z.object({
  user_id: z.string(),
  username: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar: z.string().nullable().optional(),
});
export type SleeperUser = z.infer<typeof sleeperUserSchema>;

const leagueSettingsSchema = z
  .object({
    type: z.number().optional(),
    num_teams: z.number().optional(),
    playoff_week_start: z.number().optional(),
    taxi_slots: z.number().optional(),
    taxi_years: z.number().optional(),
    trade_deadline: z.number().optional(),
    waiver_type: z.number().optional(),
    best_ball: z.number().optional(),
  })
  .passthrough();

export const sleeperLeagueSchema = z
  .object({
    league_id: z.string(),
    name: z.string(),
    season: z.string(),
    season_type: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    sport: z.string().nullable().optional(),
    total_rosters: z.number().nullable().optional(),
    previous_league_id: z.string().nullable().optional(),
    draft_id: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    settings: leagueSettingsSchema.nullable().optional(),
    scoring_settings: z.record(z.string(), z.number()).nullable().optional(),
    roster_positions: z.array(z.string()).nullable().optional(),
  })
  .passthrough();
export type SleeperLeague = z.infer<typeof sleeperLeagueSchema>;

export const sleeperRosterSchema = z
  .object({
    roster_id: z.number(),
    league_id: z.string(),
    owner_id: z.string().nullable(),
    co_owners: z.array(z.string()).nullable().optional(),
    players: z.array(z.string()).nullable().optional(),
    starters: z.array(z.string()).nullable().optional(),
    reserve: z.array(z.string()).nullable().optional(),
    taxi: z.array(z.string()).nullable().optional(),
    settings: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough();
export type SleeperRoster = z.infer<typeof sleeperRosterSchema>;

export const sleeperLeagueUserSchema = z
  .object({
    user_id: z.string(),
    display_name: z.string().nullable(),
    avatar: z.string().nullable().optional(),
    is_owner: z.boolean().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough();
export type SleeperLeagueUser = z.infer<typeof sleeperLeagueUserSchema>;

export const sleeperMatchupSchema = z
  .object({
    roster_id: z.number(),
    matchup_id: z.number().nullable(),
    points: z.number().nullable(),
    starters: z.array(z.string()).nullable().optional(),
    players: z.array(z.string()).nullable().optional(),
  })
  .passthrough();
export type SleeperMatchup = z.infer<typeof sleeperMatchupSchema>;

export const sleeperTransactionSchema = z
  .object({
    transaction_id: z.string(),
    type: z.string(),
    status: z.string(),
    roster_ids: z.array(z.number()).nullable().optional(),
    adds: z.record(z.string(), z.number()).nullable().optional(),
    drops: z.record(z.string(), z.number()).nullable().optional(),
    draft_picks: z
      .array(
        z
          .object({
            season: z.string(),
            round: z.number(),
            roster_id: z.number(),
            previous_owner_id: z.number(),
            owner_id: z.number(),
          })
          .passthrough(),
      )
      .nullable()
      .optional(),
    created: z.number().nullable().optional(),
  })
  .passthrough();
export type SleeperTransaction = z.infer<typeof sleeperTransactionSchema>;

export const sleeperTradedPickSchema = z
  .object({
    season: z.string(),
    round: z.number(),
    roster_id: z.number(),
    previous_owner_id: z.number(),
    owner_id: z.number(),
  })
  .passthrough();
export type SleeperTradedPick = z.infer<typeof sleeperTradedPickSchema>;

export const sleeperDraftSchema = z
  .object({
    draft_id: z.string(),
    league_id: z.string().nullable(),
    type: z.string(),
    status: z.string(),
    season: z.string(),
    season_type: z.string().nullable().optional(),
    start_time: z.number().nullable().optional(),
    settings: z.record(z.string(), z.unknown()).nullable().optional(),
    draft_order: z.record(z.string(), z.number()).nullable().optional(),
    slot_to_roster_id: z.record(z.string(), z.number()).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough();
export type SleeperDraft = z.infer<typeof sleeperDraftSchema>;

export const sleeperDraftPickSchema = z
  .object({
    round: z.number(),
    pick_no: z.number(),
    roster_id: z.number().nullable(),
    player_id: z.string().nullable(),
    picked_by: z.string().nullable(),
    is_keeper: z.boolean().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough();
export type SleeperDraftPick = z.infer<typeof sleeperDraftPickSchema>;

export const nflStateSchema = z
  .object({
    season: z.string(),
    season_type: z.string(),
    week: z.number(),
    display_week: z.number().nullable().optional(),
    previous_season: z.string().nullable().optional(),
  })
  .passthrough();
export type NflState = z.infer<typeof nflStateSchema>;

export const sleeperPlayerSchema = z
  .object({
    player_id: z.string(),
    full_name: z.string().nullable().optional(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    position: z.string().nullable().optional(),
    team: z.string().nullable().optional(),
    age: z.number().nullable().optional(),
    years_exp: z.number().nullable().optional(),
    status: z.string().nullable().optional(),
    injury_status: z.string().nullable().optional(),
    fantasy_positions: z.array(z.string()).nullable().optional(),
    search_rank: z.number().nullable().optional(),
  })
  .passthrough();
export type SleeperPlayer = z.infer<typeof sleeperPlayerSchema>;
