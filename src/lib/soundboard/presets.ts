/**
 * Stock doctrine presets. Each one represents the dial config the
 * engine would produce for a canonical archetype lean: load it = "lean
 * toward what the engine says rebuilders look like."
 *
 * The user can tune away from any preset; the preset bar lights
 * "Custom" when no stock preset matches the active dial state.
 *
 * These are not opinion; they're the engine's archetype defaults
 * surfaced as one-click starting points. When engine wiring lands and
 * actual archetype weights change, regenerate this file from the
 * canonical source.
 */

import type { DialId, DialValue } from "./types";

export type Preset = {
  id: PresetId;
  name: string;
  blurb: string;
  values: Partial<Record<DialId, DialValue>>;
};

export type PresetId =
  | "rebuilder"
  | "contender"
  | "pivot"
  | "hold"
  | "system_read";

export const PRESETS: Preset[] = [
  {
    id: "rebuilder",
    name: "Rebuilder",
    blurb: "Long-game build. Aggressive on rookies. Patient on trades.",
    values: {
      horizon: 70,
      rookie_tilt: 60,
      risk_tolerance: 30,
      trade_aggression: -20,
      age_preference: [21, 26],
      consensus_lean: -10,
      anchor_weight: "ktc",
      variance_tolerance: 30,
      coach_voice: "measured",
      underdog_premium: 40,
      stack_preference: [],
      schedule_weight: -10,
      league_pulse: 20,
      trade_depth: 30,
      doctrine_certainty: 20,
    },
  },
  {
    id: "contender",
    name: "Contender",
    blurb: "Win-now urgency. Proven over potential. Active in trades.",
    values: {
      horizon: -60,
      rookie_tilt: -40,
      risk_tolerance: -20,
      trade_aggression: 50,
      age_preference: [24, 30],
      consensus_lean: 20,
      anchor_weight: "ktc",
      variance_tolerance: -20,
      coach_voice: "confident",
      underdog_premium: 10,
      stack_preference: ["qb_wr_same_team"],
      schedule_weight: 30,
      league_pulse: 40,
      trade_depth: -10,
      doctrine_certainty: 40,
    },
  },
  {
    id: "pivot",
    name: "Pivot",
    blurb: "Mid-cycle. Adaptive plan. Reading where the wind goes.",
    values: {
      horizon: 0,
      rookie_tilt: 20,
      risk_tolerance: 20,
      trade_aggression: 30,
      age_preference: [22, 28],
      consensus_lean: 0,
      anchor_weight: "ktc",
      variance_tolerance: 50,
      coach_voice: "measured",
      underdog_premium: 30,
      stack_preference: [],
      schedule_weight: 0,
      league_pulse: 30,
      trade_depth: 20,
      doctrine_certainty: 0,
    },
  },
  {
    id: "hold",
    name: "Hold",
    blurb: "Sticky plan. Trust the build. Minimal churn.",
    values: {
      horizon: 0,
      rookie_tilt: 0,
      risk_tolerance: -20,
      trade_aggression: -50,
      age_preference: [22, 28],
      consensus_lean: 30,
      anchor_weight: "ktc",
      variance_tolerance: -40,
      coach_voice: "measured",
      underdog_premium: 0,
      stack_preference: [],
      schedule_weight: 0,
      league_pulse: -30,
      trade_depth: -20,
      doctrine_certainty: 30,
    },
  },
];

export const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

/**
 * Compare a dials map to each stock preset; return the first match by
 * value-equality across ALL stock-preset dials, or null. Used by the
 * preset bar to highlight the matching chip vs lighting "Custom."
 */
export function detectActivePreset(
  dials: Record<DialId, DialValue>,
): PresetId | null {
  for (const preset of PRESETS) {
    let match = true;
    for (const [k, v] of Object.entries(preset.values)) {
      const current = dials[k as DialId];
      if (!valuesEqual(current, v as DialValue)) {
        match = false;
        break;
      }
    }
    if (match) return preset.id;
  }
  return null;
}

function valuesEqual(a: DialValue, b: DialValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  return a === b;
}
