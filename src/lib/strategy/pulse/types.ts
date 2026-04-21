/**
 * Pulse. short, situational insights generated from league snapshot
 * regardless of whether any archetype currently fits the user.
 *
 * The point: even at Pick 1.5 with 1 roster pick, the LEAGUE STATE
 * itself has plenty to say. Format quirks, position pacing, runs in
 * progress, your turn approaching, openings about to fire. Pulse
 * surfaces these so the early-draft user gets actionable context
 * before the strategy board has anything to recommend.
 */

export type PulseSeverity = "info" | "notable" | "critical";

export type PulseCategory =
  | "format-note"
  | "position-pace"
  | "position-run"
  | "your-turn"
  | "opening-preview"
  | "scarcity";

export type PulseStat = {
  label: string;
  value: string;
};

export type Pulse = {
  id: string; // stable kebab-case
  severity: PulseSeverity;
  category: PulseCategory;
  headline: string;
  body: string;
  stats?: PulseStat[];
};
