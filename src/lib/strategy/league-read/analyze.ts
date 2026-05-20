/**
 * Analyze a league for in-draft trade leverage opportunities.
 *
 * Phase 1: heuristic. Uses the existing TeamProfile.label classification
 * (qb_banker, qb_needy, tilted_buyer, desperation, etc.) plus position
 * counts plus the user's surplus/hole picture to compute ranked
 * leverage pairings.
 *
 * Phase 2: incorporate per-pick sophistication scoring (was the pick
 * value vs ADP? did they take a kicker in r5?), compute panic timing
 * per opponent, propose specific named target assets via cross-league
 * KTC values.
 */

import type { Position } from "../archetypes/schema";
import type { LeagueProfile, TeamProfile } from "@/lib/engine/opponent";
import type { FormatRules } from "@/lib/engine/llm-contract";
import type {
  LeagueRead,
  LeverageOpportunity,
  NamedAssetHint,
  StructuralConstraint,
  TradeWindowEstimate,
} from "./types";
import type { OpponentPickQuality } from "./pick-quality";

type ScoringPosition = "QB" | "RB" | "WR" | "TE";
const SCORING_POSITIONS: ScoringPosition[] = ["QB", "RB", "WR", "TE"];

/**
 * Panic-label leverage scores. Reordered 2026-05-20 per dynasty-
 * assumption-auditor: autopickers are absent rather than panicking;
 * tilted_buyers respond and overpay. The prior ordering ranked
 * autopicker (80) above tilted_buyer (75), which dynasty community
 * consensus and KTC trade-acceptance behavior both flip.
 *
 * Magnitudes are dynasty-pro / sharp-gambler interim values, not
 * KTC-calibrated. Calibration source needed: observed trade
 * acceptance probability × overpay magnitude conditioned on label.
 */
const PANIC_LEVERAGE_BY_LABEL = {
  desperation: 90,
  tilted_buyer: 80,
  qb_needy_with_qb_send: 75,
  autopicker: 40,
  default: 50,
} as const;

/**
 * Trade window peak round, format-aware. Per dynasty-canon-keeper
 * DEBUNK (2026-05-20): a single hardcoded constant across formats is
 * indefensible. Panic timing shifts with format. The values below
 * are dynasty community consensus, not calibrated.
 *
 * Calibration source needed: KTC trade-volume-by-round data
 * segmented by format (SF vs 1QB vs TE-premium startups).
 */
const PANIC_BASELINE_BY_FORMAT = {
  superflex: 5,
  te_premium: 8,
  standard: 10,
} as const;

/**
 * Per dynasty-assumption-auditor (2026-05-20): count-only surplus
 * loses the value distribution. A 3-QB roster with Allen/Mahomes/
 * Geno trades very differently than Allen/Mahomes/Levis. Value
 * floor requires the marginal (trade-chip) body to clear a non-
 * trivial KTC value before the position registers as surplus.
 *
 * KTC 30 is the body that actually trades for non-trivial return.
 * Position-specific floors (TE floor lower than RB in TE-premium)
 * are the upgrade path; not yet calibrated.
 */
const SURPLUS_VALUE_FLOOR = 30;

/**
 * Sophistication-tier adjustment. Direction (asymmetric, low > |high|)
 * is defensible: low-sophistication opponents overpay in trades more
 * than high-sophistication opponents underpay. Magnitudes below are
 * uncalibrated placeholders. Per dynasty-assumption-auditor (2026-
 * 05-20).
 *
 * Calibration source needed: KTC trade-acceptance data conditioned
 * on counterparty pick-quality tier.
 */
const SOPHISTICATION_ADJUSTMENT = {
  low: 8,
  high: -5,
} as const;

/**
 * Severity tolerance for the structural-guardrail unrecoverable
 * check. Some remaining picks land on bench depth or future-pick
 * swaps rather than starters, so "gap == picks_remaining" is
 * already structurally tight, not just exactly closeable. Per
 * Massey-Thaler 2013 path-dependence on pick-value math.
 */
const SEVERITY_TOLERANCE = 1;

/**
 * Round threshold below which a user's near-term pick carries
 * meaningful AV-weighted equity. Per Stuart (Football Perspective)
 * AV-based draft chart: pick value decays steeply by round; round-9+
 * picks have near-zero "equity worth protecting." Rounds 1-6 inclusive
 * carry meaningful equity.
 */
const EARLY_ROUND_THRESHOLD = 6;

