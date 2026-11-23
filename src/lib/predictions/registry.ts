/**
 * Prediction registry (stats steward, reviewed like code).
 *
 * Every number the product shows a user is a prediction. Each prediction
 * TYPE is registered here before it ships: the theory and its sources, the
 * exact metric, when and how it resolves, the baseline it must beat, the
 * success bar (written BEFORE any data is seen), and a status on the ladder
 * hypothesis -> provisional -> validated -> retired.
 *
 * Rules:
 * - Only the stats steward changes `status`, and only with evidence in
 *   `status_evidence` (a lab note or ledger query). Never move a bar after
 *   seeing data: a new bar is a new `version`.
 * - Rows are logged to the `prediction_log` ledger (migration pending,
 *   red tier). Until the ledger exists, every type below is `hypothesis`.
 * - Planned enforcement: the product may only show a number whose type is
 *   registered here (CI check requested from an engineer, modelled on the
 *   canonical-source lints in evals/anti-patterns.test.ts).
 *
 * Sources cite RESEARCH_CORPUS.md entries by name.
 */

export type PredictionStatus =
  | "hypothesis"
  | "provisional"
  | "validated"
  | "retired";

export type ScoringRule = "brier" | "log_loss" | "rmse" | "spearman" | "hit_rate";

export interface PredictionType {
  /** `<name>@v<N>`; a changed bar or metric is a new version. */
  id: string;
  title: string;
  /** Why we expect this to be predictive, with corpus sources. */
  theory: string;
  sources: string[];
  /** Exact quantity predicted, with units and range. */
  metric: string;
  /** When a logged row resolves and what outcome it is scored against. */
  resolution_rule: string;
  /** The naive prediction logged at the same moment for comparison. */
  baseline: string;
  scoring: ScoringRule[];
  /** Pre-registered bar to move hypothesis -> provisional -> validated. */
  success_bar: { provisional: string; validated: string };
  /** How rows get into the ledger. */
  logging: Array<"shadow_weekly" | "surfaced_advice" | "cohort">;
  status: PredictionStatus;
  /** Date (YYYY-MM-DD) the success bar was written. Must predate any scored row. */
  bar_registered: string;
  /** Link to the lab note or query that justified the current status. Empty for hypothesis. */
  status_evidence: string;
  /** Known gaps, open questions, or why this type is not yet computable. */
  notes?: string;
}

