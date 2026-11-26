/**
 * Server loader for the contend-or-sell verdict. The ONE door the hub,
 * Coach and the weekly email call, so all three read the same object
 * built from the same inputs (object-parity rule).
 *
 * Inputs come from canonicals the caller already ran: the snapshot from
 * buildLeagueContext (startable depth annotated), the scoring values from
 * buildPricedPool (`playerValuesById`, the VALUE_MODE seam). This module
 * only adds the Sleeper matchups fetch.
 *
 * Week handling: weeks before nfl_state.week are treated as final; the
 * current week and later are simulated. Between Monday night and Sleeper's
 * week rollover the just-finished week is re-simulated rather than read,
 * which is conservative (it adds variance, never invents a result).
 */

import { getMatchups } from "@/lib/sleeper/client";
import type { SleeperLeague, SleeperMatchup, SleeperPlayer } from "@/lib/sleeper/schemas";
import { resolvePlayers } from "@/lib/players/cache";
import { getRealisticStarterMax } from "@/lib/engine/roster-fit";
import { buildFormatRulesFromSnapshot } from "@/lib/engine/llm-contract";
import { tradeWindow } from "./trade-window";
import { normalizePosition, type Position } from "../archetypes/schema";
import type { LeagueSnapshot } from "../league-state/snapshot";
import { buildContendOrSellVerdict, type VerdictPlayer, type VerdictResult } from "./compose";
import { buildSimInputFromSleeper, replacementPpg, startedPoints } from "./from-sleeper";
import type { BuyerInput, BuyerRead } from "./buyers";
import { buildAskLadder, type AskRung } from "./ask";

const SKILL: Position[] = ["QB", "RB", "WR", "TE"];
/** Sleeper's default when a league does not set playoff_week_start. */
const DEFAULT_PLAYOFF_WEEK_START = 15;
/** Sleeper's default playoff field. */
const DEFAULT_PLAYOFF_TEAMS = 6;

export function playoffSettings(league: SleeperLeague): { playoffWeekStart: number; playoffTeams: number } {
  const settings = (league.settings ?? {}) as Record<string, unknown>;
  return {
    playoffWeekStart:
      typeof settings.playoff_week_start === "number" && settings.playoff_week_start > 1
        ? settings.playoff_week_start
        : DEFAULT_PLAYOFF_WEEK_START,
    playoffTeams:
      typeof settings.playoff_teams === "number" && settings.playoff_teams > 0
        ? settings.playoff_teams
        : DEFAULT_PLAYOFF_TEAMS,
  };
}

/** Every regular-season week's matchups, one fetch per week. */
export async function fetchSeasonMatchups(league: SleeperLeague): Promise<Record<number, SleeperMatchup[]>> {
  const { playoffWeekStart } = playoffSettings(league);
  const weeks = Array.from({ length: playoffWeekStart - 1 }, (_, i) => i + 1);
  const out: Record<number, SleeperMatchup[]> = {};
  await Promise.all(
    weeks.map(async (w) => {
      out[w] = await getMatchups(league.league_id, w);
    }),
  );
  return out;
}

