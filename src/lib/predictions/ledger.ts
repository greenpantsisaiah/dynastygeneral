/**
 * Prediction ledger helpers (pure, no IO). Row shape for the
 * `prediction_log` table (migration 0019) plus the `value_decay@v1`
 * shadow logger and its scorer.
 *
 * value_decay@v1: predicted 28-day change in a player's normalized
 * (0-100) value. The model is the canonical age curve (`ageRetention`),
 * applied as the ratio of retention one horizon ahead over retention now.
 * The baseline is "no change" (0). The model only earns trust if its
 * squared error beats the baseline's once outcomes resolve.
 *
 * The age curve is NOT re-derived here; it is `ageRetention` from
 * src/lib/players/age-curve.ts.
 */
import { ageRetention } from "@/lib/players/age-curve";

export const VALUE_DECAY_TYPE = "value_decay@v1";
export const VALUE_DECAY_HORIZON_DAYS = 28;
export const VALUE_DECAY_TOP_N = 400;

export type PredictionSubjectKind = "player" | "team" | "league" | "cohort";
export type PredictionSource = "shadow_weekly" | "surfaced_advice" | "cohort";

export type PredictionLogRow = {
  prediction_type: string;
  subject_kind: PredictionSubjectKind;
  subject_id: string;
  league_id: string | null;
  logged_at: string; // ISO timestamp
  resolve_after: string; // YYYY-MM-DD
  predicted: number;
  predicted_band: { p25: number; p75: number } | null;
  baseline_predicted: number;
  inputs: Record<string, unknown>;
  source: PredictionSource;
};

export type ValueDecayInput = {
  player_id: string;
  position: string | null;
  age: number | null;
  /** FantasyCalc-normalized 0-100 value, read through the value seam. */
  value: number;
  name?: string;
};

function addDaysISODate(d: Date, days: number): string {
  const out = new Date(d.getTime() + days * 86_400_000);
  return out.toISOString().slice(0, 10);
}

/**
 * Top-N players by value -> value_decay@v1 shadow rows. Players with no
 * age or a non-skill position are skipped (the curve has no opinion, so
 * logging a 0 prediction would fake a model call).
 */
export function buildValueDecayShadowRows(args: {
  values: readonly ValueDecayInput[];
  loggedAt: Date;
  topN?: number;
  snapshotSource?: string;
}): PredictionLogRow[] {
  const topN = args.topN ?? VALUE_DECAY_TOP_N;
  const horizonYears = VALUE_DECAY_HORIZON_DAYS / 365;
  const snapshotDate = args.loggedAt.toISOString().slice(0, 10);
  const ranked = [...args.values]
    .filter((v) => Number.isFinite(v.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);

  const rows: PredictionLogRow[] = [];
  for (const v of ranked) {
    if (v.age == null || !v.position) continue;
    const now = ageRetention(v.position, v.age);
    const ahead = ageRetention(v.position, v.age + horizonYears);
    // Position with no curve returns 1.0 for both: no opinion, skip.
    if (!(now > 0)) continue;
    const isSkill = ["QB", "RB", "WR", "TE"].includes(v.position.toUpperCase());
    if (!isSkill) continue;
    const predicted = v.value * (ahead / now - 1);
    rows.push({
      prediction_type: VALUE_DECAY_TYPE,
      subject_kind: "player",
      subject_id: v.player_id,
      league_id: null,
      logged_at: args.loggedAt.toISOString(),
      resolve_after: addDaysISODate(args.loggedAt, VALUE_DECAY_HORIZON_DAYS),
      predicted,
      predicted_band: null,
      baseline_predicted: 0,
      inputs: {
        position: v.position,
        age: v.age,
        value_at_log: v.value,
        retention_now: now,
        retention_ahead: ahead,
        horizon_days: VALUE_DECAY_HORIZON_DAYS,
        source: args.snapshotSource ?? "value_seam:fantasycalc_normalized_0_100",
        snapshot_date: snapshotDate,
      },
      source: "shadow_weekly",
    });
  }
  return rows;
}

export type ValueDecayScore = {
  actual_delta: number;
  model_sq_err: number;
  baseline_sq_err: number;
  model_beats_baseline: boolean;
};

/**
 * Score one resolved row. `realizedValue` is the player's value on the
 * resolve date (same 0-100 scale as `inputs.value_at_log`).
 */
export function scoreValueDecayRow(
  row: Pick<PredictionLogRow, "predicted" | "baseline_predicted" | "inputs">,
  realizedValue: number,
): ValueDecayScore {
  const valueAtLog = Number(row.inputs.value_at_log);
  if (!Number.isFinite(valueAtLog)) {
    throw new Error("value_decay row missing inputs.value_at_log");
  }
  const actual = realizedValue - valueAtLog;
  const model = (row.predicted - actual) ** 2;
  const baseline = (row.baseline_predicted - actual) ** 2;
  return {
    actual_delta: actual,
    model_sq_err: model,
    baseline_sq_err: baseline,
    model_beats_baseline: model < baseline,
  };
}