export const PREDICTION_TYPES: PredictionType[] = [
  {
    id: "playoff_odds@v1",
    title: "P(playoffs): probability a team makes its league's playoffs this season",
    theory:
      "Season outcomes are points-for driven with large weekly variance. Simulating the remaining schedule from each roster's projected weekly points (mean and spread) should beat a standings-only read, because standings early in the season are mostly noise while roster strength is persistent.",
    sources: [
      "Brier 1950 (strictly proper scoring rule)",
      "DRatings, Log Loss vs. Brier Score",
      "FiveThirtyEight, How Well Did Our Sports Predictions Hold Up (public Brier benchmark range)",
    ],
    metric:
      "Probability in [0, 1] that the team holds a playoff seed at regular-season end, per league settings (playoff_teams, tiebreak by points-for).",
    resolution_rule:
      "Resolves the day after the league's final regular-season week (Sleeper settings.playoff_week_start - 1). Outcome 1 if the roster is seeded into the winners bracket, else 0.",
    baseline:
      "Standings-proportional: current win% rank mapped to playoff_teams / total_teams, with ties broken by points-for. Before week 1, the base rate playoff_teams / total_teams.",
    scoring: ["brier", "log_loss"],
    success_bar: {
      provisional:
        "Over at least 200 resolved team-seasons from at least 20 leagues, Brier lower than baseline with the paired bootstrap 90% CI of the difference excluding zero.",
      validated:
        "Over at least 600 resolved team-seasons across two seasons, Brier skill score vs baseline >= 0.05 with 95% CI excluding zero, AND reliability: every decile bin with n >= 30 within 10 percentage points of observed frequency.",
    },
    logging: ["shadow_weekly", "surfaced_advice"],
    status: "hypothesis",
    bar_registered: "2026-11-23",
    status_evidence: "",
    notes:
      "No canonical computes this yet. Needs a weekly-points projection per roster and a schedule simulator; register the simulator in CANONICAL_SOURCES.md when built.",
  },
  {
    id: "title_odds@v1",
    title: "P(title): probability a team wins its league championship this season",
    theory:
      "Same simulator as playoff_odds, run through the playoff bracket. Title odds are concentrated in the top of the points distribution, so a roster-strength model should separate favorites better than standings.",
    sources: ["Brier 1950", "DRatings, Log Loss vs. Brier Score"],
    metric: "Probability in [0, 1] that the team wins the winners-bracket final.",
    resolution_rule:
      "Resolves the day after the league's championship week. Outcome 1 for the champion roster, else 0.",
    baseline:
      "Uniform over current playoff-position teams: 1 / playoff_teams for teams currently in a playoff seat, 0 otherwise. Before week 1, 1 / total_teams.",
    scoring: ["brier", "log_loss"],
    success_bar: {
      provisional:
        "Over at least 200 resolved team-seasons from at least 20 leagues, log loss lower than baseline with the paired bootstrap 90% CI of the difference excluding zero.",
      validated:
        "Over at least 600 resolved team-seasons across two seasons, log-loss skill vs baseline >= 0.03 with 95% CI excluding zero, and the summed predicted titles per league within 0.05 of 1.0 on every logged snapshot.",
    },
    logging: ["shadow_weekly", "surfaced_advice"],
    status: "hypothesis",
    bar_registered: "2026-11-23",
    status_evidence: "",
    notes: "Rare-event outcome (1 per league per season): expect wide intervals; do not surface as a headline number before provisional.",
  },
  {
    id: "title_odds_delta@v1",
    title: "Delta title odds: change in P(title) a proposed move (trade, add, lineup) causes",
    theory:
      "Contend-or-sell advice is a claim that a move shifts title odds. The delta is the title_odds simulator run on the roster with and without the move.",
    sources: ["Brier 1950"],
    metric:
      "Signed difference in percentage points: P(title | move) minus P(title | no move), at the moment of advice.",
    resolution_rule:
      "Not directly observable (the counterfactual roster never plays). Scored as a cohort: each surfaced delta logs both P(title) values; when the season resolves, the ACTED branch is scored as a title_odds row, and cohorts of moves with predicted delta above +X are compared to matched non-acting teams.",
    baseline: "Zero: the move does not change title odds.",
    scoring: ["brier"],
    success_bar: {
      provisional:
        "title_odds@v1 has reached provisional (the delta is only as good as the simulator).",
      validated:
        "title_odds@v1 validated AND, over at least 100 acted moves with predicted delta >= +3 points, realized title rate of acting teams exceeds matched non-acting teams with 90% CI excluding zero.",
    },
    logging: ["surfaced_advice", "cohort"],
    status: "hypothesis",
    bar_registered: "2026-11-23",
    status_evidence: "",
    notes: "Gated on title_odds@v1. Never show a delta without the two underlying probabilities on tap.",
  },
  {
    id: "value_decay@v1",
    title: "Value decay D: expected change in a player's market value over the next 4 weeks",
    theory:
      "Contend-or-sell trades trade future value for present points. Age-curve research (RESEARCH_CORPUS age section) says older players at the shoulder of their position curve lose market value faster; ageRetention (src/lib/players/age-curve.ts) is the canonical curve. Market value is close to a random walk, so the bar is beating no-change.",
    sources: [
      "RESEARCH_CORPUS.md age-curve section (Apex peak-age series, Northwestern 2020 RB)",
      "De Bondt and Thaler 1985 (overreaction and mean reversion)",
      "negative-results.md (prior signals failed to beat the market)",
    ],
    metric:
      "Predicted change in FantasyCalc normalized value (0 to 100 scale) from the log date to log date + 28 days, for the top 400 players by value.",
    resolution_rule:
      "Resolves 28 days after logging against the FantasyCalc snapshot nearest that date (within 3 days, else the row is voided, not scored).",
    baseline: "No change (random walk): predicted delta 0.",
    scoring: ["rmse", "spearman"],
    success_bar: {
      provisional:
        "Over at least 8 weekly cohorts x 400 players, RMSE lower than no-change with paired bootstrap 90% CI excluding zero, AND Spearman(predicted, realized) > 0 with 90% CI excluding zero.",
      validated:
        "Over at least 26 weekly cohorts spanning an offseason, RMSE reduction >= 3% vs no-change with 95% CI excluding zero.",
    },
    logging: ["shadow_weekly"],
    status: "hypothesis",
    bar_registered: "2026-11-23",
    status_evidence: "",
    notes:
      "Expect this to be hard: every Phase B ranking signal failed to beat the market (MODEL_LIVE_PLAN value-pipe deviation). Logging it is still cheap and the honest outcome either way.",
  },
  {
    id: "contender_premium@v1",
    title: "Contender premium: extra value a contending team should pay for present points",
    theory:
      "A team near the title line gains more title probability per point than a rebuilding team, so it should rationally pay above market for win-now pieces. We have no estimate yet.",
    sources: [],
    metric:
      "Value points (0 to 100 scale) above market a contender should pay per +1 point of title_odds. LABELLED 0 AND UNKNOWN: the product uses 0 until title_odds_delta@v1 is provisional.",
    resolution_rule:
      "Not resolvable until title_odds_delta@v1 has data; then estimated from realized title-odds gains per value point traded.",
    baseline: "0 (no premium; pay market).",
    scoring: ["rmse"],
    success_bar: {
      provisional: "title_odds_delta@v1 provisional and a nonzero premium estimate with 90% CI excluding zero.",
      validated: "title_odds_delta@v1 validated and the premium estimate stable (CI overlap) across two seasons.",
    },
    logging: ["cohort"],
    status: "hypothesis",
    bar_registered: "2026-11-23",
    status_evidence: "",
    notes: "Any copy that implies a contender should overpay is an unsupported claim until this leaves hypothesis.",
  },
];

