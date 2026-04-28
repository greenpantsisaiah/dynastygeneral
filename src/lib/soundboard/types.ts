/**
 * Soundboard dial spec + JudgmentProfile type. Single source of truth
 * for "what dials exist" and "what each dial means."
 *
 * SCAFFOLD STILL: storage and feedback endpoints are wired; the
 * engine does NOT yet read these values. Wiring penalizeForConstraint,
 * fill_starter, scarcity math, etc. through JudgmentProfile is a
 * planned follow-up.
 *
 * The "horizon" dial in particular is a read-only mirror of the
 * existing declared draft window. Editing it here today does NOT
 * change engine behavior; the WindowsBar remains the source of truth
 * until the guided migration session.
 *
 * Adding a dial:
 *   1. Add to DIAL_SPECS below.
 *   2. (When wiring) Add the consumer to the engine surface that uses it.
 *   3. (When wiring) Update the dial's `surface` list so the tooltip
 *      stays truthful about WHAT the dial does.
 */

export type DialId =
  | "horizon"
  | "rookie_tilt"
  | "risk_tolerance"
  | "trade_aggression"
  | "position_bias"
  | "age_preference"
  | "consensus_lean"
  | "anchor_weight"
  | "variance_tolerance"
  | "coach_voice"
  | "underdog_premium"
  | "stack_preference"
  | "schedule_weight"
  | "league_pulse"
  | "trade_depth"
  | "doctrine_certainty";

export type DialAxis =
  | { kind: "linear"; left: string; right: string }
  | { kind: "select"; options: { value: string; label: string }[] }
  | { kind: "seg3"; options: { value: string; label: string }[] }
  | { kind: "seg5"; options: { value: string; label: string }[] }
  | { kind: "range"; min: number; max: number; left: string; right: string }
  | { kind: "multi"; options: { value: string; label: string }[] };

// A dial value is one of:
//   - number (linear)
//   - string (select / seg3 / seg5)
//   - [number, number] (range)
//   - string[] (multi)
export type DialValue = number | string | [number, number] | string[];

export type DialIcon =
  | "horizon"
  | "rookie"
  | "risk"
  | "trade"
  | "position"
  | "age"
  | "consensus"
  | "anchor"
  | "variance"
  | "voice"
  | "underdog"
  | "stack"
  | "schedule"
  | "pulse"
  | "depth"
  | "doctrine";

export type DialSpec = {
  id: DialId;
  name: string;
  short_blurb: string;
  axis: DialAxis;
  default: DialValue;
  icon: DialIcon;
  surface: string[];
  wired: boolean;
};

