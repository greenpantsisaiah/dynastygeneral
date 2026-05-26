/**
 * Companion expectation ledger storage (Principle 13). The durable half
 * of the emotional-ROI loop: it persists what the engine expected at a
 * decision moment so the companion can react when the outcome lands.
 *
 * Pure storage. The caller orchestrates the loop:
 *   1. readOpenExpectations(...) to get unresolved bets
 *   2. reconcileExpectations(records, resolutions) (in companion/classify)
 *      to stamp outcomes and produce beats
 *   3. upsertExpectation(...) to persist each now-resolved record
 *
 * Server-only (Supabase, RLS-scoped by auth.uid()). Mirrors the
 * opponent-notes storage pattern. The domain shape is ExpectationRecord
 * in src/lib/strategy/companion/types.ts; the table is migration 0015.
 */

import { createClient } from "@/lib/supabase/server";
import type {
  ExpectationHorizon,
  ExpectationKind,
  ExpectationMetric,
  ExpectationOutcome,
  ExpectationRecord,
} from "@/lib/strategy/companion/types";

const PER_LEAGUE_FETCH_LIMIT = 200;

const KINDS: readonly ExpectationKind[] = [
  "pick",
  "survival",
  "lineup",
  "matchup",
  "play",
];
const METRICS: readonly ExpectationMetric[] = [
  "ev",
  "win_prob",
  "survival_pct",
  "points",
];
const HORIZONS: readonly ExpectationHorizon[] = [
  "next_pick",
  "this_week",
  "this_season",
];
const OUTCOMES: readonly ExpectationOutcome[] = [
  "confirmed",
  "variance_loss",
  "process_error",
  "neutral",
];

/**
 * Read expectations for a (user, league) pair, newest first. `onlyOpen`
 * restricts to unresolved bets (the common case: reconcile against fresh
 * data). Returns up to PER_LEAGUE_FETCH_LIMIT rows.
 */
export async function readExpectations(args: {
  userId: string;
  leagueId: string;
  onlyOpen?: boolean;
}): Promise<ExpectationRecord[]> {
  const supabase = await createClient();
  let query = supabase
    .from("expectations")
    .select("*")
    .eq("user_id", args.userId)
    .eq("league_id", args.leagueId);
  if (args.onlyOpen) query = query.eq("resolved", false);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(PER_LEAGUE_FETCH_LIMIT);
  if (error) {
    console.error("[companion:ledger:read]", error.message);
    return [];
  }
  return (data ?? []).map(toExpectationRecord);
}

/** Convenience wrapper for the reconcile path. */
export function readOpenExpectations(args: {
  userId: string;
  leagueId: string;
}): Promise<ExpectationRecord[]> {
  return readExpectations({ ...args, onlyOpen: true });
}

/**
 * Insert or update a record (idempotent on the (user, league, bet_id)
 * unique key). Used both to LOAD a new expectation and to PERSIST a
 * reconciled one (resolved + outcome stamped).
 */
export async function upsertExpectation(args: {
  userId: string;
  record: ExpectationRecord;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("expectations")
    .upsert(expectationToRow(args.userId, args.record), {
      onConflict: "user_id,league_id,bet_id",
    });
  if (error) {
    console.error("[companion:ledger:upsert]", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Persist a batch of reconciled records (best-effort, per row). */
export async function persistResolved(args: {
  userId: string;
  records: ExpectationRecord[];
}): Promise<{ ok: boolean; persisted: number }> {
  let persisted = 0;
  for (const record of args.records) {
    const res = await upsertExpectation({ userId: args.userId, record });
    if (res.ok) persisted += 1;
  }
  return { ok: persisted === args.records.length, persisted };
}

function expectationToRow(
  userId: string,
  r: ExpectationRecord,
): Record<string, unknown> {
  return {
    user_id: userId,
    league_id: r.league_id,
    bet_id: r.bet_id,
    kind: r.kind,
    created_at_pick_no: r.created_at_pick_no,
    created_at_week: r.created_at_week,
    subject_player_id: r.subject_player_id,
    subject_label: r.subject_label,
    expected_metric: r.expected_metric,
    expected_value: r.expected_value,
    expected_ci_low: r.expected_ci_low ?? null,
    expected_ci_high: r.expected_ci_high ?? null,
    alternative_label: r.alternative_label ?? null,
    alternative_value: r.alternative_value ?? null,
    alternative_player_id: r.alternative_player_id ?? null,
    thesis: r.thesis ?? null,
    resolution_condition: r.resolution_condition,
    horizon: r.horizon,
    resolved: r.resolved,
    resolved_value: r.resolved_value ?? null,
    outcome: r.outcome ?? null,
    resolved_at: r.resolved_at ?? null,
  };
}

function toExpectationRecord(row: Record<string, unknown>): ExpectationRecord {
  return {
    bet_id: String(row.bet_id),
    league_id: String(row.league_id),
    kind: oneOf(row.kind, KINDS, "pick"),
    created_at_pick_no: numOrNull(row.created_at_pick_no),
    created_at_week: numOrNull(row.created_at_week),
    subject_player_id:
      row.subject_player_id != null ? String(row.subject_player_id) : null,
    subject_label: String(row.subject_label ?? ""),
    expected_metric: oneOf(row.expected_metric, METRICS, "ev"),
    expected_value: Number(row.expected_value ?? 0),
    expected_ci_low: numOrNull(row.expected_ci_low),
    expected_ci_high: numOrNull(row.expected_ci_high),
    alternative_label:
      row.alternative_label != null ? String(row.alternative_label) : null,
    alternative_value: numOrNull(row.alternative_value),
    alternative_player_id:
      row.alternative_player_id != null
        ? String(row.alternative_player_id)
        : null,
    thesis: row.thesis != null ? String(row.thesis) : null,
    resolution_condition: String(row.resolution_condition ?? ""),
    horizon: oneOf(row.horizon, HORIZONS, "this_season"),
    resolved: Boolean(row.resolved),
    resolved_value: numOrNull(row.resolved_value),
    resolved_at: row.resolved_at != null ? String(row.resolved_at) : null,
    outcome:
      row.outcome != null ? oneOf(row.outcome, OUTCOMES, "neutral") : null,
  };
}

function numOrNull(x: unknown): number | null {
  if (x == null) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function oneOf<T extends string>(
  x: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const s = String(x);
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}
