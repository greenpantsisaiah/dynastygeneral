/**
 * Soundboard dial spec + JudgmentProfile type. Single source of truth
 * for "what dials exist" and "what each dial means."
 *
 * Refactored 2026-05-13 (Phase 1.3 of the Lab feature) from 16 dials
 * down to 8. The original spread was wishful (most dials weren't wired
 * and never got wired) and the framing was wrong (it asked the user
 * to "tune their doctrine," which the lane-identity model already
 * reads from their picks). The new framing is: perturb the model,
 * see what changes. The 8 dials that survived are either wired to a
 * real engine surface or earmarked for the next wiring pass.
 *
 * Three of the 8 dials (Youth, Bellcow, Continuity) mirror the dials
 * on the public /rankings page. Same name, same engine constants.
 * The Soundboard adds five more dials that influence Decision-card
 * synthesis, trade behavior, and market posture.
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
  | "youth_weight"
  | "bellcow_pref"
  | "continuity_weight"
  | "risk_tolerance"
  | "trade_aggression"
  | "consensus_lean";

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
  | "age"
  | "bellcow"
  | "continuity"
  | "risk"
  | "trade"
  | "consensus";

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
  // Order matters: the first three dials mirror the public /rankings
  // page so the soundboard layout actually delivers on the page's
  // claim. The remaining five layer in Decision-card synthesis and
  // trade behavior in the second row.
  {
    id: "youth_weight",
    name: "Youth weight",
    short_blurb: "How much age-curve placement moves rankings.",
    axis: { kind: "linear", left: "Ignore age", right: "Heavy age" },
    default: 0,
    icon: "age",
    surface: [
      "Mirrors the /rankings Youth dial",
      "Maps to age-curve gaussian center per position",
      "Wired on the public rankings surface; soundboard mirror in progress",
    ],
    wired: false,
  },
  {
    id: "bellcow_pref",
    name: "Bellcow preference",
    short_blurb: "RB workhorse vs committee tolerance.",
    axis: { kind: "linear", left: "Committee OK", right: "Bellcow only" },
    default: 0,
    icon: "bellcow",
    surface: [
      "Mirrors the /rankings Bellcow dial",
      "Pulls top-12 RBs up; demotes committee and passdown shapes",
      "Wired on the public rankings surface; soundboard mirror in progress",
    ],
    wired: false,
  },
  {
    id: "continuity_weight",
    name: "Coaching continuity",
    short_blurb: "OC tenure weight on rankings.",
    axis: { kind: "linear", left: "Ignore OC", right: "Stable OC bonus" },
    default: 0,
    icon: "continuity",
    surface: [
      "Mirrors the /rankings Continuity dial",
      "Maps to OC tenure weight in team-signal extraction",
      "Wired on rankings; 32-team signal table is mid-calibration",
    ],
    wired: false,
  },
  {
    id: "horizon",
    name: "Horizon",
    short_blurb: "Win-now urgency vs future build.",
    axis: { kind: "linear", left: "Win now", right: "Future" },
    default: 0,
    icon: "horizon",
    surface: [
      "Weights win-now vs future scoring across Decision lanes",
      "Used by the engine's lane-identity threshold scaling",
    ],
    wired: true,
  },
  {
    id: "rookie_tilt",
    name: "Rookie tilt",
    short_blurb: "Cautious vs aggressive on rookies.",
    axis: { kind: "linear", left: "Cautious", right: "Aggressive" },
    default: 0,
    icon: "rookie",
    surface: [
      "Cross-checks rookie ADP variant + NFL draft window state",
      "Reads FantasyCalc dynasty rank for rookie comparison",
      "Stored. Engine wiring in progress.",
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
    id: "consensus_lean",
    name: "Consensus lean",
    short_blurb: "Lean with the market vs against the field.",
    axis: { kind: "linear", left: "Contrarian", right: "Market" },
    default: 0,
    icon: "consensus",
    surface: [
      "Weights KTC majority signal in ranking cascade",
      "Counter-view detector tightens or loosens accordingly",
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
