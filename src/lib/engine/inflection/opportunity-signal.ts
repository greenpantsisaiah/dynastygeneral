/**
 * Inflection opportunity signal (CANONICAL).
 *
 * Wraps the canonical role read (`readOpportunity`, players/opportunity-read.ts)
 * as one inflection-scorecard signal for the aging-cliff windows. The trend
 * logic and the role-description string live in readOpportunity so this
 * signal and the candidate-card detail cite identical numbers and the same
 * rising/falling call. Per the dynasty-canon-keeper grounding (2026-05-25):
 * opportunity is THE research-defensible usage signal (target / weighted-
 * opportunity share sticky ~0.70 YoY, ~0.95 correlated with PPR), so a rising
 * or eroding earned role is a real read on whether an aging player holds his
 * production.
 *
 * Direction maps the read's trend onto the window's two stories: a rising
 * role is story_a (continued role), an eroding one is story_b (cliff edge),
 * flat is neutral. data_missing when the prior season carries no role data.
 *
 * Confidence is "partial": the underlying signal (opportunity) is
 * research-backed, but the material-change threshold (in readOpportunity)
 * is an observation-tier heuristic until the Phase 2 logistic fit
 * calibrates it. Marking it "validated" would over-claim the threshold.
 */

import type { Position } from "../../strategy/archetypes/schema";
import type { OpportunityProfile } from "@/lib/players/season-stats";
import { readOpportunity } from "@/lib/players/opportunity-read";
import type { InflectionSignal } from "./types";

const OPPORTUNITY_CITATION =
  "Opportunity stickiness ~0.70 YoY, ~0.95 corr with PPR (dynasty-canon-keeper grounding 2026-05-25)";

export function buildOpportunitySignal(args: {
  position: Position;
  prev: OpportunityProfile | null;
  prevPrev: OpportunityProfile | null;
}): InflectionSignal {
  const { position, prev, prevPrev } = args;
  const base: Pick<
    InflectionSignal,
    "name" | "description" | "confidence" | "citation"
  > = {
    name:
      position === "RB"
        ? "Pass-down role + snap share"
        : "Earned opportunity (snap share + targets)",
    description:
      position === "RB"
        ? "Snap share and per-game targets. High pass involvement is the strongest 'ages better' signal for RBs; a pure early-down workhorse cliffs harder."
        : "Snap share and per-game targets. Role volume is the stickiest, most predictive usage signal for receivers.",
    confidence: "partial",
    citation: OPPORTUNITY_CITATION,
  };

  const read = readOpportunity({ prev, prevPrev });
  if (!read) {
    return {
      ...base,
      direction: "data_missing",
      observation: "Snap share / per-game targets not in the prior-season feed.",
    };
  }

  const direction: InflectionSignal["direction"] =
    read.trend === "rising"
      ? "story_a"
      : read.trend === "falling"
        ? "story_b"
        : "neutral";

  return {
    ...base,
    direction,
    observation: `${read.line} (${read.detail}).`,
  };
}