type UserState = {
  position_counts: Record<Position, number>;
  // KTC values (FantasyCalc-normalized 0-100) per position rank for
  // surplus identification.
  player_values_by_position: Record<
    Position,
    Array<{ player_id: string; player_name: string; value: number }>
  >;
};

/**
 * Per-opponent roster snapshot for named-asset targeting. The
 * analyzer uses this to populate receive_asset_candidates with
 * specific KTC-valued players from the opponent's roster.
 */
export type OpponentRosterSnapshot = {
  roster_id: number;
  // Player IDs grouped by position with their KTC values, sorted
  // descending by value within position.
  player_values_by_position: Record<
    Position,
    Array<{ player_id: string; player_name: string; value: number }>
  >;
};

/**
 * Compute the league read. Returns the synthesis.
 */
export function analyzeLeagueRead(args: {
  profile: LeagueProfile;
  formatRules: FormatRules;
  userState: UserState;
  myRosterId: number | null;
  // Per-opponent roster snapshots for named-asset targeting.
  // Keyed by roster_id. Empty map disables named-asset hints
  // (analyzer falls back to generic "their best RB" prose).
  opponentRosters: Map<number, OpponentRosterSnapshot>;
  // Per-opponent pick-quality analysis. Keyed by roster_id. Empty
  // map disables sophistication-tier signals on softness_signals.
  // Per the 2026-05-08 A3 closure: surfaces "Mendoza behind Cousins"
  // style reads automatically.
  pickQuality?: Map<number, OpponentPickQuality>;
  // Current draft pick number (1-N) used for trade-window estimate.
  // Null when the league is not in active draft.
  currentPickNo: number | null;
  // Number of picks the user has remaining in the draft, counted
  // from `snap.draft.my_pick_schedule` post-traded_picks (canonical
  // per CANONICAL_SOURCES.md). Null when not in active draft. Used
  // for the unrecoverable-severity check on structural_constraints.
  userPicksRemaining?: number | null;
  totalRosters: number;
  rounds: number;
}): LeagueRead {
  const { profile, formatRules, userState, myRosterId, opponentRosters, pickQuality, currentPickNo, userPicksRemaining = null, totalRosters, rounds } = args;

  // Compute the user's structural state as DATA, not as a prescriptive
  // guardrail. Per dynasty-canon-keeper DEBUNK (2026-05-20): the prior
  // binary "any position below starter_max → fire hold-pick-equity"
  // check was research-indefensible (Massey-Thaler 2013 convex pick-
  // value curve; KTC repricing in days, not multi-round windows). The
  // narrow research-supported cautious case requires THREE conditions:
  // unrecoverable severity + early-round pick equity + a real starter
  // gap. All other states are recoverable through normal drafting and
  // surplus-to-need swaps remain the doctrine.
  const positions_unfilled: ScoringPosition[] = [];
  const starter_gap_by_position: Partial<Record<Position, number>> = {};
  let total_starter_gap = 0;
  const starterReqs: Record<ScoringPosition, number> = {
    QB: formatRules.qb_starters_max,
    RB: formatRules.rb_starters_max,
    WR: formatRules.wr_starters_max,
    TE: formatRules.te_starters_max,
  };
  for (const pos of SCORING_POSITIONS) {
    const have = userState.position_counts[pos] ?? 0;
    const need = starterReqs[pos];
    if (have < need) {
      positions_unfilled.push(pos);
      starter_gap_by_position[pos] = need - have;
      total_starter_gap += need - have;
    }
  }

  // Unrecoverable severity: gap exceeds remaining picks minus a
  // tolerance for bench/future-pick spend. The only Massey-Thaler-
  // supported case for "hold pick equity" as a prescription.
  const unrecoverable_severity =
    userPicksRemaining != null &&
    total_starter_gap > userPicksRemaining - SEVERITY_TOLERANCE;

  // Early-round pick equity. Stuart AV chart: surplus value decays
  // steeply by round. Rounds 1-6 carry meaningful equity; round-9+
  // picks have near-zero "equity worth protecting."
  const currentRound =
    currentPickNo != null && totalRosters > 0
      ? Math.ceil(currentPickNo / totalRosters)
      : null;
  const early_round_pick_equity =
    currentRound != null && currentRound <= EARLY_ROUND_THRESHOLD;

  const guardrail_active =
    positions_unfilled.length > 0 &&
    unrecoverable_severity &&
    early_round_pick_equity;

  let guardrail_message: string;
  if (guardrail_active) {
    guardrail_message = `Unrecoverable starter gap at ${positions_unfilled.join(", ")} (total gap ${total_starter_gap} bodies, ${userPicksRemaining ?? "unknown"} picks remaining, round ${currentRound}). Pick equity at this round carries real AV-weighted surplus value (Stuart, Football Perspective). Pick-out trades without a positional return compound the structural problem.`;
  } else if (positions_unfilled.length > 0) {
    guardrail_message = `Below starter requirement at ${positions_unfilled.join(", ")} (gap ${total_starter_gap}${userPicksRemaining != null ? `, ${userPicksRemaining} picks remaining` : ""}). Recoverable through normal drafting. Standard ±15% trade fairness band governs; surplus-to-need swaps remain on the table.`;
  } else {
    guardrail_message =
      "Starters covered at every position. Pick equity available for surplus-to-need swaps.";
  }

  const structural_constraints: StructuralConstraint[] = [
    {
      positions_unfilled,
      starter_gap_by_position,
      total_starter_gap,
      picks_remaining: userPicksRemaining,
      unrecoverable_severity,
      early_round_pick_equity,
      is_active: guardrail_active,
      guardrail_message,
    },
  ];

  // Compute user's surplus positions with VALUE FLOOR. Per dynasty-
  // assumption-auditor (2026-05-20): count-only surplus loses the
  // value distribution. Requires count > starter_max AND the
  // marginal (median-by-value) body to clear SURPLUS_VALUE_FLOOR.
  // Falls back to count-only when player values aren't available.
  const userSurplusPositions: ScoringPosition[] = [];
  for (const pos of SCORING_POSITIONS) {
    if ((userState.position_counts[pos] ?? 0) <= starterReqs[pos]) continue;
    const candidates = userState.player_values_by_position[pos] ?? [];
    if (candidates.length === 0) {
      // No values available; count-only fallback.
      userSurplusPositions.push(pos);
      continue;
    }
    const sortedAsc = [...candidates].sort((a, b) => a.value - b.value);
    const marginal = sortedAsc[Math.floor(sortedAsc.length / 2)];
    if (marginal.value >= SURPLUS_VALUE_FLOOR) {
      userSurplusPositions.push(pos);
    }
  }

  // Compute opponent leverage opportunities. For each opponent (not
  // the user), compute: their structural hole positions, their
  // softness label, and the leverage score for swapping their hole
  // for the user's surplus.
  const opportunities: LeverageOpportunity[] = [];
  for (const team of profile.teams) {
    if (team.roster_id === myRosterId) continue;
    if (team.label === "balanced") continue; // hard to extract from balanced
    if (team.label === "qb_banker") continue; // their QB surplus isn't our wedge

    const theirHoles: ScoringPosition[] = [];
    for (const pos of SCORING_POSITIONS) {
      if ((team.counts[pos] ?? 0) < starterReqs[pos]) {
        theirHoles.push(pos);
      }
    }

    // Find a surplus on user side that matches one of their holes.
    let bestSendPosition: ScoringPosition | null = null;
    for (const surplusPos of userSurplusPositions) {
      if (theirHoles.includes(surplusPos)) {
        bestSendPosition = surplusPos;
        break;
      }
    }

    // Special case: in superflex, an extra QB is structurally a
    // trade chip even when not technically "surplus" by hard count,
    // because once 2 QBs start, a third QB is by definition the
    // trade-eligible asset.
    if (
      bestSendPosition == null &&
      formatRules.is_superflex &&
      (userState.position_counts.QB ?? 0) >= 3 &&
      theirHoles.includes("QB")
    ) {
      bestSendPosition = "QB";
    }

    if (bestSendPosition == null) continue;

    // What the user wants from them: their best surplus that fills a
    // user hole. Phase 1 returns a generic ask ("their best RB") since
    // we don't yet have full league-wide KTC values for opponent rosters.
    let receivePosition: ScoringPosition | null = null;
    for (const pos of SCORING_POSITIONS) {
      if (
        positions_unfilled.includes(pos) &&
        (team.counts[pos] ?? 0) > starterReqs[pos]
      ) {
        receivePosition = pos;
        break;
      }
    }
    // Soft fallback: ask for ANY of their position you need, even if
    // they're not yet at surplus.
    if (receivePosition == null && positions_unfilled.length > 0) {
      receivePosition = positions_unfilled[0];
    }

    // Identify the user's specific send asset. Phase 1: lowest-value
    // player at the surplus position (the trade chip; you keep the
    // top-ranked starters).
    const candidates =
      userState.player_values_by_position[bestSendPosition] ?? [];
    let sendAssetHint: string;
    if (candidates.length >= 2) {
      const sorted = [...candidates].sort((a, b) => a.value - b.value);
      const tradeChip = sorted[Math.floor(sorted.length / 2)];
      sendAssetHint = `${tradeChip.player_name} (KTC ${tradeChip.value})`;
    } else if (candidates.length === 1) {
      sendAssetHint = `${candidates[0].player_name} (KTC ${candidates[0].value})`;
    } else {
      sendAssetHint = `your spare ${bestSendPosition}`;
    }

    // Score: combine opponent label severity + position-fit quality.
    // Reordering 2026-05-20: autopicker dropped below tilted_buyer.
    // Autopickers are absent rather than panicking; tilted_buyers
    // respond and overpay. See PANIC_LEVERAGE_BY_LABEL header.
    let baseScore: number = PANIC_LEVERAGE_BY_LABEL.default;
    if (team.label === "desperation") baseScore = PANIC_LEVERAGE_BY_LABEL.desperation;
    else if (team.label === "qb_needy" && bestSendPosition === "QB")
      baseScore = PANIC_LEVERAGE_BY_LABEL.qb_needy_with_qb_send;
    else if (team.label === "tilted_buyer") baseScore = PANIC_LEVERAGE_BY_LABEL.tilted_buyer;
    else if (team.label === "autopicker") baseScore = PANIC_LEVERAGE_BY_LABEL.autopicker;
    // Bonus when their hole matches what we want too.
    if (
      receivePosition != null &&
      positions_unfilled.includes(receivePosition)
    ) {
      baseScore += 5;
    }

    const panicLabel = labelToPanic(team.label);
    const softnessSignals: string[] = [...team.pain_points];
    // Add structural signals from counts.
    for (const pos of SCORING_POSITIONS) {
      const have = team.counts[pos] ?? 0;
      const need = starterReqs[pos];
      if (have < need) {
        softnessSignals.push(`${have}/${need} at ${pos}; below starter requirement`);
      }
    }
    // Pick-quality / sophistication signals. Adds "Drafting tier:
    // LOW. 3 reach picks of 15+ before consensus" plus named
    // biggest reach / biggest value entries when present.
    const oppPickQuality = pickQuality?.get(team.roster_id);
    if (oppPickQuality) {
      // Boost leverage score when sophistication is LOW (they're
      // more likely to overpay in trades the same way they overpay
      // in the draft). Magnitudes (+8, -5) are uncalibrated
      // placeholders; direction (asymmetric, low > |high|) is the
      // defensible signal. See SOPHISTICATION_ADJUSTMENT header.
      if (oppPickQuality.sophistication_tier === "low") {
        baseScore += SOPHISTICATION_ADJUSTMENT.low;
      } else if (oppPickQuality.sophistication_tier === "high") {
        baseScore += SOPHISTICATION_ADJUSTMENT.high;
      }
      for (const s of oppPickQuality.signals) {
        softnessSignals.push(s);
      }
    }

    // Phase 2: name specific candidate assets from the opponent's
    // roster at the receive position. Pull the top 3 by KTC value.
    let receiveAssetCandidates: NamedAssetHint[] = [];
    if (receivePosition != null) {
      const oppRoster = opponentRosters.get(team.roster_id);
      const players =
        oppRoster?.player_values_by_position[receivePosition] ?? [];
      receiveAssetCandidates = players.slice(0, 3).map((p) => ({
        player_id: p.player_id,
        player_name: p.player_name,
        ktc_value: p.value,
      }));
    }

    const receiveAssetHint =
      receiveAssetCandidates.length >= 1
        ? receiveAssetCandidates
            .map((c) => `${c.player_name} (KTC ${c.ktc_value})`)
            .join(" or ")
        : receivePosition
          ? `their best ${receivePosition}`
          : "asset to be specified";

    const framing = `Target ${team.owner_name} (${panicLabel}). Send ${sendAssetHint}; ask for ${receiveAssetHint}${
      receivePosition && positions_unfilled.includes(receivePosition)
        ? " plus a future pick"
        : ""
    }. Their panic is real; your leverage is real.`;

    opportunities.push({
      opponent_roster_id: team.roster_id,
      opponent_name: team.owner_name,
      opponent_panic_label: panicLabel,
      opponent_softness_signals: softnessSignals.slice(0, 6),
      send_position: bestSendPosition,
      receive_position: receivePosition,
      send_asset_hint: sendAssetHint,
      receive_asset_hint: receiveAssetHint,
      receive_asset_candidates: receiveAssetCandidates,
      leverage_score: baseScore,
      framing_one_liner: framing,
    });
  }

  // Rank by leverage_score desc, take top 3.
  opportunities.sort((a, b) => b.leverage_score - a.leverage_score);
  const top_leverage_opportunities = opportunities.slice(0, 3);

  // Trade window estimate. Format-aware: SF panic comes earlier
  // (post-QB1 tier clear, ~rd 5), TE-premium mid-late (~rd 7-8),
  // 1QB late (~rd 10). Floored against currentRound + 2 so the
  // forecast always points forward. See PANIC_BASELINE_BY_FORMAT
  // header.
  let trade_window: TradeWindowEstimate | null = null;
  if (currentPickNo != null && rounds > 0 && totalRosters > 0) {
    const liveRound = Math.ceil(currentPickNo / totalRosters);
    const formatBaseline = formatRules.is_superflex
      ? PANIC_BASELINE_BY_FORMAT.superflex
      : formatRules.te_premium
        ? PANIC_BASELINE_BY_FORMAT.te_premium
        : PANIC_BASELINE_BY_FORMAT.standard;
    const peakRound = Math.min(rounds, Math.max(formatBaseline, liveRound + 2));
    const formatName = formatRules.is_superflex
      ? "superflex"
      : formatRules.te_premium
        ? "TE-premium"
        : "1QB";
    const message =
      liveRound < peakRound
        ? `Format-adjusted panic peak around round ${peakRound} (${formatName}). Leverage opportunities listed above are real now; surplus-to-need swaps don't require waiting. If holding pick equity for the peak, do so only when the structural-state read is unrecoverable.`
        : `Trade window is at or past format-adjusted peak (round ${peakRound}, ${formatName}). Act on the leverage opportunities listed above before opponents paper over their holes through the draft.`;
    trade_window = { peak_round: peakRound, message };
  }

  // Headline.
  const headline = composeHeadline({
    top_leverage_opportunities,
    structural_constraints,
    trade_window,
  });

  return {
    top_leverage_opportunities,
    structural_constraints,
    trade_window,
    headline,
  };
}

