/**
 * Inflection-point bifurcation entry. Public API:
 *
 *   resolveInflections(inputs) -> InflectionContext | null
 *
 * Returns null when the player is in zero windows. Returns an
 * InflectionContext with one or more resolutions when active.
 *
 * The engine and Coach context contract consume this; the UI
 * surfaces the bifurcation panel when present.
 */

import { detectInflectionWindows } from "./detect";
import { resolveInflectionWindow } from "./resolve";
import type { InflectionInputs, InflectionContext } from "./types";

export function resolveInflections(
  inputs: InflectionInputs,
): InflectionContext | null {
  const windows = detectInflectionWindows(inputs);
  if (windows.length === 0) return null;
  const resolutions = windows.map((w) => resolveInflectionWindow(w, inputs));
  return {
    player_id: inputs.player_id,
    player_name: inputs.player_name,
    position: inputs.position,
    resolutions,
  };
}

export type {
  InflectionInputs,
  InflectionContext,
  InflectionResolution,
  InflectionSignal,
  InflectionComparator,
  SignalConfidence,
  SignalDirection,
} from "./types";
export { detectInflectionWindows } from "./detect";
export { resolveInflectionWindow } from "./resolve";
export {
  buildInflectionsFromSnapshot,
  rosterHasAgingRb,
} from "./from-snapshot";
