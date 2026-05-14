/**
 * Doctrine library. Each entry is a one-click dial config representing
 * a canonical strategic archetype. Loading a preset = "start from this
 * shape and tune your own." User tunes from there; preset bar lights
 * "Custom" when no preset matches the current state.
 *
 * Refactored 2026-05-13 alongside the 16-to-8 dial cut. The retired
 * personality-flavor presets (Field General, Gambler) are gone; what
 * survives is the timeline spectrum that maps cleanly to lane identity
 * and the engine's win-now / future scoring.
 *
 * 6 doctrines arranged in a meaningful spread:
 *   AGGRESSIVE REBUILDER   max future, max risk, rookie-heavy
 *   REBUILDER              long-game, patient
 *   PIVOT                  mid-cycle, adaptive
 *   HOLD                   sticky plan, minimal churn
 *   PATIENT CONTENDER      win-now without torching futures
 *   CONTENDER              win-now urgency, active trader
 *   WIN-NOW MAXER          all-in, locked, hates rookies
 */

import type { DialId, DialValue } from "./dial-types";

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
  | "win_now_maxer";

export const PRESETS: Preset[] = [
  {
    id: "aggressive_rebuilder",
    name: "Aggressive Rebuilder",
    blurb:
      "Max future. Trade win-now for picks. Rookies and 2026-2028 upside, all of it.",
    values: {
      horizon: 95,
      rookie_tilt: 90,
      youth_weight: 80,
      bellcow_pref: -20,
      continuity_weight: 0,
      risk_tolerance: 60,
      trade_aggression: 60,
      consensus_lean: -30,
    },
  },
  {
    id: "rebuilder",
    name: "Rebuilder",
    blurb: "Long-game build. Aggressive on rookies. Patient on trades.",
    values: {
      horizon: 70,
      rookie_tilt: 60,
      youth_weight: 60,
      bellcow_pref: -10,
      continuity_weight: 10,
      risk_tolerance: 30,
      trade_aggression: -20,
      consensus_lean: -10,
    },
  },
  {
    id: "pivot",
    name: "Pivot",
    blurb: "Mid-cycle. Adaptive plan. Reading where the wind goes.",
    values: {
      horizon: 0,
      rookie_tilt: 20,
      youth_weight: 20,
      bellcow_pref: 0,
      continuity_weight: 10,
      risk_tolerance: 20,
      trade_aggression: 30,
      consensus_lean: 0,
    },
  },
  {
    id: "hold",
    name: "Hold",
    blurb: "Sticky plan. Trust the build. Minimal churn.",
    values: {
      horizon: 0,
      rookie_tilt: 0,
      youth_weight: 0,
      bellcow_pref: 0,
      continuity_weight: 0,
      risk_tolerance: -20,
      trade_aggression: -50,
      consensus_lean: 30,
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
      youth_weight: -10,
      bellcow_pref: 30,
      continuity_weight: 30,
      risk_tolerance: -10,
      trade_aggression: 20,
      consensus_lean: 10,
    },
  },
  {
    id: "contender",
    name: "Contender",
    blurb: "Win-now urgency. Proven over potential. Active in trades.",
    values: {
      horizon: -60,
      rookie_tilt: -40,
      youth_weight: -30,
      bellcow_pref: 50,
      continuity_weight: 40,
      risk_tolerance: 20,
      trade_aggression: 60,
      consensus_lean: 20,
    },
  },
  {
    id: "win_now_maxer",
    name: "Win-Now Maxer",
    blurb:
      "All chips in. Vets only, prime production, future is a rounding error.",
    values: {
      horizon: -95,
      rookie_tilt: -80,
      youth_weight: -60,
      bellcow_pref: 80,
      continuity_weight: 60,
      risk_tolerance: 40,
      trade_aggression: 80,
      consensus_lean: 30,
    },
  },
];

export const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

/**
 * Compare a dials map to each stock preset; return the first match by
 * value-equality across ALL preset-defined dials, or null. Used by the
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

function valuesEqual(a: DialValue | undefined, b: DialValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  return a === b;
}
