/**
 * League-level EV Bank: compute every roster's banked EV using the
 * same math as the user's individual bank, then rank.
 *
 * Per design principle 8 ("I want to know how much is in others
 * relatively, and how confident we are"): the user's EV bank is
 * meaningless without a league reference. This module produces the
 * leaderboard data + percentile rank + league average that the
 * redesigned Track Record surface renders as a horizontal bar
 * chart with confidence bands.
 *
 * Same per-pick math as analyzeEvBank, via the canonical perPickEv.
 * Range envelope from +/-3-pick ADP noise. Sharp locks count negative
 * against the bank by definition; the math is honest about that.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import { perPickEv, round2 } from "./formula";

const ADP_NOISE_PICKS = 3;

export type LeagueEvBankRoster = {
  roster_id: number;
  owner_name: string | null;
  is_me: boolean;
  // Cumulative EV banked. Null when no resolved entries (no values
  // / no ADPs available for this roster's picks).
  total_ev: number | null;
  range_low: number | null;
  range_high: number | null;
  // Number of resolved picks (had both value and ADP). Drives
  // confidence framing in the UI.
  resolved_picks: number;
  total_picks: number;
};

export type LeagueEvBankReadout = {
  rosters: LeagueEvBankRoster[];
  // The user's rank among rosters with resolved totals (1 = top).
  // Null when user has no resolved bank.
  my_rank: number | null;
  // Number of rosters with at least one resolved pick (denominator
  // for percentile and rank).
  ranked_count: number;
  // The user's percentile (0-100, higher is better). Null when
  // my_rank is null.
  my_percentile: number | null;
  // Mean EV bank across resolved rosters. Null when no rosters
  // resolved. Useful for the "league average is +1.2" callout.
  league_avg: number | null;
};

export function analyzeLeagueEvBank(args: {
  snap: LeagueSnapshot;
  playerValueMap: Map<string, { value: number }>;
  getAdp: (id: string) => number | null;
}): LeagueEvBankReadout {
  const { snap, playerValueMap, getAdp } = args;
  const rosters: LeagueEvBankRoster[] = snap.rosters.map((r) => {
    const picks = snap.draft.picks_made.filter(
      (p) => p.roster_id === r.roster_id,
    );
    const resolved: Array<{ value: number; pick_no: number; adp: number }> = [];
    for (const p of picks) {
      const value = playerValueMap.get(p.player_id)?.value;
      const adp = getAdp(p.player_id);
      if (typeof value === "number" && typeof adp === "number") {
        resolved.push({ value, pick_no: p.pick_no, adp });
      }
    }
    if (resolved.length === 0) {
      return {
        roster_id: r.roster_id,
        owner_name: r.owner_name,
        is_me: r.is_me,
        total_ev: null,
        range_low: null,
        range_high: null,
        resolved_picks: 0,
        total_picks: picks.length,
      };
    }
    const sumWithShift = (shift: number): number =>
      resolved.reduce(
        (s, e) => s + perPickEv(e.value, e.pick_no, e.adp + shift),
        0,
      );
    const total = round2(sumWithShift(0));
    const rangeLow = resolved.length >= 2 ? round2(sumWithShift(ADP_NOISE_PICKS)) : null;
    const rangeHigh = resolved.length >= 2 ? round2(sumWithShift(-ADP_NOISE_PICKS)) : null;
    return {
      roster_id: r.roster_id,
      owner_name: r.owner_name,
      is_me: r.is_me,
      total_ev: total,
      range_low: rangeLow,
      range_high: rangeHigh,
      resolved_picks: resolved.length,
      total_picks: picks.length,
    };
  });

  // Sort descending by total_ev, with nulls last.
  const sorted = [...rosters].sort((a, b) => {
    if (a.total_ev == null && b.total_ev == null) return 0;
    if (a.total_ev == null) return 1;
    if (b.total_ev == null) return -1;
    return b.total_ev - a.total_ev;
  });

  const ranked = sorted.filter((r) => r.total_ev != null);
  const ranked_count = ranked.length;
  const myIdx = ranked.findIndex((r) => r.is_me);
  const my_rank = myIdx >= 0 ? myIdx + 1 : null;
  const my_percentile =
    my_rank != null && ranked_count > 1
      ? round2(((ranked_count - my_rank) / (ranked_count - 1)) * 100)
      : my_rank != null && ranked_count === 1
        ? 100
        : null;
  const league_avg =
    ranked_count > 0
      ? round2(
          ranked.reduce((s, r) => s + (r.total_ev ?? 0), 0) / ranked_count,
        )
      : null;

  return {
    rosters: sorted,
    my_rank,
    ranked_count,
    my_percentile,
    league_avg,
  };
}
