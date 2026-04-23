/**
 * Window-direction constraint for Decision Synthesis.
 *
 * Reads the user's declared window weighting + current window scores
 * and emits a constraint object that the synthesizer uses to penalize
 * candidates that violate the declared direction. This is the layer
 * that turns "windows says lean HEAVILY win-now, no rookies" into an
 * actual filter on the recommendation.
 *
 * Philosophy: SOFT constraint, not hard exclusion. A truly dominant
 * player can still win against the constraint, but the violation is
 * surfaced in the Decision card so the user sees the tradeoff.
 */

import { getWindowWeighting } from "../windows/types";
import type { WindowWeightingId } from "../windows/types";
import type { WindowsResult } from "../windows/compute";
import type { AvailablePlayer } from "@/lib/players/available";
import { rookiePenalty } from "@/lib/players/age-curve";

export type WindowDirection = "win_now" | "future" | "balanced";
export type WindowStrength = "heavy" | "moderate" | "none";

export type WindowConstraint = {
  // What the declared window + current state is telling the user to do.
  direction: WindowDirection;
  // How far off-target we are. "heavy" = actionable correction needed.
  strength: WindowStrength;
  // Human-readable summary. Used in the Decision card header and the
  // tradeoff bullets. Matches the windows-bar action sentence voice.
  sentence: string;
  // Short label for badge-level display in the decision header.
  // e.g., "Lean heavily win-now" or "On target".
  label: string;
  // Ideal age band for this direction. Candidates outside get a mild
  // penalty under moderate strength, a bigger penalty under heavy.
  ideal_age_min: number;
  ideal_age_max: number;
  // Whether rookies (is_rookie=true) should be heavily penalized.
  // True for heavy win-now, false for heavy future.
  exclude_rookies: boolean;
};

export function buildWindowConstraint(
  declaredWindow: WindowWeightingId | null,
  windows: WindowsResult,
): WindowConstraint {
  if (!declaredWindow) {
    return {
      direction: "balanced",
      strength: "none",
      sentence: "No declared window. Standard dynasty-value scoring applies.",
      label: "No target",
      ideal_age_min: 0,
      ideal_age_max: 99,
      exclude_rookies: false,
    };
  }
  const weighting = getWindowWeighting(declaredWindow);
  const target = weighting.win_now_share;
  const current = windows.win_now.score;
  const delta = current - target;
  const absDelta = Math.abs(delta);

  let strength: WindowStrength = "none";
  if (absDelta > 15) strength = "heavy";
  else if (absDelta > 5) strength = "moderate";

  // Direction is the WEIGHTING's bias, not the current-vs-target delta.
  // If target = 90 and current = 60, direction is win_now (we need to
  // push toward it). If target = 10 and current = 57, direction is
  // future (we need to push toward it).
  let direction: WindowDirection;
  if (target >= 65) direction = "win_now";
  else if (target <= 35) direction = "future";
  else direction = "balanced";

  // Age bands. Win-now emphasizes proven production (24-28 is peak).
  // Future emphasizes youth/upside (<= 24). Balanced is permissive.
  let ideal_age_min = 0;
  let ideal_age_max = 99;
  let exclude_rookies = false;
  if (direction === "win_now") {
    ideal_age_min = 24;
    ideal_age_max = 28;
    exclude_rookies = strength === "heavy";
  } else if (direction === "future") {
    ideal_age_min = 0;
    ideal_age_max = 24;
    exclude_rookies = false;
  }

  const label =
    strength === "heavy"
      ? direction === "win_now"
        ? "Lean heavily win-now"
        : direction === "future"
          ? "Lean heavily future"
          : "Balanced"
      : strength === "moderate"
        ? direction === "win_now"
          ? "Lean win-now"
          : direction === "future"
            ? "Lean future"
            : "Balanced"
        : "On target";

  const sentence = buildSentence(direction, strength, delta);

  return {
    direction,
    strength,
    sentence,
    label,
    ideal_age_min,
    ideal_age_max,
    exclude_rookies,
  };
}

function buildSentence(
  direction: WindowDirection,
  strength: WindowStrength,
  delta: number,
): string {
  if (strength === "none") {
    return "On target. Window-agnostic pick is fine.";
  }
  const mag = Math.abs(Math.round(delta));
  if (direction === "win_now") {
    if (strength === "heavy") {
      return `${mag} below win-now target. Pick should lean HEAVILY win-now: proven starter, age 24-28, no rookies.`;
    }
    return `${mag} below target. Pick should lean win-now (proven production over upside).`;
  }
  if (direction === "future") {
    if (strength === "heavy") {
      return `${mag} below future target. Pick should lean HEAVILY future: age ≤24, rookies and upside OK.`;
    }
    return `${mag} below target. Pick should lean future (youth over proven vets).`;
  }
  return "Balanced window, no strong direction.";
}

// Score penalty (subtracted from candidate score) for a player under
// the given constraint. Higher penalty = stronger push away from this
// candidate. Returns both the penalty and a human-readable note so the
// synthesizer can surface it in tradeoff bullets.
export function penalizeForConstraint(
  p: AvailablePlayer,
  c: WindowConstraint,
): { penalty: number; note: string | null } {
  if (c.strength === "none") return { penalty: 0, note: null };

  let penalty = 0;
  const notes: string[] = [];

  if (c.exclude_rookies && p.is_rookie) {
    // Position-aware rookie penalty: RB rookies hit year 1 at ~30-40%,
    // WR/QB ~15-25%, TE ~5-10%. The prior flat 40/20 penalized Bijan-
    // tier RBs the same as TE rookies, mispricing the actual hit-rate
    // distribution. See `@/lib/players/age-curve` for sources.
    penalty += rookiePenalty(
      p.position ?? null,
      c.strength === "heavy" ? "heavy" : "moderate",
    );
    notes.push("rookie");
  }

  if (typeof p.age === "number") {
    if (p.age < c.ideal_age_min) {
      const gap = c.ideal_age_min - p.age;
      penalty += c.strength === "heavy" ? gap * 6 : gap * 3;
      notes.push(`age ${p.age} (ideal ${c.ideal_age_min}-${c.ideal_age_max})`);
    } else if (p.age > c.ideal_age_max) {
      const gap = p.age - c.ideal_age_max;
      penalty += c.strength === "heavy" ? gap * 6 : gap * 3;
      notes.push(`age ${p.age} (ideal ${c.ideal_age_min}-${c.ideal_age_max})`);
    }
  }

  if (penalty === 0) return { penalty: 0, note: null };
  const directionLabel =
    c.direction === "win_now"
      ? "win-now"
      : c.direction === "future"
        ? "future"
        : "balanced";
  return {
    penalty,
    note: `Violates ${directionLabel} window: ${notes.join(", ")}.`,
  };
}
