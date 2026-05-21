/**
 * Per-opponent pick-quality analysis. Reads each opponent's picks
 * made so far and scores them against consensus value to detect
 * "reach" picks (took someone way before their ADP) and "value"
 * picks (got someone who fell past consensus). Aggregates to a
 * sophistication tier per opponent.
 *
 * The signals feed Coach (via softness_signals on each leverage
 * opportunity) and the Trade Strategy Panel UI. The user's
 * specific 2026-05-07 ask: "joeboch took Mendoza in r5, reads as
 * ceiling-chase, lower sophistication." This module computes that
 * pattern across the whole league.
 *
 * Phase 1 uses FantasyCalc-normalized overall_rank as the consensus
 * baseline; this is the same data that powers pricing.player_values
 * elsewhere, so no new ingestion is required. Phase 2 may layer in
 * FantasyPros ADP for a more market-faithful reach delta.
 */

import type { DraftPickRecord } from "@/lib/strategy/league-state/snapshot";

/**
 * Pick-quality / sophistication tier thresholds. These are
 * UNCALIBRATED heuristics: round numbers chosen by inspection, not
 * fit to outcome data. Per dynasty-assumption-auditor (2026-05-20),
 * the direction is sound (consistent value-over-consensus reads as a
 * sharp drafter; repeated reaches read as a soft drafter) but the
 * magnitudes need calibration.
 *
 * Calibration source needed: realized trade-acceptance probability
 * and overpay magnitude conditioned on a drafter's observed pick
 * quality, from in-product trade logs. Until that dataset exists,
 * these stay tagged as heuristics, and the sophistication leverage
 * adjustment they feed (SOPHISTICATION_ADJUSTMENT in
 * league-read/analyze.ts) is likewise a documented placeholder. The
 * same trade-log collection unblocks the panic-label leverage scores
 * and the arbitrage-vs-fill backtest (RESEARCH_CORPUS.md open
 * question 11).
 */
const REACH_DELTA = -15; // picks before consensus that count as a "reach"
const VALUE_DELTA = 15; // picks past consensus that count as a "value steal"
const MIN_SAMPLE = 3; // resolved picks needed before scoring a tier
const HIGH_AVG_DELTA = 5; // avg value-over-consensus for the "high" tier
const HIGH_MAX_REACHES = 1; // max reaches allowed in the "high" tier
const LOW_MIN_REACHES = 3; // reach count that forces the "low" tier
const LOW_AVG_DELTA = -10; // avg delta that forces the "low" tier

export type PickQuality = {
  pick_no: number;
  player_id: string;
  // overall_rank from FantasyCalc / KTC value table. Lower = better
  // (more valuable). Null when we can't resolve a value for the
  // player (e.g., unranked rookies, pre-NFL-draft prospects).
  overall_rank: number | null;
  // Delta = overall_rank - pick_no. Positive = team got value (player
  // fell past consensus). Negative = team reached (took early).
  delta: number | null;
};

export type OpponentPickQuality = {
  roster_id: number;
  picks: PickQuality[];
  // Average delta across resolved picks. Higher = consistently got value.
  // Negative = consistently reached.
  avg_delta: number | null;
  // Count of picks that were >= 15 spots before consensus (a "reach").
  reach_count: number;
  // The single biggest reach this draft (most negative delta).
  biggest_reach: PickQuality | null;
  // The single biggest value steal this draft (most positive delta).
  biggest_value: PickQuality | null;
  // Sophistication tier. "high" = consistently positive deltas + few
  // reaches. "low" = consistently negative + multiple reaches. "mid"
  // = noise. "unknown" when sample is too small.
  sophistication_tier: "high" | "mid" | "low" | "unknown";
  // Short signals array suitable for surfacing as bullet points on
  // the Trade Strategy Panel and in Coach softness_signals. Each
  // entry is one human-readable line.
  signals: string[];
};

