/**
 * Soundboard dial spec + JudgmentProfile type. Single source of truth
 * for "what dials exist" and "what each dial means."
 *
 * SCAFFOLD ONLY today. Storage and feedback endpoints are wired; the
 * engine does NOT yet read these values. Wiring penalizeForConstraint,
 * fill_starter, scarcity math, etc. through JudgmentProfile is a
 * planned follow-up.
 *
 * The "horizon" dial in particular is read-only mirror of the existing
 * declared draft window. Editing it here today does NOT change engine
 * behavior; the WindowsBar remains the source of truth until the
 * guided migration session.
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
  | "age_preference";

export type DialAxis =
  | { kind: "linear"; left: string; right: string }
  | { kind: "select"; options: { value: string; label: string }[] };

export type DialSpec = {
  id: DialId;
  name: string;
  short_blurb: string;
  axis: DialAxis;
  // Default value. -100..+100 for linear, or option value for select.
  default: number | string;
  // Truthful list of what the engine actually consults when this dial
  // is active. Surfaced in the tooltip. NEVER fictionalize. If the
  // dial isn't wired yet, the surface list is "Stored. Engine wiring
  // pending."
  surface: string[];
  // Whether this dial is currently READ by the engine. Used to badge
  // dials that store input but have no behavioral effect yet.
  wired: boolean;
};

export const DIAL_SPECS: DialSpec[] = [
  {
    id: "horizon",
    name: "Horizon",
    short_blurb: "Win-now urgency vs future build.",
    axis: { kind: "linear", left: "Win now", right: "Future" },
    default: 0,
    surface: [
      "Mirrors your declared draft window",
      "WindowsBar remains source of truth today",
      "Engine wiring through penalizeForConstraint is the next migration",
    ],
    wired: false,
  },
  {
    id: "rookie_tilt",
    name: "Rookie tilt",
    short_blurb: "How aggressive on rookies vs proven vets.",
    axis: { kind: "linear", left: "Cautious", right: "Aggressive" },
    default: 0,
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
    short_blurb: "Over-weight a position when close calls happen.",
    axis: {
      kind: "select",
      options: [
        { value: "balanced", label: "Balanced" },
        { value: "qb", label: "QB-first" },
        { value: "rb", label: "RB-first" },
        { value: "wr", label: "WR-first" },
        { value: "te", label: "TE-first" },
      ],
    },
    default: "balanced",
    surface: [
      "Tie-breaker on equally ranked candidates of different positions",
      "Stored. Engine wiring pending.",
    ],
    wired: false,
  },
  {
    id: "age_preference",
    name: "Roster age preference",
    short_blurb: "Youth movement vs proven veterans.",
    axis: { kind: "linear", left: "Youth", right: "Proven" },
    default: 0,
    surface: [
      "Modifies the age-band penalty in penalizeForConstraint",
      "Heavy youth = 22-26 ideal band; heavy proven = 26-30",
      "Stored. Engine wiring pending.",
    ],
    wired: false,
  },
];

export type JudgmentProfile = {
  // Map of dial id to current value. Linear dials use number;
  // select dials use string. Defaults applied when missing.
  dials: Record<DialId, number | string>;
  // Optional metadata. last_edited_at distinguishes "never touched"
  // (still showing defaults) from "actively zeroed out" by a user.
  last_edited_at: string | null;
};

export function defaultProfile(): JudgmentProfile {
  const dials: Record<string, number | string> = {};
  for (const spec of DIAL_SPECS) {
    dials[spec.id] = spec.default;
  }
  return {
    dials: dials as JudgmentProfile["dials"],
    last_edited_at: null,
  };
}

// Argue feedback shapes. These are the predefined dissent buttons in
// the argue modal; users can also submit free-text via the comment
// field. Keeping the shape list short forces meaningful taxonomy.
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
