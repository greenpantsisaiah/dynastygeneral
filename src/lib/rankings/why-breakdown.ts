/**
 * Per-player "why does the model rank you here" breakdown.
 *
 * Built so /rankings can expand any row and show the 7 component
 * scores, the user's current dial weights, and each component's
 * contribution to the player's adjustment. Same payload shape can be
 * consumed by active-draft surfaces (Decision card, Next Picks Plan)
 * for a unified explainability layer.
 *
 * Voice matches the inflection panel: validated/partial labels per
 * component, observation strings naming WHY each signal fires
 * ("age 22 inside RB peak band"), and a model-lean summary.
 *
 * Founder direction 2026-05-15 (watticus thread, James Conner
 * inflection card screenshot): "this type of data is super valuable
 * and exposes the strength of our model. Available on rankings and
 * during draft."
 */

import type { RankedPlayer } from "./build";

/**
 * Matches the per-component scoring in `build.ts` so the contribution
 * math stays in one place. Keep aligned with `DIAL_EMPHASIS_RANGE` in
 * `components/rankings/rankings-lab.tsx`.
 */
export const DIAL_EMPHASIS_RANGE = 60;

export type WhyDials = {
  youth: number;
  bellcow: number;
  continuity: number;
  horizon: number;
  rookie: number;
  risk: number;
  consensus: number;
};

export type WhyComponent = {
  id: keyof RankedPlayer["components"];
  label: string;
  /** Raw signal value, -1 to +1. */
  score: number;
  /** Dial weight as set by the user, -100 to +100. */
  dial: number;
  /** Contribution to the player's adjustment ( = dial × score × range / 100). */
  contribution: number;
  /** Human-readable explanation of why the signal fires for this player. */
  observation: string;
  /** Status: how much the signal can stand behind the observation. */
  status: "validated" | "partial" | "neutral" | "stub";
};

export type WhyBreakdown = {
  baseline: number;
  totalContribution: number;
  finalRaw: number;
  positiveCount: number;
  negativeCount: number;
  components: WhyComponent[];
  /** One-line "Model leans X" sentence matching the inflection-panel register. */
  modelLeanSummary: string;
};

const COMPONENT_LABEL: Record<WhyComponent["id"], string> = {
  youth: "Youth",
  bellcow: "Bellcow",
  continuity: "Continuity",
  horizon: "Horizon",
  rookie: "Rookie tilt",
  risk: "Risk variance",
  consensus: "Consensus",
};

function observationFor(
  id: WhyComponent["id"],
  player: RankedPlayer,
): { observation: string; status: WhyComponent["status"] } {
  const age = player.age;
  const pos = player.position;
  const isRookie = player.is_rookie;
  switch (id) {
    case "youth": {
      if (age == null) {
        return {
          observation: "Age unavailable in snapshot.",
          status: "stub",
        };
      }
      const peakBand =
        pos === "RB"
          ? "23-27"
          : pos === "WR"
            ? "24-28"
            : pos === "TE"
              ? "25-30"
              : pos === "QB"
                ? "25-31"
                : "varies by position";
      const placement =
        pos === "RB" && age <= 22
          ? `under the RB peak band (${peakBand})`
          : pos === "RB" && age >= 28
            ? `past the RB peak band (${peakBand})`
            : pos === "WR" && age <= 23
              ? `under the WR peak band (${peakBand})`
              : pos === "WR" && age >= 30
                ? `past the WR peak band (${peakBand})`
                : `inside the ${pos} peak band (${peakBand})`;
      return {
        observation: `Age ${age} ${placement}.`,
        status: "validated",
      };
    }
    case "bellcow":
      if (pos !== "RB") {
        return {
          observation: "Bellcow signal only fires on RBs.",
          status: "neutral",
        };
      }
      return {
        observation:
          "Market position rank inside the FantasyCalc RB pool (top-12 = bellcow shape, RB30+ = committee).",
        status: "partial",
      };
    case "continuity":
      return {
        observation:
          "Coach / OC / QB context signal table not yet ingested. Dial reads as neutral until v2 wires it.",
        status: "stub",
      };
    case "horizon":
      if (isRookie) {
        return {
          observation: "Rookie. Maximum career runway.",
          status: "validated",
        };
      }
      if (age == null) {
        return {
          observation: "Age unavailable. Runway not computable.",
          status: "stub",
        };
      }
      return {
        observation: `Linear runway around age 28 anchor. Age ${age} is ${
          age <= 24 ? "young runway" : age <= 28 ? "mid-runway" : "short runway"
        }.`,
        status: "validated",
      };
    case "rookie":
      return {
        observation: isRookie
          ? "Year-one player. No NFL track record."
          : "Veteran. Has NFL production history.",
        status: "validated",
      };
    case "risk":
      if (isRookie) {
        return {
          observation:
            "Rookie variance. Wider outcome distribution than veterans.",
          status: "validated",
        };
      }
      return {
        observation:
          "Variance proxy from position rank and market rank. v1 heuristic.",
        status: "partial",
      };
    case "consensus":
      if (isRookie) {
        return {
          observation:
            "Rookies read as off-consensus by design (the market hedges on unknown profiles).",
          status: "validated",
        };
      }
      return {
        observation:
          "Cross-check of FantasyCalc position rank against market overall rank. v1 heuristic.",
        status: "partial",
      };
    default:
      return { observation: "", status: "neutral" };
  }
}

export function computeWhyBreakdown(
  player: RankedPlayer,
  dials: WhyDials,
): WhyBreakdown {
  const ids: WhyComponent["id"][] = [
    "youth",
    "bellcow",
    "continuity",
    "horizon",
    "rookie",
    "risk",
    "consensus",
  ];
  const components: WhyComponent[] = ids.map((id) => {
    const score = player.components[id];
    const dial = dials[id];
    const contribution =
      (dial / 100) * score * DIAL_EMPHASIS_RANGE;
    const meta = observationFor(id, player);
    return {
      id,
      label: COMPONENT_LABEL[id],
      score,
      dial,
      contribution,
      observation: meta.observation,
      status: meta.status,
    };
  });

  const totalContribution = components.reduce(
    (s, c) => s + c.contribution,
    0,
  );
  const baseline = player.baseline_value;
  const finalRaw = baseline + totalContribution;

  // "Fires" means signal × dial moves the score in the same direction
  // as the signal sign. A positive component with a positive dial fires
  // positive; same component with a negative dial fires negative.
  // Continuity is excluded because it is a stub today.
  const meaningful = components.filter(
    (c) => c.id !== "continuity" && Math.abs(c.contribution) > 0.5,
  );
  const positiveCount = meaningful.filter((c) => c.contribution > 0).length;
  const negativeCount = meaningful.filter((c) => c.contribution < 0).length;

  const lean =
    totalContribution > 1
      ? "boosts"
      : totalContribution < -1
        ? "discounts"
        : "leaves alone";
  const summary =
    lean === "leaves alone"
      ? `Your dials leave ${player.name} at the consensus market value (${Math.round(baseline)}).`
      : `Your dials ${lean} ${player.name} by ${formatSigned(totalContribution)} from the consensus market value (${Math.round(baseline)} → ${Math.round(finalRaw)}). ${positiveCount} of 7 signals push up, ${negativeCount} push down.`;

  return {
    baseline,
    totalContribution,
    finalRaw,
    positiveCount,
    negativeCount,
    components,
    modelLeanSummary: summary,
  };
}

function formatSigned(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (r === 0) return "0";
  return r > 0 ? `+${r}` : `${r}`;
}