export function analyzeOpponentPickQuality(args: {
  picksMade: DraftPickRecord[];
  // Map player_id -> { value, overall_rank } from the same FantasyCalc
  // resolution that powers pricing.player_values.
  playerValueMap: Map<
    string,
    { value: number; overall_rank: number | null }
  >;
  // Map player_id -> { name, position } for narrative output.
  playerNameLookup: (id: string) => { name: string; position: string | null } | null;
}): Map<number, OpponentPickQuality> {
  const { picksMade, playerValueMap, playerNameLookup } = args;
  const byOpponent = new Map<number, DraftPickRecord[]>();
  for (const p of picksMade) {
    const arr = byOpponent.get(p.roster_id) ?? [];
    arr.push(p);
    byOpponent.set(p.roster_id, arr);
  }

  const out = new Map<number, OpponentPickQuality>();
  for (const [rosterId, picks] of byOpponent.entries()) {
    const enriched: PickQuality[] = picks.map((p) => {
      const v = playerValueMap.get(p.player_id);
      const rank = v?.overall_rank ?? null;
      const delta = rank != null ? rank - p.pick_no : null;
      return {
        pick_no: p.pick_no,
        player_id: p.player_id,
        overall_rank: rank,
        delta,
      };
    });

    // Resolved picks (delta computable).
    const resolved = enriched.filter(
      (e): e is PickQuality & { delta: number } => e.delta != null,
    );
    const avg_delta =
      resolved.length > 0
        ? resolved.reduce((s, e) => s + e.delta, 0) / resolved.length
        : null;
    const reach_count = resolved.filter((e) => e.delta <= REACH_DELTA).length;

    let biggest_reach: PickQuality | null = null;
    let biggest_value: PickQuality | null = null;
    for (const e of resolved) {
      if (biggest_reach == null || e.delta < (biggest_reach.delta ?? 0)) {
        biggest_reach = e;
      }
      if (biggest_value == null || e.delta > (biggest_value.delta ?? 0)) {
        biggest_value = e;
      }
    }

    // Tier rules (Phase 1 heuristic):
    //   high: avg_delta >= 5 AND reach_count <= 1 AND resolved >= 3
    //   low: reach_count >= 3 OR (avg_delta <= -10 AND resolved >= 3)
    //   mid: otherwise
    //   unknown: resolved < 3 (sample too small)
    let sophistication_tier: OpponentPickQuality["sophistication_tier"] =
      "unknown";
    if (resolved.length >= MIN_SAMPLE && avg_delta != null) {
      if (avg_delta >= HIGH_AVG_DELTA && reach_count <= HIGH_MAX_REACHES)
        sophistication_tier = "high";
      else if (reach_count >= LOW_MIN_REACHES || avg_delta <= LOW_AVG_DELTA)
        sophistication_tier = "low";
      else sophistication_tier = "mid";
    }

    // Build signal lines.
    const signals: string[] = [];
    if (sophistication_tier === "high") {
      signals.push(
        `Drafting tier: HIGH. Avg ${avg_delta!.toFixed(1)} picks of value-over-consensus across ${resolved.length} picks. Less leverage; expect them to extract value too.`,
      );
    } else if (sophistication_tier === "low") {
      signals.push(
        `Drafting tier: LOW. ${reach_count} reach pick${reach_count === 1 ? "" : "s"} of 15+ before consensus${avg_delta != null ? `, avg ${avg_delta.toFixed(1)} picks delta` : ""}. Higher leverage; they may overpay in trades the same way.`,
      );
    } else if (sophistication_tier === "mid") {
      signals.push(
        `Drafting tier: MID. Avg ${avg_delta!.toFixed(1)} picks delta vs consensus across ${resolved.length} picks. Average market-rate drafter.`,
      );
    } else if (resolved.length > 0) {
      signals.push(
        `Drafting tier: insufficient picks (${resolved.length}) to score sophistication.`,
      );
    }
    if (biggest_reach && biggest_reach.delta != null && biggest_reach.delta <= REACH_DELTA) {
      const meta = playerNameLookup(biggest_reach.player_id);
      const name = meta?.name ?? biggest_reach.player_id;
      signals.push(
        `Biggest reach: ${name} at pick ${biggest_reach.pick_no} (consensus rank ${biggest_reach.overall_rank}, ${Math.abs(biggest_reach.delta)} picks early).`,
      );
    }
    if (biggest_value && biggest_value.delta != null && biggest_value.delta >= VALUE_DELTA) {
      const meta = playerNameLookup(biggest_value.player_id);
      const name = meta?.name ?? biggest_value.player_id;
      signals.push(
        `Biggest value: ${name} at pick ${biggest_value.pick_no} (consensus rank ${biggest_value.overall_rank}, fell ${biggest_value.delta} picks).`,
      );
    }

    out.set(rosterId, {
      roster_id: rosterId,
      picks: enriched,
      avg_delta,
      reach_count,
      biggest_reach,
      biggest_value,
      sophistication_tier,
      signals,
    });
  }
  return out;
}
