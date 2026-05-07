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
  StructuralConstraint,
  TradeWindowEstimate,
} from "./types";

type ScoringPosition = "QB" | "RB" | "WR" | "TE";
const SCORING_POSITIONS: ScoringPosition[] = ["QB", "RB", "WR", "TE"];

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
 * Compute the league read. Returns the synthesis.
 */
export function analyzeLeagueRead(args: {
  profile: LeagueProfile;
  formatRules: FormatRules;
  userState: UserState;
  myRosterId: number | null;
  // Current draft pick number (1-N) used for trade-window estimate.
  // Null when the league is not in active draft.
  currentPickNo: number | null;
  totalRosters: number;
  rounds: number;
}): LeagueRead {
  const { profile, formatRules, userState, myRosterId, currentPickNo, totalRosters, rounds } = args;

  // Compute user's structural constraints. "Don't trade picks while
  // you have positions below starter_max."
  const positions_unfilled: ScoringPosition[] = [];
  const starterReqs: Record<ScoringPosition, number> = {
    QB: formatRules.qb_starters_max,
    RB: formatRules.rb_starters_max,
    WR: formatRules.wr_starters_max,
    TE: formatRules.te_starters_max,
  };
  for (const pos of SCORING_POSITIONS) {
    if ((userState.position_counts[pos] ?? 0) < starterReqs[pos]) {
      positions_unfilled.push(pos);
    }
  }
  const structural_constraints: StructuralConstraint[] =
    positions_unfilled.length > 0
      ? [
          {
            positions_unfilled,
            is_active: true,
            guardrail_message: `Hold pick equity for now. You are below starter requirement at ${positions_unfilled.join(", ")}. Trading picks before structural holes are filled spends draft equity on the wrong axis. The trade leverage you sense from QB / RB-starved opponents only STRENGTHENS as their panic builds; you do not need to act now.`,
          },
        ]
      : [
          {
            positions_unfilled: [],
            is_active: false,
            guardrail_message:
              "Starters covered at every position; trade window is open. Pick equity can now be deployed for surplus-to-need swaps.",
          },
        ];

  // Compute user's surplus positions: where the user has at least
  // (starter_max + 1) bodies, the marginal player is the trade chip.
  // In SF, the third QB is by definition trade-eligible (only 2 start).
  const userSurplusPositions: ScoringPosition[] = [];
  for (const pos of SCORING_POSITIONS) {
    if ((userState.position_counts[pos] ?? 0) > starterReqs[pos]) {
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
    let baseScore = 0;
    if (team.label === "desperation") baseScore = 90;
    else if (team.label === "qb_needy" && bestSendPosition === "QB") baseScore = 85;
    else if (team.label === "tilted_buyer") baseScore = 75;
    else if (team.label === "autopicker") baseScore = 80;
    else baseScore = 50;
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

    const framing = `Target ${team.owner_name} (${panicLabel}). Send ${sendAssetHint}; ask for ${
      receivePosition ? `their best ${receivePosition}` : "an asset that fills your roster gap"
    }${
      receivePosition && positions_unfilled.includes(receivePosition)
        ? " plus a future pick"
        : ""
    }. Their panic is real; your leverage is real.`;

    opportunities.push({
      opponent_roster_id: team.roster_id,
      opponent_name: team.owner_name,
      opponent_panic_label: panicLabel,
      opponent_softness_signals: softnessSignals.slice(0, 4),
      send_position: bestSendPosition,
      receive_position: receivePosition,
      send_asset_hint: sendAssetHint,
      receive_asset_hint: receivePosition
        ? `their best ${receivePosition}`
        : "asset to be specified",
      leverage_score: baseScore,
      framing_one_liner: framing,
    });
  }

  // Rank by leverage_score desc, take top 3.
  opportunities.sort((a, b) => b.leverage_score - a.leverage_score);
  const top_leverage_opportunities = opportunities.slice(0, 3);

  // Trade window estimate. Phase 1 heuristic: peak window is rounds
  // 7-9 in dynasty startups, when teams that chased ceiling early
  // start panicking on structural holes.
  let trade_window: TradeWindowEstimate | null = null;
  if (currentPickNo != null && rounds > 0 && totalRosters > 0) {
    const currentRound = Math.ceil(currentPickNo / totalRosters);
    const peakRound = Math.min(rounds, Math.max(7, currentRound + 2));
    const message =
      currentRound < peakRound
        ? `Hold conversations until round ${peakRound}. Opponent panic peaks around then; your leverage strengthens as their structural holes deepen. Trading earlier spends draft equity on the wrong axis.`
        : `Trade window is open NOW. Opponent panic is at or near peak; act on the leverage opportunities listed above before they paper over their holes through the draft.`;
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
    parts.push(
      `Structural guardrail active: holes at ${activeConstraints[0].positions_unfilled.join(", ")}. Don't trade picks until these fill.`,
    );
  }

  if (trade_window) {
    parts.push(`Trade window: ${trade_window.message}`);
  }

  return parts.join(" ");
}
