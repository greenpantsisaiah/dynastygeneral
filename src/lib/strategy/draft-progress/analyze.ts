/**
 * Compute the draft-progress scorecard for the user's own drafting
 * in a given league. Three metrics: pick quality (vs consensus),
 * league rank (by total roster value), build coherence (window
 * scores aligning with the structural state).
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type { Position } from "@/lib/strategy/archetypes/schema";
import { getHardStarterReqs } from "@/lib/engine/roster-fit";
import type { DraftProgress, ProgressMetric, ProgressTier } from "./types";

const SCORING_POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

export function analyzeDraftProgress(args: {
  snap: LeagueSnapshot;
  // Map player_id -> { value } from the same FantasyCalc resolution
  // that powers pricing.player_values. Used for league-rank
  // computation (sum of values across rosters).
  playerValueMap: Map<
    string,
    { value: number; overall_rank: number | null }
  >;
  playerNameLookup: (id: string) => { name: string; position: string | null } | null;
  // Format-aware ADP lookup. Returns the consensus draft position
  // for this player (Sleeper ADP via pickAdpFromVariants). Used
  // for positioning analysis. When null, the player has no ADP
  // for this format and we skip them in the calculation.
  getAdp: (id: string) => number | null;
}): DraftProgress | null {
  const { snap, playerValueMap, playerNameLookup, getAdp } = args;
  const myRoster = snap.rosters.find((r) => r.is_me);
  if (!myRoster) return null;
  const myPicks = snap.draft.picks_made.filter(
    (p) => p.roster_id === myRoster.roster_id,
  );
  const totalPicksForUser =
    snap.total_teams > 0 ? snap.draft.rounds : 0;

  // Metric 1: positioning vs ADP. For each pick the user made,
  // compute delta = ADP - pick_no. Positive = took player after
  // ADP (got value). Negative = took player before ADP (early
  // lock). Per founder feedback 2026-05-08: do NOT call early
  // picks "reaches" against the user. The user is following our
  // recommendations; off-ADP early picks are intentional sharp
  // positioning, not a failure of theirs. The metric REPORTS
  // positioning honestly without negative framing.
  type PickPositioning = {
    pick_no: number;
    player_id: string;
    adp: number | null;
    delta: number | null;
    label: "value" | "consensus" | "early-lock" | "sharp-lock";
  };
  const positioning: PickPositioning[] = myPicks.map((p) => {
    const adp = getAdp(p.player_id);
    if (adp == null) {
      return {
        pick_no: p.pick_no,
        player_id: p.player_id,
        adp: null,
        delta: null,
        label: "consensus",
      };
    }
    const delta = adp - p.pick_no;
    let label: PickPositioning["label"];
    if (delta >= 10) label = "value";
    else if (delta >= -8) label = "consensus";
    else if (delta >= -20) label = "early-lock";
    else label = "sharp-lock";
    return { pick_no: p.pick_no, player_id: p.player_id, adp, delta, label };
  });

  const resolvedPositioning = positioning.filter(
    (p): p is PickPositioning & { delta: number; adp: number } => p.delta != null,
  );

  let pickQualityMetric: ProgressMetric;
  if (positioning.length === 0) {
    pickQualityMetric = {
      label: "Positioning vs ADP",
      display_value: "no picks yet",
      sub_line: "Start drafting and we'll show your positioning vs Sleeper ADP on every pick.",
      tier: "solid",
    };
  } else if (resolvedPositioning.length === 0) {
    pickQualityMetric = {
      label: "Positioning vs ADP",
      display_value: "ungraded",
      sub_line: "ADP data not available for these picks yet.",
      tier: "solid",
    };
  } else {
    // Counts by label.
    const valuePicks = resolvedPositioning.filter((p) => p.label === "value");
    const consensusPicks = resolvedPositioning.filter(
      (p) => p.label === "consensus",
    );
    const earlyLockPicks = resolvedPositioning.filter(
      (p) => p.label === "early-lock",
    );
    const sharpLockPicks = resolvedPositioning.filter(
      (p) => p.label === "sharp-lock",
    );
    const sharpish = earlyLockPicks.length + sharpLockPicks.length;
    const totalCount = resolvedPositioning.length;
    const valueOrConsensus = valuePicks.length + consensusPicks.length;

    // Always positive framing: every pick has an honest narrative.
    // Tier is informational, not judgmental:
    //   strong: at least 1 value pick AND 0 sharp-locks
    //   solid: any combination, at-or-near consensus, no extreme sharp-locks
    //   mixed: multiple sharp-locks (intentional but worth verifying)
    //   off_track is reserved for extreme outliers; the user's own
    //   draft never lands here unless something is genuinely wrong.
    let tier: ProgressTier;
    if (valuePicks.length >= 1 && sharpLockPicks.length === 0) tier = "strong";
    else if (sharpLockPicks.length >= 2) tier = "mixed";
    else tier = "solid";

    const display_value =
      sharpish > 0
        ? `${valueOrConsensus}+${sharpish} sharp`
        : `${valueOrConsensus}/${totalCount}`;

    let sub: string;
    if (sharpLockPicks.length > 0) {
      const example = sharpLockPicks[0];
      const name =
        playerNameLookup(example.player_id)?.name ?? example.player_id;
      sub = `${valueOrConsensus} picks at-or-after consensus; ${sharpish} intentional early locks. Sharpest: ${name} taken ${Math.abs(example.delta)} picks before ADP. If the engine had a standing-call reason, that lock is the kind of move that wins drafts.`;
    } else if (earlyLockPicks.length > 0) {
      const example = earlyLockPicks[0];
      const name =
        playerNameLookup(example.player_id)?.name ?? example.player_id;
      sub = `${valueOrConsensus} picks at-or-after consensus; ${earlyLockPicks.length} early lock${earlyLockPicks.length === 1 ? "" : "s"}. Most off-ADP: ${name} (${Math.abs(example.delta)} picks early).`;
    } else if (valuePicks.length > 0) {
      const example = valuePicks.reduce((a, b) =>
        a.delta > b.delta ? a : b,
      );
      const name =
        playerNameLookup(example.player_id)?.name ?? example.player_id;
      sub = `${valuePicks.length} value pick${valuePicks.length === 1 ? "" : "s"}. Best: ${name} fell ${example.delta} picks past ADP.`;
    } else {
      sub = `${totalCount} picks at-or-near consensus; market-rate execution.`;
    }
    pickQualityMetric = {
      label: "Positioning vs ADP",
      display_value,
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
    headline = "Mixed signals. Some sharp positioning worth verifying.";
  } else {
    headline = "Off-script on at least one metric. The watch-outs below name the concern.";
  }

  // Wins + sharp-positioning callouts. Per founder feedback
  // 2026-05-08: NO "biggest reach" framing on the user's own
  // scorecard. Off-ADP picks are intentional sharp positioning,
  // not failures. Celebrate where the user went against consensus
  // and explain WHY when we can. The sharp_positioning array is
  // a separate emphasis list, not a watch-out.
  const wins: string[] = [];
  const watch_outs: string[] = [];
  const sharp_positioning: string[] = [];

  // Best ADP value pick (player who fell to the user)
  const bestValue = resolvedPositioning
    .filter((p) => p.delta >= 10)
    .sort((a, b) => b.delta - a.delta)[0];
  if (bestValue) {
    const meta = playerNameLookup(bestValue.player_id);
    wins.push(
      `Value pick: ${meta?.name ?? bestValue.player_id} fell ${bestValue.delta} picks past ADP.`,
    );
  }
  // Roster rank win
  if (myRank != null && myRank <= Math.ceil(totalTeams / 4)) {
    wins.push(
      `Roster value rank ${myRank}/${totalTeams}: top quartile of the league.`,
    );
  }
  // Starter coverage win
  if (myStarterFill.coverage >= 0.5) {
    wins.push(
      `${myStarterFill.filled}/${myStarterFill.required} starting slots already covered.`,
    );
  }

  // Sharp positioning: where the user went against consensus
  // intentionally. Frame as decisive, not as reckless.
  for (const pick of resolvedPositioning.filter(
    (p) => p.label === "early-lock" || p.label === "sharp-lock",
  )) {
    const meta = playerNameLookup(pick.player_id);
    const name = meta?.name ?? pick.player_id;
    const earlyBy = Math.abs(pick.delta);
    sharp_positioning.push(
      `${name} locked ${earlyBy} picks before ADP. Going against consensus, and decisive about it.`,
    );
  }

  // Watch-outs are now reserved for genuine roster construction
  // concerns the user can act on, not for criticizing past picks.
  if (myRank != null && myRank > Math.floor((3 * totalTeams) / 4)) {
    watch_outs.push(
      `Roster value rank ${myRank}/${totalTeams}: trade-up leverage may close the gap.`,
    );
  }
  if (
    myStarterFill.coverage < 0.3 &&
    myPicks.length >= Math.ceil((totalPicksForUser || 1) / 4)
  ) {
    watch_outs.push(
      `Starters thin: ${myStarterFill.filled}/${myStarterFill.required} after ${myPicks.length} picks. Worth checking the build direction.`,
    );
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
    sharp_positioning: sharp_positioning.slice(0, 3),
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
