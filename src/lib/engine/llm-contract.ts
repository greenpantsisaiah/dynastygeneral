/**
 * LLM operational-context contract. Single source of truth for the
 * derived rules every endpoint that uses SYSTEM_PROMPT must ship to
 * the model.
 *
 * Why this exists: the SYSTEM_PROMPT hard rules ("Respect league
 * format before claiming a position 'doesn't start'", "Trade-ask
 * realism: ±15%") REFERENCE specific field names. Each endpoint
 * previously derived those fields inline, which drifted. This module
 * is the single computation; new endpoints import these helpers and
 * the field shape becomes a compile-time guarantee instead of a
 * convention. See INVARIANTS.md "LLM operational-rules contract."
 *
 * Pattern shipped 2026-04-24 after the cross-panel decision framework
 * audit. The "second QB doesn't start in superflex" failure happened
 * because raw starter_slots was shipped without a derived
 * second_qb_starts boolean; the LLM had to infer and got it wrong.
 * Centralizing the derivation makes that failure mode structurally
 * impossible from anywhere that imports `buildFormatRules`.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import {
  SUPERFLEX_PICK_MULTIPLIER,
  startupPickValue,
} from "@/lib/players/future-picks";
import { resolvePlayerValues } from "@/lib/players/values";

/**
 * Operational rules the LLM consults before making any
 * format-dependent claim ("doesn't start", "is bench-only", etc.).
 */
export type FormatRules = {
  qb_starters_max: number;
  rb_starters_max: number;
  wr_starters_max: number;
  te_starters_max: number;
  /** True when the league starts ≥2 QBs (superflex / 2QB). */
  second_qb_starts: boolean;
  /** True when scoring includes a TE-premium multiplier. */
  te_premium: boolean;
  /** True when the league has a SUPER_FLEX slot. */
  is_superflex: boolean;
  flex_eligible: readonly ["RB", "WR", "TE"];
  sf_eligible: readonly ["QB", "RB", "WR", "TE"] | null;
};

/**
 * Trade pricing context. Pick values from the KTC-anchored
 * `startupPickValue` scale (format-multiplied for SF). Player values
 * resolved from FantasyCalc, normalized 0-100 to compose with picks.
 *
 * Endpoints that don't have draft state (e.g. assembleContext) ship
 * `pick_values: []`. The SYSTEM_PROMPT rule "no pricing = describe
 * ASK SHAPES" handles the empty case correctly.
 */
export type TradePricing = {
  scale_note: string;
  fairness_band_pct: number;
  player_values_present: boolean;
  player_value_count: number;
  player_values: Record<
    string,
    { value: number; overall_rank: number | null; position_rank: number | null }
  >;
  pick_values: Array<{
    pick_label: string;
    pick_no: number;
    round: number;
    ktc_value: number;
  }>;
  /** Multiplier applied to pick values for SF leagues (rookie QB premium). */
  sf_pick_multiplier: number;
};

/**
 * Per-position deficit between starter requirement and current count.
 * Use this for "do I need another QB" reasoning instead of inferring
 * from raw position_counts (which produces format-blind "second QB
 * doesn't start" failures in superflex).
 */
export type StarterDemand = {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
};

/**
 * Aggregate operational context. Endpoints that emit LLM calls should
 * pin a field of this type into their payload at a known path so the
 * SYSTEM_PROMPT rules can reference it cleanly.
 */
export type OperationalContext = {
  format_rules: FormatRules;
  pricing: TradePricing;
  starter_demand_remaining: StarterDemand | null;
};

const FLEX_ELIGIBLE = ["RB", "WR", "TE"] as const;
const SF_ELIGIBLE = ["QB", "RB", "WR", "TE"] as const;

/**
 * Derive FormatRules from a LeagueSnapshot. Single source of truth.
 *
 * The starter-max derivation accounts for FLEX, REC_FLEX, and
 * SUPER_FLEX slots: a position can start in its hard slot AND in any
 * eligible flex. RB and WR share FLEX; WR and TE additionally share
 * REC_FLEX; QB additionally claims SUPER_FLEX. The "max" counts assume
 * every flex is filled with the position in question (so a 1QB league
 * with 1 SUPER_FLEX has qb_starters_max = 2).
 */
export function buildFormatRulesFromSnapshot(
  snap: LeagueSnapshot,
): FormatRules {
  const ss = snap.starter_slots;
  const sfSlots = ss.superflex ?? 0;
  const flexSlots = ss.flex ?? 0;
  const recFlexSlots = ss.rec_flex ?? 0;
  const isSF = snap.format === "superflex" || snap.format === "2qb";
  const qbStartersMax = ss.hard.QB + sfSlots;
  // Skill positions: a hard starter PLUS any flex they're eligible
  // for. Conservative max (assume all flex is the position).
  const teStartersMax = ss.hard.TE + flexSlots + recFlexSlots;
  const rbStartersMax = ss.hard.RB + flexSlots;
  const wrStartersMax = ss.hard.WR + flexSlots + recFlexSlots;
  return {
    qb_starters_max: qbStartersMax,
    rb_starters_max: rbStartersMax,
    wr_starters_max: wrStartersMax,
    te_starters_max: teStartersMax,
    second_qb_starts: qbStartersMax >= 2,
    te_premium: snap.scoring.includes("TE-premium"),
    is_superflex: isSF,
    flex_eligible: FLEX_ELIGIBLE,
    sf_eligible: isSF ? SF_ELIGIBLE : null,
  };
}

/**
 * Variant of `buildFormatRules` that takes already-parsed inputs.
 * Used by endpoints (e.g. `assembleContext`) that don't have a full
 * LeagueSnapshot but DO have roster_positions + scoring info.
 */
