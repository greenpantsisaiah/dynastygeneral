/**
 * Doctrine library. Each entry is a one-click dial config representing
 * a canonical strategic archetype. Loading a doctrine = "lean toward
 * what this archetype looks like." User tunes from there; preset bar
 * lights "Custom" when active state matches none.
 *
 * These are not opinion; they're the engine's archetype defaults
 * surfaced as one-click starting points. When engine wiring lands and
 * actual archetype weights change, regenerate from the canonical
 * source.
 *
 * 7 doctrines arranged in a meaningful spread:
 *   AGGRESSIVE REBUILDER   max future, max risk, rookie-heavy
 *   REBUILDER              long-game, patient
 *   PIVOT                  mid-cycle, adaptive
 *   HOLD                   sticky plan, minimal churn
 *   PATIENT CONTENDER      win-now without torching futures
 *   CONTENDER              win-now urgency, active trader
 *   WIN-NOW MAXER          all-in, locked, hates rookies
 *
 * Plus two flavor doctrines orthogonal to the timeline spectrum:
 *   FIELD GENERAL          confident voice, locked-in, decisive
 *   GAMBLER                contrarian, high-risk, embraces stacks
 */

import type { DialId, DialValue } from "./types";

export type Preset = {
  id: PresetId;
  name: string;
  blurb: string;
  values: Partial<Record<DialId, DialValue>>;
};

export type PresetId =
  | "aggressive_rebuilder"
  | "rebuilder"
  | "pivot"
  | "hold"
  | "patient_contender"
  | "contender"
  | "win_now_maxer"
  | "field_general"
  | "gambler"
  | "system_read";

export const PRESETS: Preset[] = [
  {
    id: "aggressive_rebuilder",
    name: "Aggressive Rebuilder",
    blurb:
      "Max future. Trade win-now for picks. Rookies and 2026-2028 upside, all of it.",
    values: {
      horizon: 95,
      rookie_tilt: 90,
      risk_tolerance: 60,
      trade_aggression: 60,
      age_preference: [20, 24],
      consensus_lean: -30,
      anchor_weight: "ktc",
      variance_tolerance: 50,
      coach_voice: "confident",
      underdog_premium: 70,
      stack_preference: [],
      schedule_weight: -30,
      league_pulse: 30,
      trade_depth: 60,
      doctrine_certainty: 30,
    },
  },
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
  {
    id: "patient_contender",
    name: "Patient Contender",
    blurb:
      "Compete this season without torching future. Iceman default.",
    values: {
      horizon: -30,
      rookie_tilt: -10,
      risk_tolerance: -10,
      trade_aggression: 20,
      age_preference: [23, 28],
      consensus_lean: 10,
      anchor_weight: "ktc",
      variance_tolerance: 0,
      coach_voice: "measured",
      underdog_premium: 20,
      stack_preference: ["qb_wr_same_team"],
      schedule_weight: 20,
      league_pulse: 20,
      trade_depth: 10,
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
    id: "win_now_maxer",
    name: "Win-Now Maxer",
    blurb:
      "All-in this year. Cash futures for production. Title or bust.",
    values: {
      horizon: -95,
      rookie_tilt: -80,
      risk_tolerance: -10,
      trade_aggression: 80,
      age_preference: [25, 32],
      consensus_lean: 40,
      anchor_weight: "ktc",
      variance_tolerance: -50,
      coach_voice: "confident",
      underdog_premium: 0,
      stack_preference: ["qb_wr_same_team", "rb_handcuff"],
      schedule_weight: 60,
      league_pulse: 60,
      trade_depth: -30,
      doctrine_certainty: 70,
    },
  },
  {
    id: "field_general",
    name: "Field General",
    blurb:
      "Confident voice, locked-in plan. Decisive across the board.",
    values: {
      horizon: 0,
      rookie_tilt: 0,
      risk_tolerance: 0,
      trade_aggression: 0,
      age_preference: [22, 28],
      consensus_lean: 0,
      anchor_weight: "ktc",
      variance_tolerance: -30,
      coach_voice: "confident",
      underdog_premium: 0,
      stack_preference: [],
      schedule_weight: 0,
      league_pulse: 0,
      trade_depth: 0,
      doctrine_certainty: 70,
    },
  },
  {
    id: "gambler",
    name: "Gambler",
    blurb:
      "Contrarian, high-risk, embraces stacks. Swings for the variance.",
    values: {
      horizon: 30,
      rookie_tilt: 40,
      risk_tolerance: 80,
      trade_aggression: 50,
      age_preference: [21, 27],
      consensus_lean: -70,
      anchor_weight: "ktc",
      variance_tolerance: 80,
      coach_voice: "confident",
      underdog_premium: 80,
      stack_preference: ["qb_wr_same_team", "rb_handcuff", "wr_stacks"],
      schedule_weight: 0,
      league_pulse: 40,
      trade_depth: 50,
      doctrine_certainty: -20,
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
