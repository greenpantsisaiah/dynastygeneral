/**
 * Class strength derivation. Computes how strong each position's
 * portion of the active rookie class is, relative to the average
 * position pool in the same class.
 *
 * Method: aggregate FantasyCalc top-12 rookie values per position,
 * then express each position's pool as a multiplier relative to the
 * class average. Multiplier > 1.0 means this position's class is
 * stronger than its peers; < 1.0 means weaker.
 *
 * Rationale: FantasyCalc's market values ALREADY price absolute
 * rookie value. We don't need to re-anchor that. The useful signal is
 * the SHAPE of the class - "deep RB class, thin TE class" - which
 * tells the user where positional scarcity will bite during the
 * draft. The path projector (Phase C) consumes this to bias toward
 * scarce positions and away from deep ones.
 *
 * Source authority: FantasyCalc current-values endpoint (format
 * matched to the league). User override per-league via
 * league_doctrines.class_strength. The chip in the hub names which
 * source produced each number.
 *
 * Per founder direction 2026-05-16: "use data, not hand-authored by
 * us. BUT - let the USER hand-author at the start of the draft if
 * they want."
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import { scoringValueByIds } from "@/lib/players/value-mode";
import { __dumpAllPlayers } from "@/lib/players/cache";

export type ClassStrengthPosition = "QB" | "RB" | "WR" | "TE";

const POSITIONS: ClassStrengthPosition[] = ["QB", "RB", "WR", "TE"];

/**
 * How many rookies per position go into the strength calculation.
 * Skill positions (RB / WR) have deep classes so we take the top 12.
 * QB / TE classes are smaller in dynasty terms; top 6 captures the
 * relevant pool without diluting the average with depth pieces.
 */
const TOP_N_BY_POSITION: Record<ClassStrengthPosition, number> = {
  QB: 6,
  RB: 12,
  WR: 12,
  TE: 6,
};

export type ClassStrengthMultipliers = Partial<
  Record<ClassStrengthPosition, number>
>;

export type ClassStrength = {
  /** The rookie class year (snap.season for an active rookie draft). */
  season: string;
  /** Per-position multiplier relative to the class average. */
  by_position: Record<ClassStrengthPosition, number>;
  /** Total dynasty value (sum of top-N) at each position. */
  totals_by_position: Record<ClassStrengthPosition, number>;
  /** Average per-position total used as the denominator. */
  class_average: number;
  /** How the multipliers were resolved per position. */
  source_by_position: Record<
    ClassStrengthPosition,
    "fantasycalc" | "user_override"
  >;
  /** Plain-English line per position naming the source + math. */
  provenance_by_position: Record<ClassStrengthPosition, string>;
  /** When the computation ran. */
  computed_at: string;
};

const NEUTRAL_MULTIPLIER = 1.0;

function neutralClassStrength(season: string): ClassStrength {
  return {
    season,
    by_position: { QB: 1, RB: 1, WR: 1, TE: 1 },
    totals_by_position: { QB: 0, RB: 0, WR: 0, TE: 0 },
    class_average: 0,
    source_by_position: {
      QB: "fantasycalc",
      RB: "fantasycalc",
      WR: "fantasycalc",
      TE: "fantasycalc",
    },
    provenance_by_position: {
      QB: "Rookie pool unresolved; defaulting to neutral 1.00x.",
      RB: "Rookie pool unresolved; defaulting to neutral 1.00x.",
      WR: "Rookie pool unresolved; defaulting to neutral 1.00x.",
      TE: "Rookie pool unresolved; defaulting to neutral 1.00x.",
    },
    computed_at: new Date().toISOString(),
  };
}

/**
 * Compute class strength for the rookie cohort tied to this snapshot.
 * Reads FantasyCalc values for the league's format, filters to
 * years_exp === 0 (true rookies), groups by position, takes top-N,
 * and ratios against the class average.
 *
 * Per-position overrides from the user (passed via `overrides`) win
 * over the FantasyCalc-derived value. Sources are recorded per
 * position so the chip can display "user override" vs "FantasyCalc"
 * honestly.
 */