export const DIAL_SPECS: DialSpec[] = [
  {
    id: "horizon",
    name: "Horizon",
    short_blurb: "Win-now urgency vs future build.",
    axis: { kind: "linear", left: "Win now", right: "Future" },
    default: 0,
    icon: "horizon",
    surface: [
      "Wired into Decision card constraint penalty",
      "Move to ±40+ to override the engine's auto-window read",
      "Layered with emergent trajectory: either signal can soften the constraint",
    ],
    wired: true,
  },
  {
    id: "rookie_tilt",
    name: "Rookie tilt",
    short_blurb: "How aggressive on rookies vs proven vets.",
    axis: { kind: "linear", left: "Cautious", right: "Aggressive" },
    default: 0,
    icon: "rookie",
    surface: [
      "Cross-checks rookie ADP variant + NFL draft window state",
      "Reads FantasyCalc dynasty rank for rookie comparison",
      "Stored. Engine wiring pending.",
    ],
    wired: false,
  },
  {
    id: "risk_tolerance",
    name: "Risk tolerance",
    short_blurb: "Chalk picks vs upside swings.",
    axis: { kind: "linear", left: "Chalk", right: "Gambler" },
    default: 0,
    icon: "risk",
    surface: [
      "Tier-crunch detector reads ADP volatility per slot",
      "5-pick-deep plan + opponent gap analysis informs swing tolerance",
      "Stored. Engine wiring pending.",
    ],
    wired: false,
  },
  {
    id: "trade_aggression",
    name: "Trade aggression",
    short_blurb: "Sit tight vs propose deals.",
    axis: { kind: "linear", left: "Sit tight", right: "Deal-maker" },
    default: 0,
    icon: "trade",
    surface: [
      "Scans 11 opponents per league for need alignment",
      "KTC-anchored pricing bound at +/- 15% of fair",
      "Stored. Engine wiring pending.",
    ],
    wired: false,
  },
  {
    id: "position_bias",
    name: "Position bias",
    short_blurb: "Tie-break preference on close calls.",
    axis: {
      kind: "seg5",
      options: [
        { value: "balanced", label: "Balanced" },
        { value: "qb", label: "QB" },
        { value: "rb", label: "RB" },
        { value: "wr", label: "WR" },
        { value: "te", label: "TE" },
      ],
    },
    default: "balanced",
    icon: "position",
    surface: [
      "Tie-breaker on equally ranked candidates of different positions",
      "Stored. Engine wiring pending.",
    ],
    wired: false,
  },
  {
    id: "age_preference",
    name: "Age preference",
    short_blurb: "Your ideal target age band.",
    axis: { kind: "range", min: 20, max: 34, left: "Younger", right: "Older" },
    default: [22, 28],
    icon: "age",
    surface: [
      "Sets the ideal age band in penalizeForConstraint",
      "Heavy youth: 22-26 ideal; balanced: 23-28; veteran: 25-30",
      "Stored. Engine wiring pending.",
    ],
    wired: false,
  },
  {
    id: "consensus_lean",
    name: "Consensus lean",
    short_blurb: "Lean with the market vs against the field.",
    axis: { kind: "linear", left: "Contrarian", right: "Market" },
    default: 0,
    icon: "consensus",
    surface: [
      "Weights KTC/ADP majority signal in ranking cascade",
      "Counter-view detector tightens or loosens accordingly",
      "Stored. Engine wiring pending.",
    ],
    wired: false,
  },
  {
    id: "anchor_weight",
    name: "Anchor weight",
    short_blurb: "Which signal wins ranking-cascade ties.",
    axis: {
      kind: "seg3",
      options: [
        { value: "ktc", label: "KTC first" },
        { value: "adp", label: "ADP first" },
        { value: "heuristic", label: "Heuristic" },
      ],
    },
    default: "ktc",
    icon: "anchor",
    surface: [
      "Sets the ranking-cascade priority order",
      "KTC first (default): market value wins; ADP first: crowd wins",
      "Stored. Engine wiring pending.",
    ],
    wired: false,
  },
  {
    id: "variance_tolerance",
    name: "Variance tolerance",
    short_blurb: "Sticky plan vs adaptive branches.",
    axis: { kind: "linear", left: "Sticky", right: "Adaptive" },
    default: 0,
    icon: "variance",
    surface: [
      "Counter-view aggressiveness on Decision card",
      "Branch alternatives surface threshold in 5-pick plan",
      "Stored. Engine wiring pending.",
    ],
    wired: false,
  },
  {
    id: "coach_voice",
    name: "Coach voice",
    short_blurb: "Cautious analyst vs confident general.",
    axis: {
      kind: "seg3",
      options: [
        { value: "cautious", label: "Cautious" },
        { value: "measured", label: "Measured" },
        { value: "confident", label: "Confident" },
      ],
    },
    default: "measured",
    icon: "voice",
    surface: [
      "Coach pushback strength when user disagrees",
      "Verdict hedging level (cautious adds caveats; confident states the call)",
      "Stored. Engine wiring pending.",
    ],
    wired: false,
  },
  {
    id: "underdog_premium",
    name: "Underdog premium",
    short_blurb: "Bonus weight on undervalued assets.",
    axis: { kind: "linear", left: "Ignore", right: "Heavy" },
    default: 0,
    icon: "underdog",
    surface: [
      "Bonus modifier when KTC < ADP (asset trades cheap to consensus)",
      "Stronger ADP-gap reward in Strategic Forks",
      "Stored. Engine wiring pending.",
    ],
    wired: false,
  },
  {
    id: "stack_preference",
    name: "Stack preference",
    short_blurb: "Which stacking patterns you actively want.",
    axis: {
      kind: "multi",
      options: [
        { value: "qb_wr_same_team", label: "QB-WR same team" },
        { value: "rb_handcuff", label: "RB + handcuff" },
        { value: "wr_stacks", label: "Multiple WRs same team" },
        { value: "avoid_all", label: "Avoid all stacks" },
      ],
    },
    default: [],
    icon: "stack",
    surface: [
      "Decision card stack-bonus when candidate creates desired stack",
      "Coach trade-suggest framing favors enabled patterns",
      "Stored. Engine wiring pending.",
    ],
    wired: false,
  },
  {
    id: "schedule_weight",
    name: "Schedule weight",
    short_blurb: "How heavily strength of schedule factors in.",
    axis: { kind: "linear", left: "Ignore SOS", right: "Heavy SOS" },
    default: 0,
    icon: "schedule",
    surface: [
      "SOS modifier in ranking cascade when active",
      "Playoff-window weighting in path commitments",
      "Stored. Engine wiring pending.",
    ],
    wired: false,
  },
  {
    id: "league_pulse",
    name: "League pulse",
    short_blurb: "Sensitivity to opponent league moves.",
    axis: { kind: "linear", left: "Ignore", right: "Respond fast" },
    default: 0,
    icon: "pulse",
    surface: [
      "League Pulse banner aggressiveness",
      "Briefings trigger threshold on opponent state changes",
      "Stored. Engine wiring pending.",
    ],
    wired: false,
  },
  {
    id: "trade_depth",
    name: "Trade depth",
    short_blurb: "Single-asset vs multi-piece consolidation.",
    axis: { kind: "linear", left: "1-for-1", right: "Multi-piece" },
    default: 0,
    icon: "depth",
    surface: [
      "Coach trade-suggest structure preference",
      "Pricing-block construction biases simple vs consolidated",
      "Stored. Engine wiring pending.",
    ],
    wired: false,
  },
  {
    id: "doctrine_certainty",
    name: "Doctrine certainty",
    short_blurb: "Open to disagreement vs stick to plan.",
    axis: { kind: "linear", left: "Open", right: "Locked" },
    default: 0,
    icon: "doctrine",
    surface: [
      "Coach pushback rule capitulation threshold",
      "Counter-view weighting on Decision card",
      "Meta-dial: governs how the system relates to your judgment",
      "Stored. Engine wiring pending.",
    ],
    wired: false,
  },
];