const ID_RE = /^[a-z][a-z0-9_]*@v[1-9][0-9]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns a list of rule violations; empty means the registry is well formed. */
export function validatePredictionRegistry(types: PredictionType[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const t of types) {
    if (!ID_RE.test(t.id)) errors.push(`${t.id}: id must look like name@vN`);
    if (seen.has(t.id)) errors.push(`${t.id}: duplicate id`);
    seen.add(t.id);
    for (const k of ["title", "theory", "metric", "resolution_rule", "baseline"] as const) {
      if (!t[k] || t[k].trim().length < 10) errors.push(`${t.id}: ${k} missing or too short`);
    }
    if (t.scoring.length === 0) errors.push(`${t.id}: no scoring rule`);
    if (!t.success_bar.provisional || !t.success_bar.validated)
      errors.push(`${t.id}: success bar must state both provisional and validated`);
    if (t.logging.length === 0) errors.push(`${t.id}: no logging path`);
    if (!DATE_RE.test(t.bar_registered)) errors.push(`${t.id}: bar_registered must be YYYY-MM-DD`);
    if (t.status !== "hypothesis" && t.status_evidence.trim() === "")
      errors.push(`${t.id}: status ${t.status} requires status_evidence`);
    if (t.status !== "hypothesis" && t.sources.length === 0)
      errors.push(`${t.id}: status ${t.status} requires at least one source`);
  }
  return errors;
}

export function predictionType(id: string): PredictionType | undefined {
  return PREDICTION_TYPES.find((t) => t.id === id);
}
