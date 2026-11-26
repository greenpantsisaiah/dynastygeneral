/**
 * One league's week for the Tuesday Trade Desk (BUILD_SPEC PR 1, sections
 * 4 and 5): the user's result in the week that just finished, the record,
 * the playoff chance now vs before that week, and the league shifts
 * (managers whose playoff range moved, or who lost a high-value starter).
 *
 * Playoff change is the season simulator run twice on the same seed:
 * once with every final week, once without the week that just finished.
 * No storage, no new model (CANONICAL_SOURCES "Season simulator").
 */

import type { SleeperMatchup, SleeperPlayer } from "@/lib/sleeper/schemas";
import { buildSimInputFromSleeper } from "@/lib/strategy/verdict/from-sleeper";
import { simulateSeason, type TeamOdds } from "@/lib/strategy/verdict/season-sim";

export type PlayoffRange = "favorite" | "in_the_hunt" | "bubble" | "long_shot" | "no_chance";

/** Ranges by playoff chance (BUILD_SPEC section 5). */
export function playoffRange(raw: number): PlayoffRange {
  // Classify the PRINTED number (rounded to 5), so "25%" never reads Long shot.
  if (raw < 0.02) return "no_chance";
  const p = Math.round(raw * 20) / 20;
  if (p >= 0.8) return "favorite";
  if (p >= 0.5) return "in_the_hunt";
  if (p >= 0.25) return "bubble";
  if (p >= 0.02) return "long_shot";
  return "no_chance";
}

export const RANGE_LABEL: Record<PlayoffRange, string> = {
  favorite: "Favorite",
  in_the_hunt: "In the hunt",
  bubble: "Bubble",
  long_shot: "Long shot",
  no_chance: "No chance",
};
const RANGE_ORDER: PlayoffRange[] = ["no_chance", "long_shot", "bubble", "in_the_hunt", "favorite"];

export type ShiftRole = "seller" | "buyer" | "rival";

export interface LeagueShift {
  roster_id: number;
  manager: string;
  /** null for an injury-only row (no range move). */
  from: PlayoffRange | null;
  to: PlayoffRange | null;
  injury: { player: string; status: string } | null;
  why: string;
  role: ShiftRole;
}

export type WeekResult =
  | { kind: "h2h"; my: number; opp: number; opp_label: string; won: boolean | null }
  | { kind: "points_rank"; rank: number; teams: number };

export interface LeagueWeek {
  results_week: number;
  record: { wins: number; losses: number; ties: number };
  result: WeekResult | null;
  playoff_now: number | null;
  playoff_before: number | null;
  shifts: LeagueShift[];
  /** Why there are no odds (simulator declined), never stale numbers. */
  odds_note: string | null;
}

export interface WeekRosterInput {
  roster_id: number;
  manager: string;
  is_me: boolean;
  player_ids: string[];
  starters: string[];
}

/** League-wide value rank cutoff for a "key injury" row. */
const KEY_STARTER_VALUE_RANK = 36;
const OUT_STATUSES = new Set(["Out", "IR", "PUP", "Suspended", "COV", "NA"]);

const round1 = (n: number) => Math.round(n * 10) / 10;
/** Scores print with one decimal, so a 100.2-100.4 loss never reads as a tie. */
export const fmtScore = (n: number) => n.toFixed(1);