export type JudgmentProfile = {
  // Map of dial id to current value. Defaults applied when missing.
  dials: Record<DialId, DialValue>;
  // Per-dial WHY captured when the user moves a dial off default.
  // The dial movement is the position; the note is the stated
  // reasoning. Surfaces to admin as the calibration signal.
  notes: Partial<Record<DialId, string>>;
  // Optional metadata. last_edited_at distinguishes "never touched"
  // (still showing defaults) from "actively zeroed out" by a user.
  last_edited_at: string | null;
};

export const DIAL_NOTE_MAX_LENGTH = 500;

export function defaultProfile(): JudgmentProfile {
  const dials: Record<string, DialValue> = {};
  for (const spec of DIAL_SPECS) {
    dials[spec.id] = spec.default;
  }
  return {
    dials: dials as JudgmentProfile["dials"],
    notes: {},
    last_edited_at: null,
  };
}

export function isAtDefault(spec: DialSpec, value: DialValue): boolean {
  switch (spec.axis.kind) {
    case "linear":
      return value === spec.default;
    case "select":
    case "seg3":
    case "seg5":
      return value === spec.default;
    case "range":
      return (
        Array.isArray(value) &&
        Array.isArray(spec.default) &&
        value[0] === spec.default[0] &&
        value[1] === spec.default[1]
      );
    case "multi":
      return Array.isArray(value) && value.length === 0;
  }
}

// Argue feedback shapes (parked). Kept for backward compatibility with
// the existing /api/soundboard/argue route + mixer_feedback table. The
// per-dial Argue trigger is removed from the UI; these activate again
// when engine wiring lands and "your baseline weight is wrong" becomes
// a coherent claim.
export const FEEDBACK_SHAPES = [
  "weights_too_heavy",
  "weights_too_light",
  "ignores_signal",
  "wrong_for_format",
  "other",
] as const;

export type FeedbackShape = (typeof FEEDBACK_SHAPES)[number];

export const FEEDBACK_SHAPE_LABELS: Record<FeedbackShape, string> = {
  weights_too_heavy: "Weights this signal too heavily",
  weights_too_light: "Weights this signal too lightly",
  ignores_signal: "Ignores something that should matter",
  wrong_for_format: "Wrong for my league format",
  other: "Other (free text)",
};