export function buildFormatRulesFromRosterPositions(args: {
  rosterPositions: string[];
  scoringHighlights: string[];
  isSuperflex: boolean;
}): FormatRules {
  const { rosterPositions, scoringHighlights, isSuperflex } = args;
  const countSlot = (slot: string): number =>
    rosterPositions.filter((p) => p === slot).length;
  const flexCount =
    countSlot("FLEX") + countSlot("REC_FLEX") + countSlot("WRRB_FLEX");
  const recFlexCount = countSlot("REC_FLEX");
  const sfSlots =
    countSlot("SUPER_FLEX") +
    countSlot("SUPERFLEX") +
    countSlot("SF") +
    countSlot("Q_FLEX");
  const qbStartersMax = countSlot("QB") + sfSlots;
  const teStartersMax = countSlot("TE") + flexCount + recFlexCount;
  const rbStartersMax = countSlot("RB") + flexCount;
  const wrStartersMax = countSlot("WR") + flexCount + recFlexCount;
  const tePremium = scoringHighlights.some((s) => /TE.?premium|TEP/i.test(s));
  return {
    qb_starters_max: qbStartersMax,
    rb_starters_max: rbStartersMax,
    wr_starters_max: wrStartersMax,
    te_starters_max: teStartersMax,
    second_qb_starts: qbStartersMax >= 2,
    te_premium: tePremium,
    is_superflex: isSuperflex,
    flex_eligible: FLEX_ELIGIBLE,
    sf_eligible: isSuperflex ? SF_ELIGIBLE : null,
  };
}

/**
 * Compute per-position starter demand (how many more bodies the user
 * needs to fill all eligible starter slots at each position).
 * Format-aware via the FormatRules input.
 */
export function buildStarterDemand(args: {
  positionCounts: Record<string, number>;
  rules: FormatRules;
}): StarterDemand {
  const { positionCounts, rules } = args;
  return {
    QB: Math.max(0, rules.qb_starters_max - (positionCounts.QB ?? 0)),
    RB: Math.max(0, rules.rb_starters_max - (positionCounts.RB ?? 0)),
    WR: Math.max(0, rules.wr_starters_max - (positionCounts.WR ?? 0)),
    TE: Math.max(0, rules.te_starters_max - (positionCounts.TE ?? 0)),
  };
}

/**
 * Build the pricing block for a snapshot. Resolves player values via
 * FantasyCalc (cached), prices the user's pick schedule via the KTC-
 * anchored startup-pick scale, and returns the `TradePricing` shape
 * the SYSTEM_PROMPT trade-realism rule expects.
 *
 * The `pickIds` set is the value resolution scope. Pass at minimum
 * the user's roster + the top-N available pool; FantasyCalc returns
 * a flat dataset and the cache is shared across formats so widening
 * the set is cheap.
 */
export async function buildTradePricing(args: {
  snap: LeagueSnapshot;
  pickIds: Iterable<string>;
  /** Picks to price; usually `snap.draft.my_pick_schedule.slice(0, 8)`. */
  picksToPrice?: Array<{
    pick_label: string;
    pick_no: number;
    round: number;
  }>;
}): Promise<TradePricing> {
  const { snap, pickIds, picksToPrice = [] } = args;
  const isSF = snap.format === "superflex" || snap.format === "2qb";
  const sfMult = isSF ? SUPERFLEX_PICK_MULTIPLIER : 1.0;

  const valueIds = new Set<string>(pickIds);
  const playerValueMap = await resolvePlayerValues({
    ids: [...valueIds],
    isSuperflex: isSF,
    isPpr: snap.scoring.includes("PPR"),
    isHalfPpr: snap.scoring.includes("half-PPR"),
  });
  const player_values: TradePricing["player_values"] = {};
  for (const [id, v] of playerValueMap.entries()) {
    player_values[id] = {
      value: v.value,
      overall_rank: v.overall_rank,
      position_rank: v.position_rank,
    };
  }

  const pricedSchedule = picksToPrice.map((p) => ({
    pick_label: p.pick_label,
    pick_no: p.pick_no,
    round: p.round,
    ktc_value: Math.round(startupPickValue(p.pick_no) * sfMult),
  }));

  return {
    scale_note:
      "KTC-anchored startup-pick value scale 2026-04-22, 0-100 (format-multiplied for SF). Player values from FantasyCalc 2026-04-24, normalized to same 0-100 scale so picks and players compose arithmetically.",
    fairness_band_pct: 15,
    player_values_present: playerValueMap.size > 0,
    player_value_count: playerValueMap.size,
    player_values,
    pick_values: pricedSchedule,
    sf_pick_multiplier: sfMult,
  };
}

/**
 * Compose the full operational context for a snapshot. Most endpoints
 * use this directly; the few that don't have a snapshot (e.g.
 * `assembleContext` which works from raw league + rosters) build the
 * pieces individually.
 */
export async function buildOperationalContext(args: {
  snap: LeagueSnapshot;
  pickIds: Iterable<string>;
  picksToPrice?: TradePricing["pick_values"];
}): Promise<OperationalContext> {
  const rules = buildFormatRulesFromSnapshot(args.snap);
  const me = args.snap.rosters.find((r) => r.is_me);
  const pricing = await buildTradePricing({
    snap: args.snap,
    pickIds: args.pickIds,
    picksToPrice: args.picksToPrice,
  });
  return {
    format_rules: rules,
    pricing,
    starter_demand_remaining: me
      ? buildStarterDemand({ positionCounts: me.position_counts, rules })
      : null,
  };
}
