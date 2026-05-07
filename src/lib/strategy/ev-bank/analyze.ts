/**
 * Compute the EV Bank for the user's picks so far.
 *
 * Per feedback 2026-05-08: the user wanted a statistically defensible
 * "how much expected value have I banked vs. the market" measure with
 * an honest +/- range. This module ships the math + per-pick entries
 * the visualization renders.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type { EvBank, EvBankPickEntry } from "./types";

const ADP_NOISE_PICKS = 3;

export function analyzeEvBank(args: {
  snap: LeagueSnapshot;
  playerValueMap: Map<string, { value: number; overall_rank: number | null }>;
  playerNameLookup: (id: string) => { name: string; position: string | null } | null;
  getAdp: (id: string) => number | null;
}): EvBank | null {
  const { snap, playerValueMap, playerNameLookup, getAdp } = args;
  const myRoster = snap.rosters.find((r) => r.is_me);
  if (!myRoster) return null;
  const myPicks = snap.draft.picks_made
    .filter((p) => p.roster_id === myRoster.roster_id)
    .sort((a, b) => a.pick_no - b.pick_no);

  if (myPicks.length === 0) return null;

  const totalTeams = snap.total_teams || 12;

  const entries: EvBankPickEntry[] = myPicks.map((p) => {
    const meta = playerNameLookup(p.player_id);
    const valueRecord = playerValueMap.get(p.player_id);
    const value = valueRecord && typeof valueRecord.value === "number" ? valueRecord.value : null;
    const adp = getAdp(p.player_id);
    let evDelta: number | null = null;
    if (value != null && adp != null) {
      evDelta = round2((value / 100) * (p.pick_no - adp));
    }
    return {
      pick_no: p.pick_no,
      pick_label: pickLabelFor(p.pick_no, totalTeams),
      player_id: p.player_id,
      player_name: meta?.name ?? p.player_id,
      position: meta?.position ?? null,
      value,
      adp,
      ev_delta: evDelta,
    };
  });

  const resolved = entries.filter(
    (e): e is EvBankPickEntry & { value: number; adp: number; ev_delta: number } =>
      e.value != null && e.adp != null && e.ev_delta != null,
  );

  if (resolved.length === 0) {
    return {
      total_ev: null,
      range_low: null,
      range_high: null,
      adp_noise_picks: ADP_NOISE_PICKS,
      entries,
      summary: "ADP / value data not yet resolved for these picks.",
      tier: "solid",
    };
  }

  const totalEv = round2(resolved.reduce((s, e) => s + e.ev_delta, 0));

  // Best-case envelope: every ADP shifted +ADP_NOISE_PICKS later (the
  // market "really" valued them later, so the user's bargains look
  // bigger). Worst-case envelope: every ADP shifted -ADP_NOISE_PICKS
  // earlier. Sharp locks (negative ev_delta) flip with the same shift,
  // so both directions are honestly captured.
  const adjustedSum = (shift: number): number =>
    resolved.reduce(
      (s, e) => s + (e.value / 100) * (e.pick_no - (e.adp + shift)),
      0,
    );
  const rangeLow = resolved.length >= 2 ? round2(adjustedSum(ADP_NOISE_PICKS)) : null;
  const rangeHigh = resolved.length >= 2 ? round2(adjustedSum(-ADP_NOISE_PICKS)) : null;
  // Note: shift +N moves ADPs LATER, which means (pick_no - ADP) gets
  // SMALLER, so the sum gets SMALLER. So the "worst-case" is actually
  // shift +N (everyone's ADP was really N picks later, your bargains
  // shrink). Range_low is the smaller (worst) bound; range_high the
  // larger (best). The variable names match that mapping.

  let summary: string;
  if (totalEv >= 5) {
    summary = `Banked +${totalEv} EV pts across ${resolved.length} picks${rangeLow != null && rangeHigh != null ? `; range ${formatSigned(rangeLow)} to ${formatSigned(rangeHigh)}` : ""}.`;
  } else if (totalEv <= -5) {
    summary = `Net ${formatSigned(totalEv)} EV pts across ${resolved.length} picks${rangeLow != null && rangeHigh != null ? `; range ${formatSigned(rangeLow)} to ${formatSigned(rangeHigh)}` : ""}. Sharp locks count negative against the bank by definition; whether they were correct is a scarcity question answered in the Decision card.`;
  } else {
    summary = `${formatSigned(totalEv)} EV pts across ${resolved.length} picks; at market rate.`;
  }

  let tier: EvBank["tier"];
  if (totalEv >= 5) tier = "strong";
  else if (totalEv >= -5) tier = "solid";
  else if (totalEv >= -15) tier = "mixed";
  else tier = "off_track";

  return {
    total_ev: totalEv,
    range_low: rangeLow,
    range_high: rangeHigh,
    adp_noise_picks: ADP_NOISE_PICKS,
    entries,
    summary,
    tier,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatSigned(n: number): string {
  if (n >= 0) return `+${n.toFixed(1)}`;
  return `${n.toFixed(1)}`;
}

function pickLabelFor(pickNo: number, totalTeams: number): string {
  if (totalTeams <= 0) return `${pickNo}`;
  const round = Math.ceil(pickNo / totalTeams);
  const within = ((pickNo - 1) % totalTeams) + 1;
  return `${round}.${within}`;
}
