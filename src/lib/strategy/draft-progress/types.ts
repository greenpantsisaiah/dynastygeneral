/**
 * Draft progress: a "how am I doing" scorecard for the user's own
 * drafting in this league. Surfaces above the DecisionCard on the
 * league hub. Specifically designed for the multi-draft user who
 * comes back after a day or two and wants the at-a-glance answer
 * before drilling into the next pick.
 *
 * Per the 2026-05-07 founder ask: "Positive emotional ROI is my
 * expectation given that I've gone with DG on every pick so far.
 * It'd suck if it told me I wasn't doing well after following all
 * the recommendations." With the corollary: if a recommendation-
 * following user IS doing badly, that's a MODEL alert, not a user
 * problem. The footer closes that feedback loop.
 */

export type ProgressTier = "strong" | "solid" | "mixed" | "off_track";

/**
 * Per-metric score with its own honesty fields. Three cards on the
 * panel: pick quality, league rank, build coherence.
 */
export type ProgressMetric = {
  label: string;
  // Number to display prominently. Format-specific to the metric
  // (e.g., "+6.2", "2/12", "81/100").
  display_value: string;
  // Sub-line: what this means in plain English.
  sub_line: string;
  // Tier color for visual.
  tier: ProgressTier;
};

export type DraftProgress = {
  // Number of picks the user has made. Drives "N picks in" framing.
  picks_made_by_user: number;
  // Total picks the user will make in this draft (rounds for snake
  // dynasty startup; 1 round for many keeper drafts; etc).
  total_picks_for_user: number;
  // Headline tier across all metrics. "strong" when at least 2 of 3
  // metrics are strong + 0 are off_track. "off_track" when any
  // metric is off_track. Otherwise "solid" / "mixed".
  overall_tier: ProgressTier;
  // One-sentence sentiment headline. Positive ROI when the metrics
  // support it; honest when they don't.
  headline: string;
  // Three score cards.
  pick_quality: ProgressMetric;
  league_rank: ProgressMetric;
  build_coherence: ProgressMetric;
  // Wins to celebrate (3 max). Specific reasons the user should feel
  // good, named with concrete deltas. Empty when there are no clear
  // wins yet.
  wins: string[];
  // Watch-outs (3 max). Specific concerns to flag honestly. Each is
  // also a candidate trigger for the model-feedback alert.
  watch_outs: string[];
  // Sharp-positioning callouts (3 max). Picks where the user went
  // against consensus by a meaningful margin. Framed as DECISIVE,
  // not reckless. Per founder direction 2026-05-08: when a user is
  // following our recommendations and we lock a player early
  // because the engine identified scarcity / format leverage, that
  // is the FEATURE, not a watch-out. Surface it positively.
  sharp_positioning: string[];
  // Model-feedback flag: true when user has been following standing
  // calls AND metrics are off_track. Triggers the "this is a model
  // alert, not a user alert" footer copy.
  // Phase 1 limitation: we don't yet store historical standing-call
  // recommendations, so we can't compute adherence directly. Set
  // false for now; a future iteration will compute it.
  model_alert_triggered: boolean;
};