export async function loadContendOrSellVerdict(args: {
  league: SleeperLeague;
  snapshot: LeagueSnapshot;
  nflWeek: number | null | undefined;
  seasonType: string | null | undefined;
  playerValuesById: Record<string, number>;
  playersMap?: Map<string, SleeperPlayer>;
  titleWorth?: number;
  /** Pre-fetched season matchups (fetchSeasonMatchups); fetched here when absent. */
  matchupsByWeek?: Record<number, SleeperMatchup[]>;
  /** Latest week with final scores (lastCompletedWeek). Defaults to nflWeek - 1. */
  resultsWeek?: number;
}): Promise<VerdictResult> {
  if (args.seasonType !== "regular" || !args.nflWeek || args.nflWeek < 2) {
    return { ok: false, reason: "needs at least one finished regular-season week" };
  }
  const { playoffWeekStart, playoffTeams } = playoffSettings(args.league);
  if (args.nflWeek >= playoffWeekStart) {
    return { ok: false, reason: "regular season is over; playoff brackets are not simulated mid-bracket yet" };
  }
  const me = args.snapshot.rosters.find((r) => r.is_me);
  if (!me) return { ok: false, reason: "your roster was not identified in this league" };

  const matchupsByWeek = args.matchupsByWeek ?? (await fetchSeasonMatchups(args.league));
  const firstUnplayedWeek = (args.resultsWeek ?? args.nflWeek - 1) + 1;
  const sim = buildSimInputFromSleeper({
    rosterIds: args.snapshot.rosters.map((r) => r.roster_id),
    matchupsByWeek,
    firstUnplayedWeek,
    playoffWeekStart,
    playoffTeams,
  });

  const playersMap = args.playersMap ?? (await resolvePlayers(me.player_ids));
  const meta = me.player_ids.map((id) => {
    const p = playersMap.get(id);
    return {
      id,
      name: p?.full_name || [p?.first_name, p?.last_name].filter(Boolean).join(" ") || id,
      position: normalizePosition(p?.position ?? null),
      age: typeof p?.age === "number" ? p.age : null,
    };
  });
  const players: VerdictPlayer[] = [];
  for (const m of meta) {
    if (!m.position || !SKILL.includes(m.position)) continue;
    const value = args.playerValuesById[m.id];
    if (typeof value !== "number" || value <= 0) continue;
    const started = startedPoints(matchupsByWeek, me.roster_id, m.id, firstUnplayedWeek);
    const others = meta.filter((o) => o.id !== m.id && o.position === m.position).map((o) => o.id);
    const repl = replacementPpg(matchupsByWeek, me.roster_id, others, firstUnplayedWeek);
    players.push({
      player_id: m.id,
      name: m.name,
      position: m.position,
      age: m.age,
      value,
      ppg_started: started.ppg_started,
      weeks_started: started.weeks_started,
      replacement_ppg: repl.ppg,
    });
  }

  const buyers = (position: string): BuyerInput[] => {
    const pos = normalizePosition(position);
    if (!pos) return [];
    return args.snapshot.rosters.map((r) => ({
      roster_id: r.roster_id,
      label: r.owner_name ?? `Roster ${r.roster_id}`,
      title_pct: 0,
      playoff_pct: 0,
      startable_at_pos: r.startable_counts?.[pos] ?? r.position_counts[pos] ?? 0,
      starters_at_pos: getRealisticStarterMax(args.snapshot, pos),
    }));
  };

  const result = buildContendOrSellVerdict({
    sim,
    rosterId: me.roster_id,
    players,
    buyers,
    titleWorth: args.titleWorth,
    leagueType: args.snapshot.league_type,
    tradeWindow: tradeWindow(buildFormatRulesFromSnapshot(args.snapshot), args.nflWeek),
  });
  if (result.ok && result.verdict.candidates.length > 0) {
    // Last finished week's lineups: a contender's starters are not on the table.
    const lastRows = matchupsByWeek[firstUnplayedWeek - 1] ?? [];
    const starters = new Set(lastRows.flatMap((m) => m.starters ?? []));
    await attachAskLadders(result.verdict.candidates, args.snapshot, args.playerValuesById, playersMap, starters);
  }
  return result;
}

/**
 * Puts an acceptable-to-great ask on every ranked buyer: real players from
 * that buyer's roster, priced on the same scoring values as the player sold.
 */
async function attachAskLadders(
  candidates: { player: VerdictPlayer; buyers: BuyerRead[] }[],
  snapshot: LeagueSnapshot,
  values: Record<string, number>,
  known: Map<string, SleeperPlayer>,
  starters: Set<string>,
): Promise<void> {
  const buyerIds = new Set(candidates.flatMap((c) => c.buyers.map((b) => b.roster_id)));
  const rosters = snapshot.rosters.filter((r) => buyerIds.has(r.roster_id));
  const ids = rosters.flatMap((r) => r.player_ids).filter((id) => !known.has(id));
  const fetched = ids.length > 0 ? await resolvePlayers(ids) : new Map<string, SleeperPlayer>();
  const meta = (id: string) => known.get(id) ?? fetched.get(id);
  const offersFor = (rosterId: number): AskRung[] => {
    const r = rosters.find((x) => x.roster_id === rosterId);
    if (!r) return [];
    const out: AskRung[] = [];
    for (const id of r.player_ids) {
      const p = meta(id);
      const position = normalizePosition(p?.position ?? null);
      const value = values[id];
      if (!p || !position || typeof value !== "number") continue;
      // Never ask a seller to take back a hurt player (design QA, 2026-11-26).
      if (p.injury_status) continue;
      const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ");
      if (!name) continue;
      out.push({ player_id: id, name, position, value, age: typeof p.age === "number" ? p.age : null, starter: starters.has(id) });
    }
    return out;
  };
  for (const c of candidates) {
    for (const b of c.buyers) {
      b.ask = buildAskLadder({ targetValue: c.player.value, offers: offersFor(b.roster_id), excludePosition: c.player.position, soldAge: c.player.age });
    }
  }
}
