/**
 * Pick Approach. countdown panel that activates when the user is
 * within 5 picks of their turn. Predicts what each upcoming picker
 * is likely to take, with confidence and reasoning. Surfaces
 * counter-signals to watch and what's likely to survive to the
 * user's pick.
 *
 * Reasoning is grounded in OBSERVABLE signals: roster gaps, position
 * concentration, draft pattern. We don't fabricate "they tend to
 * follow ADP" without ADP data. every reason cites real evidence.
 */

import type { Position } from "../archetypes/schema";

export type PredictionConfidence = "low" | "medium" | "high";

export type LikelyPlayer = {
  player_id: string;
  name: string;
  position: string | null;
  team: string | null;
  age: number | null;
  search_rank: number;
  adp: number | null;
};

export type PickerPostureLean = "young" | "veteran" | "balanced";

export type PickerPosture = {
  lean: PickerPostureLean;
  // Optional one-line caption. Only set when there's a meaningful
  // signal (trending young, trending vet). Null/absent for balanced
  // pickers so the UI doesn't show noise.
  note: string | null;
};

export type PickerPrediction = {
  pick_no: number;
  pick_label: string; // "3.4"
  roster_id: number;
  owner_name: string;
  // Roster posture inferred from this draft's recent picks. Drives
  // both a UI caption AND the likely_players sort order (within a
  // predicted position, young/vet lean shapes which names surface).
  posture: PickerPosture;
  // Top 1-3 positions ranked by likelihood, each with reason
  candidates: Array<{
    position: Position;
    confidence: PredictionConfidence;
    confidence_pct: number; // 0..1
    reasons: string[]; // bullets. observable evidence
    // Optional: top available players at this position. Surfaces who
    // they're likely to actually take, not just which position.
    likely_players?: LikelyPlayer[];
  }>;
};

export type SurvivingTarget = {
  position: Position;
  archetype_id: string;
  archetype_name: string;
  survival_likelihood: number; // 0..1
  reasoning: string;
};

export type PickApproachMode = "watch" | "approach";

export type Forecast = {
  // Short, evidence-backed scenario sentence. Always cites concrete
  // signal so it doesn't read like a horoscope.
  // e.g. "If 3 of next 4 picks are RB, top RB tier is gone before you're up."
  text: string;
};

export type PlayerSuggestion = {
  player_id: string;
  name: string;
  position: string | null;
  team: string | null;
  age: number | null;
  search_rank: number;
  adp: number | null;
  // One-line "why this player at your pick": roster need, archetype
  // fit, age skew, position scarcity. Always cites a concrete reason.
  reason: string;
};

export type PickApproach = {
  // "watch" = >5 picks away, softer "what we're watching for" framing.
  // "approach" = ≤5 picks away, urgent "pre-set your queue" framing.
  mode: PickApproachMode;
  picks_until_me: number;
  my_pick_no: number;
  my_pick_label: string;
  upcoming_pickers: PickerPrediction[];
  surviving_targets: SurvivingTarget[];
  watch_for: Array<{
    signal: string;
    if_it_fires: string;
  }>;
  forecasts: Forecast[];
  // Optional: top 3-5 named players the user could take at this pick,
  // each with a one-line reason. Server-enriched after build runs.
  top_suggestions?: PlayerSuggestion[];
};
