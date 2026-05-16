/**
 * Roster Posture types. The synthesized read of where a roster sits
 * in the multi-year arc: contender, win-now, balanced, rebuilder,
 * teardown, or tank. Each posture maps to a different version of the
 * product (different hub framing, different Coach defaults, different
 * trade guardrails).
 *
 * Per founder direction 2026-05-16: dynasty is multi-year; the engine
 * needs to read where a roster sits on that arc and adapt guidance.
 * Phase 1 surfaces the posture + future capital; Phases 2-4 thread it
 * through Coach, Decision card, and trade endpoints.
 */

export type PostureCategory =
  | "contender"
  | "win_now"
  | "balanced"
  | "rebuilder"
  | "teardown"
  | "tank";

export type RecommendedLens =
  | "defend_window"
  | "complete_contender"
  | "balance_both"
  | "patient_build"
  | "preserve_capital"
  | "evaluate_teardown";

export type FutureCapitalSummary = {
  /**
   * Per-future-season counts by round. Rounds 1-3 individually; R4+
   * grouped (rookie drafts rarely run past round 4).
   */
  by_season: Record<
    string,
    { round_1: number; round_2: number; round_3: number; round_4_plus: number }
  >;
  /**
   * Future-discounted total value across all owned future picks,
   * using the canonical valueForFuturePick scale + class-strength +
   * format multipliers.
   */
  total_value: number;
  /**
   * The user's league rank for total future capital. 1 = the most
   * future-pick capital in the league. Null when we can't compute it
   * (e.g., other rosters' picks not enumerable).
   */
  league_rank: number | null;
  /** Total rosters compared (denominator for league_rank). */
  rank_total: number;
  /**
   * Count of future R1s owned, summed across all future seasons in the
   * 5-year horizon. The headline number on the posture banner.
   */
  total_first_rounders: number;
};

export type ContenderWindow = {
  /**
   * Earliest year the model thinks this roster could realistically
   * contend. Null when no window is in view (deep tank).
   */
  earliest_year: number | null;
  /**
   * Year the model thinks the contender ceiling is highest. Used as
   * the "your war is in YEAR" headline.
   */
  peak_year: number | null;
  /** Plain-English explanation of why this year. */
  why: string;
};

export type RosterPosture = {
  category: PostureCategory;
  /** 0..1 confidence the classifier has in this category. */
  confidence: number;
  contender_window: ContenderWindow;
  future_capital: FutureCapitalSummary;
  /**
   * Plain-English signals the classifier used. Surfaced under the
   * posture chip so the user can see WHY the engine read them this way.
   */
  signals: string[];
  /**
   * The product-mode lens the rest of the hub should adapt to. Drives
   * section ordering, Coach defaults, and trade guardrails downstream.
   */
  recommended_lens: RecommendedLens;
  /**
   * Plain-English headline framing of the posture, e.g. "Your war is
   * in 2027." Used at the top of the PostureBanner so the user gets
   * the so-what in 1.5 seconds.
   */
  headline: string;
};

export type ChampionHistoryEntry = {
  season: string;
  /** True when the current user was champion that season. */
  was_me: boolean;
  /** Roster id of that season's champion (in that prior league). */
  champion_roster_id: number | null;
  /** Owner id of that season's champion. */
  champion_owner_id: string | null;
};

export type ChampionHistory = {
  seasons: ChampionHistoryEntry[];
  /** Most recent season the user won, or null if never. */
  last_championship_season: string | null;
};
