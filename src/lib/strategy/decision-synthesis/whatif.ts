/**
 * What-if counterfactual: "If I take Lane 2's primary instead of the
 * standing call, what's the EV delta?"
 *
 * Per the redesign spec (Phase B "What-if toggle"): users want to
 * explore counterfactuals without leaving the Decision card. This
 * module produces the data the UI renders next to each lane primary:
 * a small EV delta vs the standing call, plus a one-line narrative
 * grounded in the same per-pick math as the EV bank.
 *
 * The math: for each candidate, ev_if_chosen = perPickEv(value,
 * pick_no, adp) (the canonical EV-bank formula). The delta is each
 * candidate's ev_if_chosen minus the standing call's ev_if_chosen.
 * Negative delta = the standing call is the higher-EV play; positive
 * delta = this lane is.
 *
 * This is the SAME per-pick math the EV bank uses, so the
 * counterfactual numbers are directly comparable to the bank.
 */

import type { DecisionTopCandidate } from "./types";
import { perPickEv, round2 } from "@/lib/strategy/ev-bank/formula";

export type WhatIfEvEntry = {
  player_id: string;
  player_name: string;
  position: string | null;
  // EV contribution at this pick if the user takes this candidate.
  // = perPickEv(value, pick_no, adp). Null when value or ADP missing.
  ev_if_chosen: number | null;
  // EV delta vs the standing call. Positive = this candidate is
  // higher-EV than the lean. Null when either side's EV is null.
  delta_vs_standing_call: number | null;
  // Survival probability passed through from the candidate.
  survival_pct: number | null;
  // True when this entry IS the standing call. Useful for the UI
  // to render the row differently.
  is_standing_call: boolean;
  // One-line counterfactual narrative. "Higher market discount
  // (+1.4 EV) but lower survival" / "Same EV; pivot is a coin flip"
  // / etc. Voice A.
  narrative: string;
};

export type WhatIfReadout = {
  // The standing call's player_id, for cross-reference.
  standing_call_id: string;
  // The standing call's EV (= ev_if_chosen for the standing call).
  // Null when value or ADP missing.
  standing_call_ev: number | null;
  entries: WhatIfEvEntry[];
};

export function computeWhatIfReadout(args: {
  standingCallId: string;
  candidates: DecisionTopCandidate[];
  currentPickNo: number;
}): WhatIfReadout {
  const { standingCallId, candidates, currentPickNo } = args;
  const standingEntry = candidates.find((c) => c.player_id === standingCallId);
  const standingEv = computeEv({
    value: standingEntry?.value,
    adp: standingEntry?.adp,
    pickNo: currentPickNo,
  });

  const entries: WhatIfEvEntry[] = candidates.map((c) => {
    const ev = computeEv({
      value: c.value,
      adp: c.adp,
      pickNo: currentPickNo,
    });
    const delta =
      ev != null && standingEv != null ? round2(ev - standingEv) : null;
    return {
      player_id: c.player_id,
      player_name: c.name,
      position: c.position,
      ev_if_chosen: ev,
      delta_vs_standing_call: delta,
      survival_pct: c.survival_pct,
      is_standing_call: c.player_id === standingCallId,
      narrative: composeNarrative({
        candidate: c,
        ev,
        delta,
        isStandingCall: c.player_id === standingCallId,
      }),
    };
  });

  return {
    standing_call_id: standingCallId,
    standing_call_ev: standingEv,
    entries,
  };
}

function computeEv(args: {
  value: number | null | undefined;
  adp: number | null | undefined;
  pickNo: number;
}): number | null {
  const { value, adp, pickNo } = args;
  if (typeof value !== "number" || typeof adp !== "number") return null;
  return round2(perPickEv(value, pickNo, adp));
}

function composeNarrative(args: {
  candidate: DecisionTopCandidate;
  ev: number | null;
  delta: number | null;
  isStandingCall: boolean;
}): string {
  const { candidate, ev, delta, isStandingCall } = args;
  if (isStandingCall) {
    if (ev == null) return "Standing call. Pricing not resolved.";
    if (ev >= 0) {
      return `Standing call. EV ${formatSigned(ev)}; you are getting the asset.`;
    }
    return `Standing call. EV ${formatSigned(ev)}; sharp lock against ADP.`;
  }
  if (delta == null) {
    return "Pricing not resolved; cannot quantify the swap.";
  }
  const survivalText =
    candidate.survival_pct != null
      ? ` Survival ${candidate.survival_pct}%.`
      : "";
  if (Math.abs(delta) <= 0.5) {
    return `Roughly equivalent EV (${formatSigned(delta)} vs the call).${survivalText}`;
  }
  if (delta > 0) {
    return `Higher EV (${formatSigned(delta)} vs the call).${survivalText} The market discount is bigger here.`;
  }
  return `Lower EV (${formatSigned(delta)} vs the call).${survivalText} The call is the better-priced asset.`;
}

function formatSigned(n: number): string {
  if (n >= 0) return `+${n.toFixed(1)}`;
  return n.toFixed(1);
}
