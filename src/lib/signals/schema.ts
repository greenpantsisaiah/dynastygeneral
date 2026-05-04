/**
 * Signal-table types + enum domains. Mirrors the SQL schema in
 * 0009_signals.sql; used by the admin UI and the (future)
 * EvaluationEngine to read/write signals consistently.
 *
 * Server-side only. End users do not read raw signals; they read
 * evaluation output via evaluate(). See MODEL_CARD section 3.9 and
 * BUILD_PLAN section 0.1 for the schema's place in the architecture.
 */

export const SCHEME_TAGS = [
  "shanahan",
  "mcvay",
  "reid",
  "air_raid",
  "spread",
  "pro_style",
  "west_coast",
  "erhardt_perkins",
  "other",
] as const;
export type SchemeTag = (typeof SCHEME_TAGS)[number];

export const HC_BACKGROUND_TAGS = [
  "offensive_coordinator",
  "defensive_coordinator",
  "college",
  "position_coach",
  "other",
] as const;
export type HcBackgroundTag = (typeof HC_BACKGROUND_TAGS)[number];

export const RB_ROLE_TIERS = [
  "lead_back",
  "bellcow",
  "strict_bellcow",
  "committee_member",
  "passdown",
  "starter_uncertain",
] as const;
export type RbRoleTier = (typeof RB_ROLE_TIERS)[number];

export const RB_NEW_TEAM_PROFILES = [
  "featured",
  "committee",
  "passdown_complement",
] as const;
export type RbNewTeamProfile = (typeof RB_NEW_TEAM_PROFILES)[number];

export type TeamSignalsRow = {
  team: string;
  ol_continuity_score: number | null;
  ol_grade_run: number | null;
  ol_grade_pass: number | null;
  rookie_ol_starters_count: number;
  rookie_ol_position_breakdown: {
    tackles?: number;
    guards?: number;
    centers?: number;
  };
  hc_id: string | null;
  hc_first_time_flag: boolean | null;
  hc_tenure_yrs: number | null;
  hc_background_tag: HcBackgroundTag | null;
  oc_id: string | null;
  oc_tenure_yrs: number | null;
  oc_first_year_with_team_flag: boolean | null;
  scheme_tag: SchemeTag | null;
  staff_novelty_composite: number;
  scheme_pace: number | null;
  pass_rate_neutral: number | null;
  personnel_12_rate: number | null;
  last_updated: string;
  updated_by: string | null;
};

export type PlayerSignalsRow = {
  player_id: string;
  position: string | null;
  team: string | null;
  age: number | null;
  rb_role_tier: RbRoleTier | null;
  rb_traded_offseason_flag: boolean | null;
  rb_role_at_new_team_projected: RbNewTeamProfile | null;
  rb_passdown_share_prior_year: number | null;
  compounding_news_count: number;
  contract_years_remaining: number | null;
  recent_extension_flag: boolean | null;
  contract_year_flag: boolean | null;
  weight_lb: number | null;
  height_in: number | null;
  last_updated: string;
  updated_by: string | null;
};

// Manual-coding-relevant fields per table. The admin UI presents
// these as editable cells; the rest are populated by automated
// scrapers (see BUILD_PLAN Phase 1.1) and read-only on the admin
// surface.
export const TEAM_MANUAL_FIELDS = [
  "scheme_tag",
  "hc_id",
  "hc_first_time_flag",
  "hc_tenure_yrs",
  "hc_background_tag",
  "oc_id",
  "oc_tenure_yrs",
  "oc_first_year_with_team_flag",
  "rookie_ol_starters_count",
  "staff_novelty_composite",
] as const satisfies readonly (keyof TeamSignalsRow)[];

export const PLAYER_MANUAL_FIELDS = [
  "rb_role_tier",
  "rb_traded_offseason_flag",
  "rb_role_at_new_team_projected",
  "compounding_news_count",
  "contract_year_flag",
  "recent_extension_flag",
] as const satisfies readonly (keyof PlayerSignalsRow)[];

// All 32 NFL teams (Sleeper team codes). Used to seed the admin
// teams table when the row doesn't exist yet.
export const NFL_TEAMS = [
  "ARI",
  "ATL",
  "BAL",
  "BUF",
  "CAR",
  "CHI",
  "CIN",
  "CLE",
  "DAL",
  "DEN",
  "DET",
  "GB",
  "HOU",
  "IND",
  "JAX",
  "KC",
  "LAC",
  "LAR",
  "LV",
  "MIA",
  "MIN",
  "NE",
  "NO",
  "NYG",
  "NYJ",
  "PHI",
  "PIT",
  "SEA",
  "SF",
  "TB",
  "TEN",
  "WAS",
] as const;
export type NflTeam = (typeof NFL_TEAMS)[number];
