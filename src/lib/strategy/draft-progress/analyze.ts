/**
 * Compute the draft-progress scorecard for the user's own drafting in
 * a given league.
 *
 * Redesign 2026-05-08 (post forum-question research): old shape was
 * three abstract metrics ("pick quality", "league rank", "build
 * coherence") that reported state instead of answering questions
 * drafters actually ask. New shape leads with a position-by-position
 * diagnostic (QB/RB/WR/TE strong/ok/thin/empty + best player + one-
 * line summary) which IS the universal forum question. League rank
 * and pick sharpness move to a condensed secondary row. Situational
 * callouts (position run, thin alerts) surface only when meaningful.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type { Position } from "@/lib/strategy/archetypes/schema";
import type { AvailablePlayer } from "@/lib/players/available";
import { getHardStarterReqs } from "@/lib/engine/roster-fit";
import { analyzeEvBank } from "@/lib/strategy/ev-bank";
import type {
  DraftProgress,
  PositionCode,
  PositionDiagnostic,
  PositionRun,
  PositionState,
  ProgressMetric,
  ProgressTier,
  ThinAlert,
} from "./types";

const SCORING_POSITIONS: PositionCode[] = ["QB", "RB", "WR", "TE"];
const RUN_WINDOW_SIZE = 8;
const RUN_THRESHOLD = 3;
const THIN_TOP_TIER_SIZE = 25;
const THIN_ALERT_REMAINING_LIMIT = 3;

export function analyzeDraftProgress(args: {
  snap: LeagueSnapshot;
  playerValueMap: Map<
    string,
    { value: number; overall_rank: number | null }
  >;
  playerNameLookup: (id: string) => { name: string; position: string | null } | null;
  // Format-aware ADP lookup. Sleeper ADP via pickAdpFromVariants.
  getAdp: (id: string) => number | null;
  // Available pool. Used for thin-alert detection (how many top-tier
  // players remain at each position). Empty array OK; thin alerts
  // simply won't fire.
  availablePool?: AvailablePlayer[];
}): DraftProgress | null {
  const { snap, playerValueMap, playerNameLookup, getAdp } = args;
  const availablePool = args.availablePool ?? [];
  const myRoster = snap.rosters.find((r) => r.is_me);
  if (!myRoster) return null;
  const myPicks = snap.draft.picks_made.filter(
    (p) => p.roster_id === myRoster.roster_id,
  );
  const totalPicksForUser =
    snap.total_teams > 0 ? snap.draft.rounds : 0;

  const reqs = getHardStarterReqs(snap);

  // Position diagnostic. The heart of the new surface.
  const position_diagnostic = SCORING_POSITIONS.map((pos) =>
    computePositionDiagnostic({
      position: pos,
      myRoster,
      need: reqs[pos as Position] ?? 0,
      playerValueMap,
      playerNameLookup,
    }),
  );

  // League rank by total roster value (kept, condensed).
  const leagueRankMetric = computeLeagueRankMetric({ snap, myRoster, playerValueMap });

  // "Best value" replaced "Pick sharpness" 2026-05-08. Old metric
  // surfaced a single negative number for the earliest lock ("−14"),
  // which was confusing on first read and one-sided. New metric
  // focuses on the positive direction (market gifts that fell past
  // ADP); sharp locks are already surfaced in the SHARP POSITIONING
  // sub-section, so we don't double-render them.
  const bestValueMetric = computeBestValueMetric({
    myPicks,
    getAdp,
    playerNameLookup,
  });

  // Situational callouts.
  const position_run = computePositionRun(snap);
  const thin_alerts = computeThinAlerts({
    position_diagnostic,
    availablePool,
    playerValueMap,
  });

  // Headline + overall tier. Anchor on the strongest signal in this
  // priority: empty needed position > thin needed position > league rank
  // bottom-quartile > everything ok.
  const overall_tier = computeOverallTier({
    position_diagnostic,
    leagueRankMetric,
  });
  const headline = composeHeadline({
    overall_tier,
    position_diagnostic,
    position_run,
    thin_alerts,
    leagueRankMetric,
    picksMade: myPicks.length,
  });

  // Wins, watch-outs, sharp positioning. Smaller surface than v1 but
  // useful for emotional context.
  const { wins, watch_outs, sharp_positioning } = composeCallouts({
    myPicks,
    getAdp,
    playerNameLookup,
    position_diagnostic,
    leagueRankMetric,
  });

  // EV bank: per-pick + cumulative value-vs-market measure with a
  // realistic ADP-noise envelope. Independent of the rest of the
  // panel state; runs over the same picks + value/ADP lookups.
  const ev_bank = analyzeEvBank({
    snap,
    playerValueMap,
    playerNameLookup,
    getAdp,
  });

  return {
    picks_made_by_user: myPicks.length,
    total_picks_for_user: totalPicksForUser,
    overall_tier,
    headline,
    position_diagnostic,
    league_rank: leagueRankMetric,
    best_value: bestValueMetric,
    position_run,
    thin_alerts,
    wins,
    watch_outs,
    sharp_positioning,
    ev_bank,
    model_alert_triggered: false,
  };
}

function computePositionDiagnostic(args: {
  position: PositionCode;
  myRoster: LeagueSnapshot["rosters"][number];
  need: number;
  playerValueMap: Map<
    string,
    { value: number; overall_rank: number | null }
  >;
  playerNameLookup: (id: string) => { name: string; position: string | null } | null;
}): PositionDiagnostic {
  const { position, myRoster, need, playerValueMap, playerNameLookup } = args;
  const have = myRoster.position_counts[position as Position] ?? 0;

  // Identify all players this user has at this position; pick the one
  // with the highest FantasyCalc value as the anchor.
  let bestName: string | null = null;
  let bestValue: number | null = null;
  for (const id of myRoster.player_ids ?? []) {
    const meta = playerNameLookup(id);
    if (!meta) continue;
    if ((meta.position ?? "").toUpperCase() !== position) continue;
    const val = playerValueMap.get(id)?.value ?? null;
    if (val == null) {
      if (bestName == null) bestName = meta.name;
      continue;
    }
    if (bestValue == null || val > bestValue) {
      bestValue = val;
      bestName = meta.name;
    }
  }

  const state: PositionState =
    have === 0 && need > 0
      ? "empty"
      : have < need
        ? "thin"
        : have > need
          ? "strong"
          : "ok";

  const summary = composePositionSummary({
    position,
    have,
    need,
    state,
    bestName,
    bestValue,
  });

  return {
    position,
    have,
    need,
    state,
    best_player_name: bestName,
    best_player_value: bestValue,
    summary,
  };
}

function composePositionSummary(args: {
  position: PositionCode;
  have: number;
  need: number;
  state: PositionState;
  bestName: string | null;
  bestValue: number | null;
}): string {
  const { position, have, need, state, bestName } = args;
  if (state === "empty") {
    if (need === 0) return `Optional. None drafted.`;
    return `No ${position} drafted yet. ${need} starter${need === 1 ? "" : "s"} required.`;
  }
  if (state === "thin") {
    return `Starter only (${bestName ?? position}). ${need - have} more starter${need - have === 1 ? "" : "s"} needed.`;
  }
  if (state === "ok") {
    return bestName
      ? `${bestName} anchors the room. Starting requirement met.`
      : `Starting requirement met.`;
  }
  // strong
  const depth = have - need;
  return bestName
    ? `${bestName} anchors. ${depth} extra body for depth/trade.`
    : `Starters covered with depth.`;
}

function computeLeagueRankMetric(args: {
  snap: LeagueSnapshot;
  myRoster: LeagueSnapshot["rosters"][number];
  playerValueMap: Map<
    string,
    { value: number; overall_rank: number | null }
  >;
}): ProgressMetric {
  const { snap, myRoster, playerValueMap } = args;
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

  if (myRank == null || ranked.length === 0 || ranked[0][1] === 0) {
    return {
      label: "League rank",
      display_value: "ungraded",
      sub_line: "Roster values not yet resolved.",
      tier: "solid",
      ungraded: true,
    };
  }

  const myValue = totalsByRoster.get(myRoster.roster_id) ?? 0;
  const topValue = ranked[0][1];
  let tier: ProgressTier;
  let sub: string;

  if (myRank === 1) {
    const second = ranked[1];
    if (second) {
      const lead = myValue - second[1];
      const leadPct = myValue > 0 ? Math.round((lead / myValue) * 100) : 0;
      sub = `Lead ${Math.round(lead)} pts over #2 (${leadPct}%).`;
    } else {
      sub = `Sole roster valued.`;
    }
    tier = "strong";
  } else if (myRank <= Math.ceil(totalTeams / 4)) {
    const pct = topValue > 0 ? Math.round((myValue / topValue) * 100) : 0;
    sub = `Top quartile. ${pct}% of leader's value.`;
    tier = "strong";
  } else if (myRank <= Math.ceil(totalTeams / 2)) {
    const pct = topValue > 0 ? Math.round((myValue / topValue) * 100) : 0;
    sub = `Mid-pack. ${pct}% of leader.`;
    tier = "solid";
  } else if (myRank <= Math.floor((3 * totalTeams) / 4)) {
    const pct = topValue > 0 ? Math.round((myValue / topValue) * 100) : 0;
    sub = `Below mid-pack. ${pct}% of leader.`;
    tier = "mixed";
  } else {
    sub = `Bottom quartile by roster value.`;
    tier = "off_track";
  }

  return {
    label: "League rank",
    display_value: `${myRank} of ${totalTeams}`,
    sub_line: sub,
    tier,
    numeric_value: myRank,
  };
}

function computeBestValueMetric(args: {
  myPicks: LeagueSnapshot["draft"]["picks_made"];
  getAdp: (id: string) => number | null;
  playerNameLookup: (id: string) => { name: string; position: string | null } | null;
}): ProgressMetric {
  // Renamed from "Pick sharpness" 2026-05-08 (post user feedback).
  // Old metric showed a single negative number ("−14") for the
  // earliest lock, which read as "your sharpness is negative" instead
  // of "you locked decisively when scarcity said go." The negative
  // direction (sharp locks) is already covered by the SHARP POSITIONING
  // sub-section. This card focuses on the positive direction (market
  // gifts: players who fell past consensus into your slot) so the
  // displayed number always reads as a win or honestly says "no value
  // picks yet."
  const { myPicks, getAdp, playerNameLookup } = args;
  if (myPicks.length === 0) {
    return {
      label: "Best value",
      display_value: "no picks yet",
      sub_line: "Players who fall past consensus into your slot will land here.",
      tier: "solid",
      ungraded: true,
    };
  }

  // delta = pick_no - adp. POSITIVE = player fell past ADP into your
  // slot (value pickup). NEGATIVE = you picked the player before ADP
  // (sharp lock / reach). The original code computed `adp - pick_no`
  // and labelled positive results "fell past ADP," which inverted the
  // sign and surfaced REACHES as value picks. 2026-05-11 izzydabomb
  // draft: Jordan Mason at pick 105 with ADP 169 produced delta +64 on
  // the inverted math, was celebrated as "Fell 64 picks past ADP," but
  // the EV bank correctly reported -8.3 EV for the same pick. Two
  // surfaces in the same panel directly contradicted each other.
  // Single source of truth: pick_no - adp, same direction the EV bank
  // uses.
  type Resolved = { pick_no: number; player_id: string; delta: number };
  const resolved: Resolved[] = [];
  for (const p of myPicks) {
    const adp = getAdp(p.player_id);
    if (adp == null) continue;
    resolved.push({
      pick_no: p.pick_no,
      player_id: p.player_id,
      delta: p.pick_no - adp,
    });
  }

  if (resolved.length === 0) {
    return {
      label: "Best value",
      display_value: "ungraded",
      sub_line: "ADP data not resolved yet.",
      tier: "solid",
      ungraded: true,
    };
  }

  const valuePicks = resolved.filter((p) => p.delta >= 10);
  const bestValue = valuePicks.sort((a, b) => b.delta - a.delta)[0];

  if (bestValue) {
    const meta = playerNameLookup(bestValue.player_id);
    const name = meta?.name ?? bestValue.player_id;
    const fellBy = Math.round(bestValue.delta);
    return {
      label: "Best value",
      display_value: `${name} +${fellBy}`,
      sub_line: `Fell ${fellBy} picks past ADP into your slot. ${valuePicks.length > 1 ? `${valuePicks.length} value pickups so far.` : "Market gift."}`,
      tier: "strong",
    };
  }

  // No value pickups yet. Show neutral "at consensus" framing.
  return {
    label: "Best value",
    display_value: "at consensus",
    sub_line: "Picks at-or-near ADP. No market gifts yet; sharp locks (if any) appear below.",
    tier: "solid",
  };
}

function computePositionRun(snap: LeagueSnapshot): PositionRun | null {
  const allPicks = [...snap.draft.picks_made].sort((a, b) => a.pick_no - b.pick_no);
  if (allPicks.length < RUN_WINDOW_SIZE) return null;
  const window = allPicks.slice(-RUN_WINDOW_SIZE);
  const counts: Record<PositionCode, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const p of window) {
    if (p.position && counts[p.position as PositionCode] !== undefined) {
      counts[p.position as PositionCode]!++;
    }
  }
  let topPos: PositionCode | null = null;
  let topCount = 0;
  for (const pos of SCORING_POSITIONS) {
    if (counts[pos] > topCount) {
      topCount = counts[pos];
      topPos = pos;
    }
  }
  if (!topPos || topCount < RUN_THRESHOLD) return null;
  return {
    position: topPos,
    picks_in_window: topCount,
    window_size: RUN_WINDOW_SIZE,
    message: `${topPos} run on. ${topCount} of last ${RUN_WINDOW_SIZE} picks were ${topPos}s.`,
  };
}

function computeThinAlerts(args: {
  position_diagnostic: PositionDiagnostic[];
  availablePool: AvailablePlayer[];
  playerValueMap: Map<string, { value: number; overall_rank: number | null }>;
}): ThinAlert[] {
  const { position_diagnostic, availablePool, playerValueMap } = args;
  if (availablePool.length === 0) return [];

  const alerts: ThinAlert[] = [];

  for (const diag of position_diagnostic) {
    if (diag.state !== "empty" && diag.state !== "thin") continue;
    const positionPlayers = availablePool.filter(
      (p) => (p.position ?? "").toUpperCase() === diag.position,
    );
    const ranked = positionPlayers
      .map((p) => ({
        id: p.id,
        name: p.name,
        value: playerValueMap.get(p.id)?.value ?? null,
        overall_rank: playerValueMap.get(p.id)?.overall_rank ?? null,
      }))
      .filter((p) => p.overall_rank != null && p.overall_rank! <= THIN_TOP_TIER_SIZE)
      .sort((a, b) => (a.overall_rank ?? 999) - (b.overall_rank ?? 999));

    if (ranked.length <= THIN_ALERT_REMAINING_LIMIT && ranked.length > 0) {
      alerts.push({
        position: diag.position,
        remaining_top_tier: ranked.length,
        top_names: ranked.slice(0, 3).map((p) => p.name),
        message: `Only ${ranked.length} top-${THIN_TOP_TIER_SIZE} ${diag.position}${ranked.length === 1 ? "" : "s"} left. Lock one before they go.`,
      });
    }
  }

  return alerts.slice(0, 3);
}

function computeOverallTier(args: {
  position_diagnostic: PositionDiagnostic[];
  leagueRankMetric: ProgressMetric;
}): ProgressTier {
  const { position_diagnostic, leagueRankMetric } = args;

  const hasEmptyNeeded = position_diagnostic.some(
    (d) => d.state === "empty" && d.need > 0,
  );
  if (hasEmptyNeeded && !leagueRankMetric.ungraded) {
    if (leagueRankMetric.tier === "strong") return "solid";
    return "mixed";
  }

  const allOkOrStrong = position_diagnostic
    .filter((d) => d.need > 0)
    .every((d) => d.state === "ok" || d.state === "strong");

  if (
    allOkOrStrong &&
    !leagueRankMetric.ungraded &&
    (leagueRankMetric.tier === "strong" || leagueRankMetric.tier === "solid")
  ) {
    return leagueRankMetric.tier === "strong" ? "strong" : "solid";
  }

  if (leagueRankMetric.tier === "off_track") return "off_track";
  if (leagueRankMetric.ungraded) return allOkOrStrong ? "solid" : "mixed";
  return leagueRankMetric.tier;
}

function composeHeadline(args: {
  overall_tier: ProgressTier;
  position_diagnostic: PositionDiagnostic[];
  position_run: PositionRun | null;
  thin_alerts: ThinAlert[];
  leagueRankMetric: ProgressMetric;
  picksMade: number;
}): string {
  const { overall_tier, position_diagnostic, position_run, thin_alerts, picksMade } = args;

  // Headline rewritten 2026-05-08 (post user feedback): the panel
  // describes STATE; the Decision card prescribes ACTION. Old
  // headlines used prescriptive language ("two starter holes outweigh
  // anything else", "that's the gap to close", "depth or upgrade is
  // the next move") which imposed a "fill holes first" doctrine that
  // is not statistically grounded. If the engine has identified an
  // EV-defying market gift at a non-hole position, the headline must
  // not contradict it. Stick to facts; let the Decision card recommend.
  if (picksMade === 0) {
    return "Draft begins. Targets and gaps will appear here as you go.";
  }

  const empties = position_diagnostic.filter(
    (d) => d.state === "empty" && d.need > 0,
  );
  const thins = position_diagnostic.filter((d) => d.state === "thin");
  const strongs = position_diagnostic.filter((d) => d.state === "strong");

  // Compose a fact-only headline. Lead with the most surprising state
  // (empties first, then thin alerts, then position runs), end with
  // a context modifier. No prescription.
  const stateParts: string[] = [];
  if (empties.length > 0) {
    const labels = empties.map((d) => d.position).join(" and ");
    stateParts.push(`${labels} ${empties.length === 1 ? "untouched" : "still untouched"}`);
  }
  if (thins.length > 0) {
    const labels = thins.map((d) => `${d.position} thin (${d.have}/${d.need})`).join(", ");
    stateParts.push(labels);
  }
  if (position_run && position_diagnostic.find((d) => d.position === position_run.position)?.state !== "strong") {
    stateParts.push(`${position_run.position} run on (${position_run.picks_in_window}-of-${position_run.window_size})`);
  }
  if (stateParts.length > 0) {
    return stateParts.join(". ") + ".";
  }

  // No empties, no thins, no relevant run. Healthy state.
  if (overall_tier === "strong" && strongs.length >= 2) {
    return "Roster taking shape. Multiple positions covered with depth.";
  }
  if (overall_tier === "strong") {
    return "Starters covered. Value pickups available.";
  }
  if (overall_tier === "solid") {
    return "On track. No urgent gaps at this stage.";
  }
  if (overall_tier === "mixed") {
    return "Mixed signals across roster build and league rank.";
  }
  return "Off-pace by league-value rank.";
}

function composeCallouts(args: {
  myPicks: LeagueSnapshot["draft"]["picks_made"];
  getAdp: (id: string) => number | null;
  playerNameLookup: (id: string) => { name: string; position: string | null } | null;
  position_diagnostic: PositionDiagnostic[];
  leagueRankMetric: ProgressMetric;
}): { wins: string[]; watch_outs: string[]; sharp_positioning: string[] } {
  const { myPicks, getAdp, playerNameLookup, position_diagnostic, leagueRankMetric } = args;
  const wins: string[] = [];
  const watch_outs: string[] = [];
  const sharp_positioning: string[] = [];

  // Best ADP value pick. delta = pick_no - adp; POSITIVE = fell past
  // ADP into your slot. Matches computeBestValueMetric + the EV bank.
  let bestValue: { player_id: string; delta: number } | null = null;
  for (const p of myPicks) {
    const adp = getAdp(p.player_id);
    if (adp == null) continue;
    const delta = p.pick_no - adp;
    if (delta < 10) continue;
    if (!bestValue || delta > bestValue.delta) {
      bestValue = { player_id: p.player_id, delta };
    }
  }
  if (bestValue) {
    const meta = playerNameLookup(bestValue.player_id);
    wins.push(
      `Value pick: ${meta?.name ?? bestValue.player_id} fell ${Math.round(bestValue.delta)} picks past ADP.`,
    );
  }

  // League rank as a win when top quartile
  if (leagueRankMetric.tier === "strong" && !leagueRankMetric.ungraded) {
    wins.push(`League rank ${leagueRankMetric.display_value} by total value.`);
  }

  // Strong-position win
  const strongs = position_diagnostic.filter((d) => d.state === "strong");
  for (const d of strongs.slice(0, 1)) {
    if (d.best_player_name) {
      wins.push(
        `${d.position} room loaded: ${d.best_player_name} plus ${d.have - d.need} extra for depth.`,
      );
    }
  }

  // Sharp positioning callouts: early locks. delta = pick_no - adp;
  // NEGATIVE = picked before ADP (scarcity-driven lock). Threshold of
  // -10 surfaces only meaningful locks, not at-market picks. With the
  // sign fix on 2026-05-11 this no longer mislabels value picks as
  // sharp locks (Mahomes/Warren/Tate were value pickups, not locks).
  for (const p of myPicks) {
    const adp = getAdp(p.player_id);
    if (adp == null) continue;
    const delta = p.pick_no - adp;
    if (delta > -10) continue;
    const meta = playerNameLookup(p.player_id);
    const name = meta?.name ?? p.player_id;
    sharp_positioning.push(
      `${name} locked ${Math.round(Math.abs(delta))} picks before ADP. Decisive when scarcity said go.`,
    );
  }

  // Watch-outs: empty needed positions and bottom-quartile rank
  for (const d of position_diagnostic) {
    if (d.state === "empty" && d.need > 0) {
      watch_outs.push(`${d.position} untouched. ${d.need} starter${d.need === 1 ? "" : "s"} still required.`);
    }
  }
  if (leagueRankMetric.tier === "off_track" && !leagueRankMetric.ungraded) {
    watch_outs.push(`Bottom-quartile by total value. Trade-up leverage may help.`);
  }

  return {
    wins: wins.slice(0, 3),
    watch_outs: watch_outs.slice(0, 3),
    sharp_positioning: sharp_positioning.slice(0, 3),
  };
}
