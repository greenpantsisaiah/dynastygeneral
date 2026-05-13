/**
 * Doctrine readout: synthesizes the dial state into a one-line
 * identity. The master strip shows this. It's the screenshot moment.
 *
 * Refactored 2026-05-13 alongside the 16-to-8 dial cut. Build composite
 * now reads horizon + rookie_tilt + youth_weight; stance is consensus
 * alone; voice synthesizes risk + trade aggression. The Coach-voice
 * register dial was retired (Sloan-mode retirement); the dial set is
 * now lean enough that the doctrine line is a function of position
 * rather than personality.
 *
 * Pure derivation. No engine call; reads dials only. When dials wire
 * into the engine, this stays the same; only the meaning of each dial
 * deepens.
 */

import type { DialId, DialValue } from "./types";

export type Doctrine = {
  build: string;
  stance: string;
  voice: string;
  calibrated_count: number;
};

function num(v: DialValue | undefined, fallback = 0): number {
  return typeof v === "number" ? v : fallback;
}

function isMoved(v: DialValue | undefined, def: DialValue): boolean {
  if (Array.isArray(v) && Array.isArray(def)) {
    if (v.length !== def.length) return true;
    for (let i = 0; i < v.length; i++) if (v[i] !== def[i]) return true;
    return false;
  }
  return v !== def;
}

const DEFAULTS: Record<string, DialValue> = {
  horizon: 0,
  rookie_tilt: 0,
  youth_weight: 0,
  bellcow_pref: 0,
  continuity_weight: 0,
  risk_tolerance: 0,
  trade_aggression: 0,
  consensus_lean: 0,
};

export function deriveDoctrine(dials: Record<DialId, DialValue>): Doctrine {
  const horizon = num(dials.horizon);
  const rookie = num(dials.rookie_tilt);
  const youth = num(dials.youth_weight);
  const risk = num(dials.risk_tolerance);
  const trade = num(dials.trade_aggression);
  const consensus = num(dials.consensus_lean);

  // Build: timeline composite weighted toward horizon, with rookie +
  // youth dials reinforcing the rebuild signal.
  const buildScore = horizon * 0.55 + rookie * 0.25 + youth * 0.2;
  let buildBase: string;
  if (buildScore > 40) buildBase = "Rebuilder";
  else if (buildScore > 15) buildBase = "Pivot";
  else if (buildScore > -15) buildBase = "Hold";
  else if (buildScore > -40) buildBase = "Contender";
  else buildBase = "Win-Now";

  // Build modifier: trade + risk aggression in the same direction tags
  // the build as Aggressive / Active / Steady / Patient.
  const aggression = trade * 0.5 + risk * 0.5;
  let buildMod = "";
  if (aggression > 35) buildMod = "Aggressive ";
  else if (aggression > 10) buildMod = "Active ";
  else if (aggression < -35) buildMod = "Patient ";
  else if (aggression < -10) buildMod = "Steady ";

  // Stance: market alignment from consensus_lean alone.
  let stance: string;
  if (consensus > 30) stance = "Market Lean";
  else if (consensus > 10) stance = "Soft Market";
  else if (consensus < -30) stance = "Contrarian";
  else if (consensus < -10) stance = "Skeptic";
  else stance = "Balanced";

  // Voice: composite of risk + trade. No more coach_voice register
  // dial; the user's risk and aggression posture is enough to color
  // the line. The retired Sloan-mode toggle handled the formality
  // register separately.
  let voiceLabel: string;
  const energy = (risk + trade) / 2;
  if (energy > 40) voiceLabel = "Decisive";
  else if (energy > 15) voiceLabel = "Confident";
  else if (energy < -40) voiceLabel = "Cautious";
  else if (energy < -15) voiceLabel = "Measured";
  else voiceLabel = "Balanced";

  // Count moved dials
  let calibratedCount = 0;
  for (const [k, def] of Object.entries(DEFAULTS)) {
    if (isMoved(dials[k as DialId], def)) calibratedCount++;
  }

  return {
    build: `${buildMod}${buildBase}`,
    stance,
    voice: voiceLabel,
    calibrated_count: calibratedCount,
  };
}

export function formatDoctrineLine(d: Doctrine): string {
  return `${d.build} · ${d.stance} · ${d.voice}`;
}