function labelToPanic(label: TeamProfile["label"]): string {
  switch (label) {
    case "qb_banker":
      return "QB-stocked (their surplus, not our wedge)";
    case "qb_stable":
      return "QB-stable";
    case "qb_needy":
      return "QB-starved";
    case "tilted_buyer":
      return "tilted buyer (chasing win-now)";
    case "desperation":
      return "desperation (multiple structural holes)";
    case "autopicker":
      return "autopicker (drafting passively)";
    default:
      return "balanced";
  }
}

function composeHeadline(args: {
  top_leverage_opportunities: LeverageOpportunity[];
  structural_constraints: StructuralConstraint[];
  trade_window: TradeWindowEstimate | null;
}): string {
  const { top_leverage_opportunities, structural_constraints, trade_window } = args;
  const activeConstraints = structural_constraints.filter((c) => c.is_active);
  const parts: string[] = [];

  if (top_leverage_opportunities.length > 0) {
    const top = top_leverage_opportunities[0];
    parts.push(
      `Top leverage target: ${top.opponent_name} (${top.opponent_panic_label}). Send ${top.send_position}, ask ${top.receive_position ?? "TBD"}.`,
    );
    if (top_leverage_opportunities.length > 1) {
      parts.push(
        `${top_leverage_opportunities.length - 1} more leverage opportunities ranked below.`,
      );
    }
  } else {
    parts.push(
      "No clear leverage opportunities right now. Either no opponent has obvious structural softness, or you do not yet hold trade-surplus assets that match their needs.",
    );
  }

  if (activeConstraints.length > 0) {
    const c = activeConstraints[0];
    parts.push(
      `Unrecoverable starter gap at ${c.positions_unfilled.join(", ")} (gap ${c.total_starter_gap}, ${c.picks_remaining ?? "unknown"} picks remaining). Hold pick equity only when the trade is pick-out without a positional return.`,
    );
  }

  if (trade_window) {
    parts.push(`Trade window: ${trade_window.message}`);
  }

  return parts.join(" ");
}
