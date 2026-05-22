/**
 * Companion. The emotional-ROI loop (REDESIGN_INTENTIONS.md Principle
 * 13, "Companion panel"). The companion is the existing intelligence
 * analyst gaining three capabilities: memory of what it expected (the
 * expectation ledger), reaction to what happened (reconciliation), and
 * something waiting when the user checks in (the push surface).
 *
 * A Beat is one grounded emotional reaction. The load-bearing rule
 * (the anti-slime guarantee): every beat carries a `source` with the
 * real computed signal that produced it. No source, no beat. Beats are
 * phrased by deterministic Voice A template (voice.ts), never by the
 * LLM; the LLM enters only on the Coach debate handoff. This is the
 * same discipline as the no-hardcoded-numbers invariant, applied to
 * emotion.
 *
 * Honest-first: the companion commiserates only when the user was
 * genuinely ahead and lost to variance, and critiques only when a real
 * EV gap was left. See CANONICAL_SOURCES.md "Companion beat
 * classification" / "Expectation ledger".
 */

import type { Urgency } from "../plays/types";

/** The seven grounded beat kinds. See the beat taxonomy in the spec. */
export type BeatKind =
  | "vindication" // a logged prediction resolved true
  | "bad_beat" // high-prob good outcome flipped on variance, process clean
  | "critique" // a real EV gap left by a process error
  | "debate" // user took a contrarian choice vs the standing call
  | "anticipation" // a live variance window before it resolves
  | "callback" // a named past bet reached a checkpoint
  | "milestone"; // draft midpoint / week close / season close

/** Tone drives the card's color rail and the phraser's register. */
export type BeatTone = "win" | "commiserate" | "challenge" | "neutral";

/** Which stage produced the beat. Tunes cadence + density on the surface. */
export type BeatStage =
  | "pre_draft"
  | "dynasty_draft"
  | "in_season"
  | "fast_draft";

/**
 * The anti-slime provenance. REQUIRED on every beat. `signal` names the
 * canonical that produced the beat; `detail` is the human-readable
 * provenance line shown on tap (Principle 0); `values` carries the
 * structured numbers the phraser turns into Voice A copy.
 */
export type BeatSource = {
  signal: string;
  detail: string;
  values?: Record<string, number | string | null>;
};

/** A finished beat: structured fields plus phrased Voice A copy. */
export type Beat = {
  kind: BeatKind;
  tone: BeatTone;
  stage: BeatStage;
  /** Voice A, scoped 'we' allowed, leads with the number. */
  headline: string;
  /** Optional one to two sentences. */
  body?: string;
  /** REQUIRED. No source, no beat. */
  source: BeatSource;
  /** Links to the ExpectationRecord that seeded or resolved this beat. */
  bet_id?: string;
  /** True when the beat invites a Coach debate (debate / critique). */
  prompts_handoff?: boolean;
  /** Graduated urgency (reuses the plays vocabulary). */
  urgency?: Urgency;
};

/**
 * A beat before phrasing. The classifiers produce drafts; `phraseBeat`
 * fills headline + body from `kind` + `source.values`. Keeping prose in
 * one place (voice.ts) makes the Voice A rules (no em dashes, no
 * exclamation points, scoped 'we') enforceable in one spot.
 */
export type BeatDraft = Omit<Beat, "headline" | "body">;

// ---------------------------------------------------------------------------
// Expectation ledger (companion memory)
// ---------------------------------------------------------------------------

export type ExpectationMetric = "ev" | "win_prob" | "survival_pct" | "points";

export type ExpectationHorizon = "next_pick" | "this_week" | "this_season";

export type ExpectationKind =
  | "pick" // a draft pick taken (possibly over the standing call)
  | "survival" // a survival prediction to a slot
  | "lineup" // a start/sit decision
  | "matchup" // a weekly matchup win probability
  | "play"; // a multi-pick play thesis

/**
 * The reconciliation outcome. Drives which beat (if any) fires.
 *   confirmed     -> vindication (win)
 *   variance_loss -> bad_beat (commiserate). Ahead at decision, flipped.
 *   process_error -> critique (challenge). Took the lower-EV side.
 *   neutral       -> no beat. Honest: no manufactured drama on a loss
 *                    the user was never favored to win.
 */
export type ExpectationOutcome =
  | "confirmed"
  | "variance_loss"
  | "process_error"
  | "neutral";

/**
 * One row of the expectation ledger (the `expectations` table, migration
 * 0015). Loaded at a decision moment (a pick over the call, a lineup
 * set, a pregame win probability) and reconciled when real data lands.
 */
export type ExpectationRecord = {
  bet_id: string;
  league_id: string;
  kind: ExpectationKind;
  /** Draft context. Null for in-season records. */
  created_at_pick_no: number | null;
  /** Season context. Null for draft records. */
  created_at_week: number | null;
  subject_player_id: string | null;
  /** "Mike Evans" or "Week 9 vs Saquonatraitor". */
  subject_label: string;
  // what was expected
  expected_metric: ExpectationMetric;
  /** e.g. pregame win prob 0.78, or EV +6.2, or survival 21 (%). */
  expected_value: number;
  expected_ci_low?: number | null;
  expected_ci_high?: number | null;
  // the road not taken (the alternative the engine favored, if any)
  alternative_label?: string | null;
  alternative_value?: number | null;
  /** The user's logged reasoning (the investment phase). */
  thesis?: string | null;
  // resolution
  resolution_condition: string;
  horizon: ExpectationHorizon;
  resolved: boolean;
  resolved_value?: number | null;
  resolved_at?: string | null;
  outcome?: ExpectationOutcome | null;
};

/**
 * What the caller knows once an expectation resolves. `good` is whether
 * the realized outcome was good for the user. `variance_flag` marks a
 * chance event that drove a bad outcome despite a favored position;
 * `flipped_by` names that event, and is set ONLY when the event actually
 * flipped the result (the computeWhatIfReadout counterfactual rule).
 */
export type ExpectationResolution = {
  bet_id: string;
  resolved_value: number;
  good: boolean;
  variance_flag?: boolean;
  flipped_by?: string | null;
};

// ---------------------------------------------------------------------------
// Live (non-ledger) classifier inputs
// ---------------------------------------------------------------------------

/**
 * A high-EV target with a live survival window before the user's next
 * contested pick. Built from the canonical `survivalPctFor` +
 * `computeSurvivalWindow`. Produces the anticipation beat.
 */
export type AnticipationInput = {
  subject_label: string;
  position: string | null;
  /** P(survives) to `to_pick_no`, from survivalPctFor. */
  survival_pct: number;
  to_pick_no: number;
  to_pick_label?: string | null;
  /** EV contribution if taken, for magnitude weighting. */
  ev_if_chosen?: number | null;
};

/** Draft progress for the milestone beat. */
export type DraftProgressInput = {
  picks_made: number;
  total_picks: number;
};
