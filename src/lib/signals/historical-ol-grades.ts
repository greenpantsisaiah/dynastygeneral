/**
 * Historical OL-grade loader (Phase B6 of MODEL_LIVE_PLAN, sig-ol-grade).
 *
 * PFF run/pass-blocking grades are a LICENSED PAID feed and are not in
 * nflverse, so the per-season backtest cohort builders (rb-cohort.ts,
 * position-cohort.ts) cannot derive them the way they derive
 * `ol_continuity_score` from free snap counts. This loader reads them
 * from `historical_signal_codes`, the season-dimensioned backtest store
 * (migration 0010), keyed by `(team, prediction_year)`. That table is the
 * correct landing spot for VINTAGE backtest data: it carries
 * `coded_with_knowledge_through` for temporal blinding (VALIDATION_PLAN
 * section 4) and supports team-level rows (player_id nullable). The
 * current-snapshot `team_signals` table (single row per team, no season
 * dimension) is the separate LIVE-read landing spot.
 *
 * Read-only. No writes. Server-only (service-role Supabase).
 *
 * Normalization contract: the rubrics expect OL grades on a 0..1 scale
 * centered at 0.5 (same scale as `ol_continuity_score`; the QB rubric's
 * `ol_grade_pass` effect is `(grade - 0.5) * 6`). PFF publishes grades on
 * a native 0..100 scale. The ingest script (`ingest-pff-ol-grades.ts`)
 * stores the NORMALIZED 0..1 value so every reader sees one scale; this
 * loader returns whatever was stored without re-scaling. If a future
 * source stores the native 0..100 scale, normalize at ingest, never here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const OL_GRADE_RUN_SIGNAL = "ol_grade_run";
export const OL_GRADE_PASS_SIGNAL = "ol_grade_pass";

export type HistoricalOlGrade = {
  ol_grade_run: number | null;
  ol_grade_pass: number | null;
};

/**
 * Build a `team -> { ol_grade_run, ol_grade_pass }` map for one
 * prediction year, read from `historical_signal_codes`. Returns an empty
 * map when no rows exist (the no-data path, so callers run unchanged on
 * the free signals). The map is keyed by upper-cased team abbreviation.
 *
 * Temporal blinding: pass `knowledgeThrough` to require that the coded
 * vintage is no later than the cutoff. A row whose
 * `coded_with_knowledge_through` is after the cutoff (or null) is
 * dropped, so the backtest can only see OL grades that were knowable as
 * of preseason Y. When `knowledgeThrough` is omitted, no vintage filter
 * is applied (use only for a current-snapshot read, never for a backtest).
 */
export async function loadHistoricalOlGrades(
  sb: SupabaseClient,
  predictionYear: number,
  knowledgeThrough?: string,
): Promise<Map<string, HistoricalOlGrade>> {
  const res = await sb
    .from("historical_signal_codes")
    .select(
      "team,signal_name,signal_value,coded_with_knowledge_through",
    )
    .eq("prediction_year", predictionYear)
    .in("signal_name", [OL_GRADE_RUN_SIGNAL, OL_GRADE_PASS_SIGNAL]);

  const out = new Map<string, HistoricalOlGrade>();
  for (const row of res.data ?? []) {
    const team = (row.team ?? "").toUpperCase();
    if (!team) continue;
    if (knowledgeThrough) {
      const v = row.coded_with_knowledge_through;
      // No vintage = cannot prove it was knowable; drop under blinding.
      if (!v || String(v) > knowledgeThrough) continue;
    }
    const value = coerceGrade(row.signal_value);
    if (value == null) continue;
    const entry = out.get(team) ?? { ol_grade_run: null, ol_grade_pass: null };
    if (row.signal_name === OL_GRADE_RUN_SIGNAL) entry.ol_grade_run = value;
    else if (row.signal_name === OL_GRADE_PASS_SIGNAL)
      entry.ol_grade_pass = value;
    out.set(team, entry);
  }
  return out;
}

/**
 * jsonb `signal_value` is stored as a bare number (normalized 0..1) or,
 * defensively, a `{ value }` / numeric-string shape. Returns null for
 * anything that is not a finite number in [0, 1].
 */
export function coerceGrade(raw: unknown): number | null {
  let n: number | null = null;
  if (typeof raw === "number") n = raw;
  else if (typeof raw === "string" && raw.trim() !== "") n = Number(raw);
  else if (raw && typeof raw === "object" && "value" in raw) {
    const inner = (raw as { value: unknown }).value;
    if (typeof inner === "number") n = inner;
    else if (typeof inner === "string" && inner.trim() !== "") n = Number(inner);
  }
  if (n == null || !Number.isFinite(n)) return null;
  if (n < 0 || n > 1) return null;
  return n;
}

/**
 * Normalize a native PFF 0..100 grade to the 0..1 scale the rubrics
 * read. Used by the ingest script, exported here so the contract lives
 * next to the reader. Returns null for out-of-range / non-finite input.
 */
export function normalizePffGrade(native: number | null): number | null {
  if (native == null || !Number.isFinite(native)) return null;
  if (native < 0 || native > 100) return null;
  return Number((native / 100).toFixed(4));
}

/** Legacy / relocation team aliases. nflverse pbp uses LA for the Rams. */
export const TEAM_ALIAS: Record<string, string> = {
  LA: "LAR",
  STL: "LAR",
  SD: "LAC",
  OAK: "LV",
  WSH: "WAS",
  JAC: "JAX",
};

export function normalizeTeam(raw: string): string {
  const t = (raw ?? "").trim().toUpperCase();
  return TEAM_ALIAS[t] ?? t;
}

/**
 * Build the per-decision-year OL map directly from in-memory file rows
 * (team, season, ol_grade_run, ol_grade_pass on the 0..1 scale), no DB.
 * Used by the validate-first FREE check so the backtest never writes to
 * production. A season-S row enriches decision year S+1, the same
 * convention the ingest uses (a grade earned in S is knowable preseason
 * S+1). Returns the map for the requested prediction year only.
 */
export function olMapFromRows(
  rows: { team: string; season: number; ol_grade_run?: number | null; ol_grade_pass?: number | null }[],
  predictionYear: number,
): Map<string, HistoricalOlGrade> {
  const out = new Map<string, HistoricalOlGrade>();
  for (const r of rows) {
    if (r.season + 1 !== predictionYear) continue;
    const team = normalizeTeam(r.team);
    if (!team) continue;
    out.set(team, {
      ol_grade_run: coerceGrade(r.ol_grade_run ?? null),
      ol_grade_pass: coerceGrade(r.ol_grade_pass ?? null),
    });
  }
  return out;
}
