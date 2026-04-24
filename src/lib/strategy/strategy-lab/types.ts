/**
 * Strategy Lab types. The Lab answers "what's still open for me?"
 * during the early-to-mid draft, when the user has too few picks for
 * the Decision card to be the dominant frame.
 *
 * The killer continuation (per founder note 2026-04-24): once the user
 * is at picks 4-6 the Lab should also surface counter-position
 * opportunities. If 8 of 12 opponents are leaning win-now, the Lab
 * should explicitly say "the future window is open for you" so the
 * user can thread a different needle than the room.
 */

export type StrategyLabPathState =
  | "open" // viable; user can commit cleanly
  | "narrowing" // anchors are getting picked; window closing
  | "closing" // last realistic shot
  | "closed"; // anchors gone or score collapsed

export type StrategyLabAnchor = {
  player_id: string;
  name: string;
  position: string | null;
  team: string | null;
  adp: number | null;
  // True when the anchor is still in the available pool. False when
  // they've been drafted (in this league or are projected gone before
  // the user's next pick).
  available: boolean;
  // ADP-relative pick at which we expect them gone. Null when ADP
  // unknown OR when already drafted.
  expected_gone_by: number | null;
};

export type StrategyLabPath = {
  archetype_id: string;
  archetype_name: string;
  archetype_tagline: string;
  // 0-100 viability for THIS user RIGHT NOW. Derived from
  // RankedArchetype.total_score, scaled. Anchors-available state can
  // depress this further.
  viability: number;
  state: StrategyLabPathState;
  // 1-3 named players who are the canonical fit. UI shows availability
  // chips so the user sees who's still on the board for this path.
  anchors: StrategyLabAnchor[];
  // One-line rule: "closes if Bijan AND Achane both go before pick 12"
  // or "open until pick 18 (Sweat91 thread)". Null when no specific
  // closure rule is computable.
  closes_if: string | null;
  // Optional: explicit counter-position note. Fires when the path is
  // open AND the league pulse is heavily on a different posture.
  counter_position_note: string | null;
};

export type StrategyLabLeaguePulse = {
  win_now_count: number;
  win_future_count: number;
  hybrid_count: number;
  total_with_signal: number;
  // Headline insight: "8 of 12 opponents are pushing win-now. Future
  // window is open for you." Null when the room is too balanced or too
  // early to call.
  headline: string | null;
};

export type StrategyLabState = {
  // Sorted by viability descending. UI surfaces top 4-5.
  paths: StrategyLabPath[];
  league_pulse: StrategyLabLeaguePulse;
  // True when the Lab should be PROMINENT (early draft, few picks made
  // by user, big path-state changes recent). False when it should be a
  // background-context surface.
  prominent: boolean;
  // Reason the Lab is prominent (or null). Drives a small headline on
  // the panel: "Pick 1.03: 5 paths still open. Choose wisely."
  prominence_reason: string | null;
};
