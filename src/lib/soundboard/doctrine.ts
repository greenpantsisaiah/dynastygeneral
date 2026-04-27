/**
 * Doctrine readout: synthesizes the dial state into a one-line
 * identity. The master strip shows this. It's the screenshot moment.
 *
 * Composed of three labels:
 *   - Build: timeline + aggression composite (Aggressive Rebuilder /
 *     Patient Contender / etc.)
 *   - Stance: how you relate to the market (Contrarian / Market Lean /
 *     Balanced)
 *   - Voice: how Coach speaks for you (Confident / Measured / Cautious)
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

function str(v: DialValue | undefined, fallback: string): string {
  return typeof v === "string" ? v : fallback;
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
  risk_tolerance: 0,
  trade_aggression: 0,
  position_bias: "balanced",
  age_preference: [22, 28],
  consensus_lean: 0,
  anchor_weight: "ktc",
  variance_tolerance: 0,
  coach_voice: "measured",
  underdog_premium: 0,
  stack_preference: [],
  schedule_weight: 0,
  league_pulse: 0,
  trade_depth: 0,
  doctrine_certainty: 0,
};

export function deriveDoctrine(dials: Record<DialId, DialValue>): Doctrine {
  const horizon = num(dials.horizon);
  const rookie = num(dials.rookie_tilt);
  const risk = num(dials.risk_tolerance);
  const trade = num(dials.trade_aggression);
  const consensus = num(dials.consensus_lean);
  const variance = num(dials.variance_tolerance);
  const certainty = num(dials.doctrine_certainty);
  const voice = str(dials.coach_voice, "measured");

  // Build: timeline composite weighted toward horizon
  const buildScore = horizon * 0.6 + rookie * 0.25 - risk * 0.05;
  let buildBase: string;
  if (buildScore > 40) buildBase = "Rebuilder";
  else if (buildScore > 15) buildBase = "Pivot";
  else if (buildScore > -15) buildBase = "Hold";
  else if (buildScore > -40) buildBase = "Contender";
  else buildBase = "Win-Now";

  // Build modifier from aggression
  const aggression = trade * 0.5 + risk * 0.3 + rookie * 0.2;
  let buildMod = "";
  if (aggression > 35) buildMod = "Aggressive ";
  else if (aggression > 10) buildMod = "Active ";
  else if (aggression < -35) buildMod = "Patient ";
  else if (aggression < -10) buildMod = "Steady ";

  // Stance: market alignment
  let stance: string;
  if (consensus > 30) stance = "Market Lean";
  else if (consensus > 10) stance = "Soft Market";
  else if (consensus < -30) stance = "Contrarian";
  else if (consensus < -10) stance = "Skeptic";
  else stance = "Balanced";

  // Voice: coach + certainty
  let voiceLabel: string;
  if (voice === "confident" && certainty > 20) voiceLabel = "Locked-in";
  else if (voice === "confident") voiceLabel = "Confident";
  else if (voice === "cautious") voiceLabel = "Cautious";
  else if (certainty > 40) voiceLabel = "Decisive";
  else if (variance > 40) voiceLabel = "Adaptive";
  else voiceLabel = "Measured";

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
