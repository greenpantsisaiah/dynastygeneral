/**
 * League Read public API. Compute the in-draft trade-leverage and
 * strategic-position synthesis. Coach consumes via context; UI surface
 * deferred per founder's "redesign visualizations after model matures"
 * direction (2026-05-07).
 */

export { analyzeLeagueRead, type OpponentRosterSnapshot } from "./analyze";
export { buildLeagueReadFromSnapshot } from "./from-snapshot";
export type {
  LeagueRead,
  LeverageOpportunity,
  NamedAssetHint,
  StructuralConstraint,
  TradeWindowEstimate,
} from "./types";
