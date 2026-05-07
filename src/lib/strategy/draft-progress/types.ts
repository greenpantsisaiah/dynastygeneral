/**
 * Draft progress: a "how am I doing" scorecard for the user's own
 * drafting in this league.
 *
 * Redesign 2026-05-08 (post forum-question research): the previous
 * shape had three abstract metrics ("Pick Quality", "League Rank",
 * "Build Coherence") that reported state but did not answer the
 * questions dynasty drafters actually ask mid-draft. Reddit /
 * Dynasty Nerds / FantasyPros forums consistently surface five
 * recurring questions:
 *
 *   1. Where am I weak/strong by position?  (universal)
 *   2. Is a position run starting?
 *   3. What's about to thin out?
 *   4. Did I miss obvious value?
 *   5. How does my roster compare to the league?
 *
 * The new shape answers those questions directly. The headline is
 * the verdict, the position diagnostic is the body, and the rest
 * are situational callouts surfaced only when meaningful.
 */

import type { EvBank } from "@/lib/strategy/ev-bank";

export type ProgressTier = "strong" | "solid" | "mixed" | "off_track";

export type PositionCode = "QB" | "RB" | "WR" | "TE";

export type PositionState = "strong" | "ok" | "thin" | "empty";

/** Per-position diagnostic. Replaces the old "build coherence" card. */
export type PositionDiagnostic = {
  position: PositionCode;
  have: number;
  need: number;
  state: PositionState;
  // Name of the user's best player at this position by FantasyCalc value.
  // Null when the user has no player at this position.
  best_player_name: string | null;
  // Best player's FantasyCalc value (0-100). Null when not resolved.
  best_player_value: number | null;
  // One-line read tailored to (state, count, best player). Concrete:
  // "Anchor + depth (Mahomes leads)", "Need a starter, none rostered",
  // "Top-12 starter, no depth yet", etc.
  summary: string;
};

/** Position-run watch. Null when no run is active. */
export type PositionRun = {
  position: PositionCode;
  picks_in_window: number;
  window_size: number;
  // Friendly sentence: "QB run on. 4 of last 8 picks were QBs."
  message: string;
};

/** Position-thin alert. Surfaced when top-tier supply at a needed position is short. */
export type ThinAlert = {
  position: PositionCode;
  remaining_top_tier: number;
  // Names of the top remaining players at this position (max 3).
  top_names: string[];
  // Friendly sentence: "Only 2 RBs left in top 25. Lock one before they go."
  message: string;
};

/** Per-metric score (kept for league rank + pick sharpness secondary row). */
export type ProgressMetric = {
  label: string;
  display_value: string;
  sub_line: string;
  tier: ProgressTier;
  ungraded?: boolean;
};

export type DraftProgress = {
  picks_made_by_user: number;
  total_picks_for_user: number;
  overall_tier: ProgressTier;
  // Verdict sentence. Anchors on the strongest signal: position diagnostic
  // weakness, position-run risk, or league rank.
  headline: string;

  // The new heart of the panel. Always present (4 entries).
  position_diagnostic: PositionDiagnostic[];

  // Secondary metrics, condensed.
  league_rank: ProgressMetric;
  // Renamed from pick_sharpness 2026-05-08. Old metric showed a single
  // negative number for the earliest lock; users read it as "your
  // sharpness is negative" instead of "decisive when scarcity said go."
  // best_value focuses on the positive direction (market gifts that
  // fell past ADP into the user's slot). Sharp locks (the negative
  // direction) remain in the SHARP POSITIONING sub-section so each
  // signal renders once.
  best_value: ProgressMetric;

  // Situational callouts. Each may be null/empty when not relevant.
  position_run: PositionRun | null;
  thin_alerts: ThinAlert[];

  // Free-form highlights/concerns. Smaller surface than v1.
  wins: string[];
  watch_outs: string[];
  sharp_positioning: string[];

  // EV bank: per-pick + cumulative measure of value extracted vs. the
  // market, with a +/- range from realistic ADP noise. Null when no
  // picks made yet. Per user feedback 2026-05-08: statistically
  // grounded, with a visualization. Sharp locks count as negative by
  // definition; whether they were "right" is a scarcity question
  // answered in the Decision card.
  ev_bank: EvBank | null;

  model_alert_triggered: boolean;
};
