/**
 * Compute the draft-progress scorecard for the user's own drafting
 * in a given league. Three metrics: pick quality (vs consensus),
 * league rank (by total roster value), build coherence (window
 * scores aligning with the structural state).
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type { Position } from "@/lib/strategy/archetypes/schema";
import { analyzeOpponentPickQuality } from "@/lib/strategy/league-read";
import { getHardStarterReqs } from "@/lib/engine/roster-fit";
import type { DraftProgress, ProgressMetric, ProgressTier } from "./types";

const SCORING_POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

export function analyzeDraftProgress(args: {
  snap: LeagueSnapshot;
  // Map player_id -> { value, overall_rank } from the same
  // FantasyCalc resolution that powers pricing.player_values.
  playerValueMap: Map<
    string,
    { value: number; overall_rank: number | null }
  >;
  playerNameLookup: (id: string) => { name: string; position: string | null } | null;
}): DraftProgress | null {
  const { snap, playerValueMap, playerNameLookup } = args;
  const myRoster = snap.rosters.find((r) => r.is_me);
  if (!myRoster) return null;
  const myPicks = snap.draft.picks_made.filter(
    (p) => p.roster_id === myRoster.roster_id,
  );
  const totalPicksForUser =
    snap.total_teams > 0 ? snap.draft.rounds : 0;

  // Metric 1: pick quality. Reuse the pick-quality analyzer pointed
  // at the user's own picks.
  const pickQuality = analyzeOpponentPickQuality({
    picksMade: myPicks,
    playerValueMap,
    playerNameLookup,
  }).get(myRoster.roster_id);

  let pickQualityMetric: ProgressMetric;
  if (!pickQuality || pickQuality.picks.length === 0) {
    pickQualityMetric = {
      label: "Pick quality",
      display_value: "no picks yet",
      sub_line: "Start drafting and we'll grade your value-vs-consensus on every pick.",
      tier: "solid",
    };
  } else if (pickQuality.avg_delta == null) {
    pickQualityMetric = {
      label: "Pick quality",
      display_value: "ungraded",
      sub_line: "Picks haven't been valued yet (FantasyCalc lookup pending).",
      tier: "solid",
    };
  } else {
    const avg = pickQuality.avg_delta;
    let tier: ProgressTier;
    let sub: string;
    if (avg >= 5 && pickQuality.reach_count <= 1) {
      tier = "strong";
      sub = `Avg ${avg.toFixed(1)} picks of value over consensus across ${pickQuality.picks.length} picks.${
        pickQuality.biggest_value && pickQuality.biggest_value.delta != null && pickQuality.biggest_value.delta >= 15
          ? ` Best steal: ${playerNameLookup(pickQuality.biggest_value.player_id)?.name ?? pickQuality.biggest_value.player_id} (fell ${pickQuality.biggest_value.delta} picks).`
          : ""
      }`;
    } else if (pickQuality.reach_count >= 3 || avg <= -10) {
      tier = "off_track";
      sub = `${pickQuality.reach_count} reach pick${pickQuality.reach_count === 1 ? "" : "s"} of 15+ before consensus, avg ${avg.toFixed(1)}.`;
    } else if (avg >= 0) {
      tier = "solid";
      sub = `Avg ${avg.toFixed(1)} picks vs consensus across ${pickQuality.picks.length} picks. Market-rate or slightly above.`;
    } else {
      tier = "mixed";
      sub = `Avg ${avg.toFixed(1)} picks vs consensus. Slight reach trend; not catastrophic.`;
    }
    pickQualityMetric = {
      label: "Pick quality",
      display_value: avg >= 0 ? `+${avg.toFixed(1)}` : avg.toFixed(1),
      sub_line: sub,
      tier,
    };
  }

  // Metric 2: league rank by total roster value. Sum FantasyCalc
  // value across each roster's player_ids; rank descending; report
  // the user's position.
  const totalsByRoster = new Map<number, number>();
  for (const r of snap.rosters) {
    let sum = 0;
    for (const id of r.player_ids ?? []) {
      const v = playerValueMap.get(id);
      if (v && typeof v.value === "number") sum += v.value;
    }
    totalsByRoster.set(r.roster_id, sum);
  }
  const ranked = [...totalsByRoster.entries()].sort((a, b) => b[1] - a[1]);
  const myIndex = ranked.findIndex(([rid]) => rid === myRoster.roster_id);
  const myRank = myIndex >= 0 ? myIndex + 1 : null;
  const totalTeams = snap.total_teams;
  let leagueRankMetric: ProgressMetric;
  if (myRank == null || ranked[0][1] === 0) {
    leagueRankMetric = {
      label: "League rank",
      display_value: "ungraded",
      sub_line: "Roster values not yet resolved.",
      tier: "solid",
    };
  } else {
    const myValue = totalsByRoster.get(myRoster.roster_id) ?? 0;
    const topValue = ranked[0][1];
    const valuePctOfTop = topValue > 0 ? (myValue / topValue) * 100 : 0;
    let tier: ProgressTier;
    let sub: string;
    if (myRank <= Math.ceil(totalTeams / 4)) {
      tier = "strong";
      sub = `Your roster value sits in the top quartile of the league (${myValue.toFixed(0)} pts vs ${topValue.toFixed(0)} for #1, ${valuePctOfTop.toFixed(0)}% of leader).`;
    } else if (myRank <= Math.ceil(totalTeams / 2)) {
      tier = "solid";
      sub = `Your roster value is mid-pack (${valuePctOfTop.toFixed(0)}% of league leader).`;
    } else if (myRank <= Math.floor((3 * totalTeams) / 4)) {
      tier = "mixed";
      sub = `Below mid-pack on roster value. ${valuePctOfTop.toFixed(0)}% of league leader.`;
    } else {
      tier = "off_track";
      sub = `Bottom-quartile roster value. Trade-up leverage may help close the gap.`;
    }
    leagueRankMetric = {
      label: "League rank",
      display_value: `${myRank}/${totalTeams}`,
      sub_line: sub,
      tier,
    };
  }

  // Metric 3: build coherence. Are the user's picks aligned with the
  // window they're building toward? Phase 1 heuristic: if win-now
  // window is high (>= 70) AND age skew is appropriate (older
  // starters), tier=strong. If both windows are low or contradictory,
  // tier=mixed.
  // We approximate using avg roster age + position-fill ratio.
  const myStarterFill = computeStarterFill(myRoster.position_counts, snap);
  const avgAge = myRoster.starter_avg_age ?? myRoster.avg_age ?? null;
  let buildCoherenceMetric: ProgressMetric;
  if (myPicks.length < 2) {
    buildCoherenceMetric = {
      label: "Build coherence",
      display_value: "early",
      sub_line: "Too few picks to read your build trajectory yet.",
      tier: "solid",
    };
  } else {
    let tier: ProgressTier = "solid";
    let sub = "";
    if (myStarterFill.coverage >= 0.5) {
      tier = "strong";
      sub = `Filling starters efficiently: ${myStarterFill.filled}/${myStarterFill.required} starting positions covered. Build trajectory looks coherent.`;
    } else if (myStarterFill.coverage > 0) {
      tier = "solid";
      sub = `Starters partially covered (${myStarterFill.filled}/${myStarterFill.required}); on track for a balanced build with picks remaining.`;
    } else {
      tier = "mixed";
      sub = `No starters filled yet across ${myPicks.length} picks. Confirm the build direction makes sense for this league context.`;
    }
    if (avgAge != null) {
      sub += ` Roster avg age ${avgAge.toFixed(1)}.`;
    }
    buildCoherenceMetric = {
      label: "Build coherence",
      display_value: `${myStarterFill.filled}/${myStarterFill.required}`,
      sub_line: sub,
      tier,
    };
  }

  // Headline + overall tier
  const tiers = [
    pickQualityMetric.tier,
    leagueRankMetric.tier,
    buildCoherenceMetric.tier,
  ];
  let overall_tier: ProgressTier;
  if (tiers.includes("off_track")) overall_tier = "off_track";
  else if (tiers.filter((t) => t === "strong").length >= 2) overall_tier = "strong";
  else if (tiers.includes("strong") || !tiers.includes("mixed")) overall_tier = "solid";
  else overall_tier = "mixed";

  let headline: string;
  if (overall_tier === "strong") {
    headline = "You're drafting well. Multiple metrics in the strong band; lean into the lead.";
  } else if (overall_tier === "solid") {
    headline = "You're on track. Solid build forming; keep executing.";
  } else if (overall_tier === "mixed") {
    headline = "Mixed signals. Some metrics ahead, others behind. Worth a look at the watch-outs.";
  } else {
    headline = "Off track on at least one metric. The watch-outs below name the specific concern.";
  }

  // Wins + watch-outs
  const wins: string[] = [];
  const watch_outs: string[] = [];
  if (
    pickQuality &&
    pickQuality.biggest_value &&
    pickQuality.biggest_value.delta != null &&
    pickQuality.biggest_value.delta >= 15
  ) {
    const meta = playerNameLookup(pickQuality.biggest_value.player_id);
    wins.push(
      `Best steal: ${meta?.name ?? pickQuality.biggest_value.player_id} fell ${pickQuality.biggest_value.delta} picks past consensus.`,
    );
  }
  if (myRank != null && myRank <= Math.ceil(totalTeams / 4)) {
    wins.push(`Roster value rank ${myRank}/${totalTeams}: top quartile of the league.`);
  }
  if (myStarterFill.coverage >= 0.5) {
    wins.push(`${myStarterFill.filled}/${myStarterFill.required} starting slots covered already.`);
  }
  if (
    pickQuality &&
    pickQuality.biggest_reach &&
    pickQuality.biggest_reach.delta != null &&
    pickQuality.biggest_reach.delta <= -15
  ) {
    const meta = playerNameLookup(pickQuality.biggest_reach.player_id);
    watch_outs.push(
      `Biggest reach: ${meta?.name ?? pickQuality.biggest_reach.player_id} taken ${Math.abs(pickQuality.biggest_reach.delta)} picks before consensus.`,
    );
  }
  if (myRank != null && myRank > Math.floor((3 * totalTeams) / 4)) {
    watch_outs.push(`Roster value rank ${myRank}/${totalTeams}: trade-up may close the gap.`);
  }

  // Phase 1: model_alert_triggered always false until we have
  // historical standing-call records to compute adherence.
  const model_alert_triggered = false;

  return {
    picks_made_by_user: myPicks.length,
    total_picks_for_user: totalPicksForUser,
    overall_tier,
    headline,
    pick_quality: pickQualityMetric,
    league_rank: leagueRankMetric,
    build_coherence: buildCoherenceMetric,
    wins: wins.slice(0, 3),
    watch_outs: watch_outs.slice(0, 3),
    model_alert_triggered,
  };
}

function computeStarterFill(
  counts: Record<Position, number>,
  snap: LeagueSnapshot,
): { filled: number; required: number; coverage: number } {
  // Use the canonical roster-fit helper so SF / 2QB starter
  // requirements are correctly derived for the QB column. Per
  // INVARIANTS: never branch on starter_slots.hard.QB directly.
  const reqs = getHardStarterReqs(snap);
  let filled = 0;
  let required = 0;
  for (const pos of SCORING_POSITIONS) {
    const have = counts[pos] ?? 0;
    const need = reqs[pos] ?? 0;
    required += need;
    filled += Math.min(have, need);
  }
  return {
    filled,
    required,
    coverage: required > 0 ? filled / required : 0,
  };
}