export function buildLeagueWeek(args: {
  rosters: WeekRosterInput[];
  matchupsByWeek: Record<number, SleeperMatchup[]>;
  resultsWeek: number;
  playoffWeekStart: number;
  playoffTeams: number;
  bestBall: boolean;
  seed?: number;
  /** Player meta for injury status; values for the top-N cutoff. */
  players?: Map<string, SleeperPlayer>;
  valueById?: Record<string, number>;
}): LeagueWeek {
  const me = args.rosters.find((r) => r.is_me);
  const ids = args.rosters.map((r) => r.roster_id);
  const label = new Map(args.rosters.map((r) => [r.roster_id, r.manager]));

  const simFor = (firstUnplayedWeek: number) =>
    simulateSeason(
      buildSimInputFromSleeper({
        rosterIds: ids,
        matchupsByWeek: args.matchupsByWeek,
        firstUnplayedWeek,
        playoffWeekStart: args.playoffWeekStart,
        playoffTeams: args.playoffTeams,
      }),
      { seed: args.seed },
    );
  const now = simFor(args.resultsWeek + 1);
  const before = simFor(args.resultsWeek);
  const sim = buildSimInputFromSleeper({
    rosterIds: ids,
    matchupsByWeek: args.matchupsByWeek,
    firstUnplayedWeek: args.resultsWeek + 1,
    playoffWeekStart: args.playoffWeekStart,
    playoffTeams: args.playoffTeams,
  });
  const mine = me ? sim.teams.find((t) => t.roster_id === me.roster_id) : undefined;
  const record = { wins: mine?.wins ?? 0, losses: mine?.losses ?? 0, ties: mine?.ties ?? 0 };

  // Result of the week that just finished.
  let result: WeekResult | null = null;
  const rows = args.matchupsByWeek[args.resultsWeek] ?? [];
  const myRow = me ? rows.find((r) => r.roster_id === me.roster_id) : undefined;
  if (myRow && rows.length > 0) {
    const my = round1(myRow.points ?? 0);
    const opp = myRow.matchup_id != null
      ? rows.find((r) => r.matchup_id === myRow.matchup_id && r.roster_id !== myRow.roster_id)
      : undefined;
    if (args.bestBall || !opp) {
      const rank = 1 + rows.filter((r) => (r.points ?? 0) > (myRow.points ?? 0)).length;
      result = { kind: "points_rank", rank, teams: rows.length };
    } else {
      const o = round1(opp.points ?? 0);
      result = { kind: "h2h", my, opp: o, opp_label: label.get(opp.roster_id) ?? "your opponent", won: my === o ? null : my > o };
    }
  }

  const oddsNow: Record<number, TeamOdds> | null = now.ok ? now.odds : null;
  const oddsBefore: Record<number, TeamOdds> | null = before.ok ? before.odds : null;

  const shifts: LeagueShift[] = [];
  if (me && oddsNow) {
    const myNow = oddsNow[me.roster_id]?.playoff_pct ?? 0;
    const iContend = myNow >= 0.5;
    // Value rank across the whole league, for the key-injury cutoff.
    const allIds = args.rosters.flatMap((r) => r.player_ids);
    const ranked = [...allIds].sort((a, b) => (args.valueById?.[b] ?? 0) - (args.valueById?.[a] ?? 0));
    const keyIds = new Set(ranked.slice(0, KEY_STARTER_VALUE_RANK).filter((id) => (args.valueById?.[id] ?? 0) > 0));
    for (const r of args.rosters) {
      if (r.is_me) continue;
      const a = oddsBefore?.[r.roster_id]?.playoff_pct;
      const b = oddsNow[r.roster_id]?.playoff_pct;
      if (b == null) continue;
      const to = playoffRange(b);
      const from = a == null ? null : playoffRange(a);
      const moved = from != null && from !== to;
      const hurt = r.starters
        .filter((id) => keyIds.has(id))
        .map((id) => args.players?.get(id))
        .find((p) => p && p.injury_status && OUT_STATUSES.has(p.injury_status));
      if (!moved && !hurt) continue;
      const up = moved && RANGE_ORDER.indexOf(to) > RANGE_ORDER.indexOf(from!);
      const pctLine = a == null ? "" : `${fmtPct(a)} to ${fmtPct(b)}`;
      const name = hurt ? hurt.full_name || [hurt.first_name, hurt.last_name].filter(Boolean).join(" ") : "";
      const why = [
        hurt ? `${name} is ${hurt.injury_status}` : null,
        moved ? `playoff chance ${pctLine}` : null,
      ].filter(Boolean).join("; ");
      // Seller: out of contention now. Rival: climbing while you contend.
      // Buyer: contending and short a starter (injury) or climbing.
      const out = to === "long_shot" || to === "no_chance";
      const role: ShiftRole = out ? "seller" : up && iContend ? "rival" : "buyer";
      shifts.push({
        roster_id: r.roster_id,
        manager: r.manager,
        from: moved ? from : null,
        to: moved ? to : null,
        injury: hurt ? { player: name, status: hurt.injury_status! } : null,
        why,
        role,
      });
    }
  }

  return {
    results_week: args.resultsWeek,
    record,
    result,
    playoff_now: me && oddsNow ? oddsNow[me.roster_id]?.playoff_pct ?? null : null,
    playoff_before: me && oddsBefore ? oddsBefore[me.roster_id]?.playoff_pct ?? null : null,
    shifts,
    odds_note: now.ok ? null : now.reason,
  };
}

/** Probabilities as printed in the brief: rounded to 5, clamped to "<2%" / ">98%". */
export function fmtPct(p: number): string {
  if (p < 0.02) return "<2%";
  if (p > 0.98) return ">98%";
  const r = Math.round((p * 100) / 5) * 5;
  return `${Math.min(95, Math.max(5, r))}%`;
}
