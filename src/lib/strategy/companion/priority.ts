/**
 * Beat priority. The check-in surface leads with the single most
 * resonant grounded beat; the rest collapse below. Mirrors the EV-
 * weighted urgent-partner logic in plays/urgency.ts (urgentPartnerOf):
 * a high-stakes, time-pressured beat outranks a calm milestone.
 *
 * CANONICAL_SOURCES.md "Beat priority (what surfaces first)".
 */

import type { Beat, BeatTone } from "./types";

/**
 * Base weight by tone. A bad beat (commiserate) and a debate (challenge,
 * the thing the user is actively craving) are the most emotionally
 * resonant; a milestone (often a win) is steady; ambient anticipation
 * (neutral) is lowest unless it carries urgency.
 */
const TONE_WEIGHT: Record<BeatTone, number> = {
  challenge: 4,
  commiserate: 3.5,
  win: 3,
  neutral: 1.5,
};

/** A high-priority cohort surfaces first; the rest collapse. */
export function rankBeats(beats: Beat[]): Beat[] {
  return [...beats].sort((a, b) => priorityScore(b) - priorityScore(a));
}

export function topBeat(beats: Beat[]): Beat | null {
  return rankBeats(beats)[0] ?? null;
}

export function priorityScore(beat: Beat): number {
  let score = TONE_WEIGHT[beat.tone];
  if (beat.urgency === "act_now") score += 3;
  else if (beat.urgency === "this_round") score += 1.5;
  if (beat.prompts_handoff) score += 1; // beats the user can engage rank up
  const mag = beat.source.values?.magnitude;
  if (typeof mag === "number") score += Math.min(2, Math.abs(mag) / 5);
  return score;
}