export async function computeClassStrength(args: {
  snap: LeagueSnapshot;
  /** Per-position user override (subset of positions; missing entries fall back to derived). */
  overrides?: ClassStrengthMultipliers;
}): Promise<ClassStrength> {
  const { snap, overrides = {} } = args;
  const season = snap.season;

  // Pull the FantasyCalc value pool matched to the league's format.
  const numQbs: 1 | 2 =
    snap.format === "superflex" || snap.format === "2qb" ? 2 : 1;
  const ppr = snap.scoring.includes("PPR")
    ? 1
    : snap.scoring.includes("half-PPR")
      ? 0.5
      : 0;

  // Walk the all-players cache for rookie identification. FantasyCalc
  // values don't carry years_exp, so we join through the Sleeper
  // players cache. The scoring value flows through the ONE value seam
  // (market in shadow, rubric on flip), so rookie class strength reflects
  // the same model the board ranks on. `valueById[id]` is the seam scalar.
  let valueById: Record<string, number>;
  let allSleeper: Awaited<ReturnType<typeof __dumpAllPlayers>>;
  try {
    allSleeper = await __dumpAllPlayers();
    // Pass every Sleeper player id; the seam returns the intersection that
    // FantasyCalc knows about.
    const allIds = allSleeper.map((p) => p.player_id);
    ({ valueById } = await scoringValueByIds({
      ids: allIds,
      isSuperflex: numQbs === 2,
      isPpr: ppr === 1,
      isHalfPpr: ppr === 0.5,
    }));
  } catch (err) {
    console.error("[class-strength:compute]", err);
    return neutralClassStrength(season);
  }

  // Group rookies by position.
  type RookieRow = { player_id: string; position: ClassStrengthPosition; value: number };
  const rookiesByPosition: Record<ClassStrengthPosition, RookieRow[]> = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
  };
  for (const sp of allSleeper) {
    if (sp.years_exp !== 0) continue;
    const positionRaw = (sp.position ?? "").toUpperCase();
    if (!POSITIONS.includes(positionRaw as ClassStrengthPosition)) continue;
    const value = valueById[sp.player_id];
    if (typeof value !== "number" || value <= 0) continue;
    rookiesByPosition[positionRaw as ClassStrengthPosition].push({
      player_id: sp.player_id,
      position: positionRaw as ClassStrengthPosition,
      value,
    });
  }

  const totalsByPosition: Record<ClassStrengthPosition, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
  };
  for (const pos of POSITIONS) {
    rookiesByPosition[pos].sort((a, b) => b.value - a.value);
    const topN = rookiesByPosition[pos].slice(0, TOP_N_BY_POSITION[pos]);
    totalsByPosition[pos] = topN.reduce((s, r) => s + r.value, 0);
  }

  // Class average. If no position has data, every multiplier defaults
  // to 1.0 (neutral).
  const totalSum =
    totalsByPosition.QB +
    totalsByPosition.RB +
    totalsByPosition.WR +
    totalsByPosition.TE;
  const classAverage = totalSum > 0 ? totalSum / 4 : 0;

  const derivedByPosition: Record<ClassStrengthPosition, number> = {
    QB: NEUTRAL_MULTIPLIER,
    RB: NEUTRAL_MULTIPLIER,
    WR: NEUTRAL_MULTIPLIER,
    TE: NEUTRAL_MULTIPLIER,
  };
  if (classAverage > 0) {
    for (const pos of POSITIONS) {
      derivedByPosition[pos] =
        Math.round((totalsByPosition[pos] / classAverage) * 100) / 100;
    }
  }

  // Apply overrides.
  const finalByPosition: Record<ClassStrengthPosition, number> = {
    ...derivedByPosition,
  };
  const sourceByPosition: Record<
    ClassStrengthPosition,
    "fantasycalc" | "user_override"
  > = {
    QB: "fantasycalc",
    RB: "fantasycalc",
    WR: "fantasycalc",
    TE: "fantasycalc",
  };
  for (const pos of POSITIONS) {
    const override = overrides[pos];
    if (typeof override === "number" && Number.isFinite(override) && override > 0) {
      finalByPosition[pos] = Math.round(override * 100) / 100;
      sourceByPosition[pos] = "user_override";
    }
  }

  // Plain-English provenance per position.
  const provenanceByPosition: Record<ClassStrengthPosition, string> = {
    QB: "",
    RB: "",
    WR: "",
    TE: "",
  };
  for (const pos of POSITIONS) {
    if (sourceByPosition[pos] === "user_override") {
      provenanceByPosition[pos] = `User override: ${finalByPosition[pos].toFixed(
        2,
      )}x for ${pos} in the ${season} class.`;
    } else {
      const top = TOP_N_BY_POSITION[pos];
      const total = Math.round(totalsByPosition[pos]);
      const avg = Math.round(classAverage);
      provenanceByPosition[pos] = `FantasyCalc top-${top} ${pos} rookies = ${total} value vs class average of ${avg}. Multiplier ${finalByPosition[pos].toFixed(2)}x.`;
    }
  }

  return {
    season,
    by_position: finalByPosition,
    totals_by_position: totalsByPosition,
    class_average: classAverage,
    source_by_position: sourceByPosition,
    provenance_by_position: provenanceByPosition,
    computed_at: new Date().toISOString(),
  };
}

/**
 * Tone for a class-strength multiplier. Used by the chip + downstream
 * surfaces that want to color-code the strength signal.
 */
export function classStrengthTone(
  multiplier: number,
): "strong" | "neutral" | "weak" {
  if (multiplier >= 1.1) return "strong";
  if (multiplier <= 0.9) return "weak";
  return "neutral";
}
