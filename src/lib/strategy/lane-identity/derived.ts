/**
 * Derived (composite) lanes. Computed AFTER base lanes resolve.
 *
 * Per assumption audit 2026-05-12: the Venn picture was incomplete
 * without composites that flag multi-lane membership shapes.
 *
 *   sustained_contender   IN when win_now_floor=in AND
 *                         future_stock >= close AND any archetype=in.
 *                         The "winning shape": you compete now AND
 *                         have the rookies / youth to sustain.
 *
 *   zero_rb               IN when rb_bellcow=not_in AND wr_stable=in.
 *                         A deliberate strategy (heavy WR + late RB),
 *                         not a deficit. Without this lane, a Zero-RB
 *                         roster reads as "missing the bellcow" when
 *                         it's actually executing a coherent plan.
 *
 * Derived lanes have NO per-player scorePlayer function. The aggregate
 * is a condition-count, not a value sum. Contributors are pulled from
 * constituent base lanes for UI continuity.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type {
  GapMoveType,
  LaneId,
  LaneMembership,
  LaneScoreEntry,
} from "./types";

export type DerivedLaneSpec = {
  id: LaneId;
  label: string;
  blurb: string;
  appliesTo: (snap: LeagueSnapshot) => boolean;
  derive: (args: {
    base: LaneMembership[];
    snap: LeagueSnapshot;
  }) => LaneMembership;
};

const ALL_FORMATS = (): boolean => true;

function getBase(base: LaneMembership[], id: LaneId): LaneMembership | null {
  return base.find((m) => m.lane_id === id) ?? null;
}

function dedupeContributors(
  sources: LaneMembership[],
  limit: number,
): LaneScoreEntry[] {
  const seen = new Set<string>();
  const out: LaneScoreEntry[] = [];
  // Merge all contributors across sources, keep highest contribution
  // per player, sort descending.
  const acc = new Map<string, LaneScoreEntry>();
  for (const m of sources) {
    for (const c of m.contributors) {
      const prev = acc.get(c.player_id);
      if (!prev || c.contribution > prev.contribution) acc.set(c.player_id, c);
    }
  }
  const sorted = [...acc.values()].sort(
    (a, b) => b.contribution - a.contribution,
  );
  for (const c of sorted) {
    if (seen.has(c.player_id)) continue;
    seen.add(c.player_id);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

const SUSTAINED_CONTENDER: DerivedLaneSpec = {
  id: "sustained_contender",
  label: "Sustained Contender",
  blurb: "Winning now AND positioned to win again next year. Multi-lane composite.",
  appliesTo: ALL_FORMATS,
  derive({ base }) {
    const winNow = getBase(base, "win_now_floor");
    const future = getBase(base, "future_stock");
    const anyArchetypeIn = base.some(
      (m) =>
        m.axis === "archetype" &&
        m.state === "in" &&
        m.lane_id !== "trade_capital",
      // Trade Capital alone doesn't make a contender; need a real
      // anchor lane (Bellcow / Anchor / Stable / Premium Lock).
    );
    let conditionsMet = 0;
    if (winNow && winNow.state === "in") conditionsMet++;
    if (future && (future.state === "in" || future.state === "close")) {
      conditionsMet++;
    }
    if (anyArchetypeIn) conditionsMet++;

    const state: LaneMembership["state"] =
      conditionsMet >= 3 ? "in" : conditionsMet >= 2 ? "close" : "not_in";

    const contributors = dedupeContributors(
      [winNow, future, ...base.filter((m) => m.axis === "archetype")].filter(
        (m): m is LaneMembership => m !== null,
      ),
      6,
    );

    let gap: { description: string; move_type: GapMoveType } | null = null;
    if (state === "close") {
      const missing: string[] = [];
      if (winNow && winNow.state !== "in") missing.push("Win-Now Floor");
      if (future && future.state === "not_in") missing.push("Future Stock");
      if (!anyArchetypeIn) missing.push("an archetype anchor");
      gap = {
        description: `One step from Sustained Contender. Missing: ${missing.join(", ")}.`,
        move_type: "trade_for",
      };
    }

    return {
      lane_id: "sustained_contender",
      label: "Sustained Contender",
      blurb: SUSTAINED_CONTENDER.blurb,
      axis: "composite",
      state,
      aggregate_score: conditionsMet,
      in_threshold: 3,
      close_threshold: 2,
      contributors,
      gap,
      is_derived: true,
    };
  },
};

const ZERO_RB: DerivedLaneSpec = {
  id: "zero_rb",
  label: "Zero-RB",
  blurb: "Deliberate RB-light build with WR / TE depth carrying the lineup.",
  appliesTo: ALL_FORMATS,
  derive({ base }) {
    const rbBellcow = getBase(base, "rb_bellcow");
    const wrStable = getBase(base, "wr_stable");
    // Zero-RB IS a strategy only when rb_bellcow is genuinely not-in
    // (no real workhorse) AND skill-depth elsewhere carries the
    // lineup. WR Stable IN is the core requirement.
    const rbAbsent = rbBellcow != null && rbBellcow.state === "not_in";
    const wrIn = wrStable != null && wrStable.state === "in";
    const wrClose = wrStable != null && wrStable.state === "close";

    let state: LaneMembership["state"];
    if (rbAbsent && wrIn) state = "in";
    else if (rbAbsent && wrClose) state = "close";
    else state = "not_in";

    const contributors = wrStable
      ? dedupeContributors([wrStable], 5)
      : [];

    let gap: { description: string; move_type: GapMoveType } | null = null;
    if (state === "close") {
      gap = {
        description:
          "One WR2-tier add lands Zero-RB. Stash high-upside late-round RBs; do not trade for a bellcow.",
        move_type: "trade_for",
      };
    }

    // aggregate_score: 2 when IN, 1 when CLOSE, 0 otherwise (the two
    // conditions: rb_bellcow=not_in + wr_stable=in/close).
    let agg = 0;
    if (rbAbsent) agg++;
    if (wrIn || wrClose) agg++;

    return {
      lane_id: "zero_rb",
      label: "Zero-RB",
      blurb: ZERO_RB.blurb,
      axis: "composite",
      state,
      aggregate_score: agg,
      in_threshold: 2,
      close_threshold: 1,
      contributors,
      gap,
      is_derived: true,
    };
  },
};

export const DERIVED_LANE_SPECS: readonly DerivedLaneSpec[] = [
  SUSTAINED_CONTENDER,
  ZERO_RB,
];
