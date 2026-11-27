/**
 * Sunday lineup panel (BUILD_SPEC "Sunday lineup panel", approved by
 * Isaiah 2026-11-26 with the Moneyballer's points-per-game swaps kept).
 * The three analysts each judge every lineup from facts Dynasty General
 * can prove today, and nobody predicts what a player scores today:
 *
 *  - Strategist: holes. Starters who are Out, on IR, suspended or on bye,
 *    empty slots, and Questionable starters (with the inactives time).
 *  - Moneyballer: this season's scoring rate, shrunk toward the position
 *    mean, starter vs bench. A swap shows only when the bench player's
 *    shrunk rate beats the starter's by one combined standard error.
 *  - Gambler: the game this week with the largest playoff-chance swing
 *    between a win and a loss, from the season simulator.
 *
 * Pure: callers fetch leagues, matchups, players and the schedule. Each
 * fix is explained once (a slot the Strategist owns is never a
 * Moneyballer swap, and a bench player is used at most once).
 */

import { playerPosition, type Position } from "@/lib/strategy/archetypes/schema";
import { buildSimInputFromSleeper } from "@/lib/strategy/verdict/from-sleeper";
import { simulateSeason } from "@/lib/strategy/verdict/season-sim";
import { isRosterOwnedBy } from "@/lib/sleeper/roster-identity";
import type { SleeperLeague, SleeperLeagueUser, SleeperMatchup, SleeperPlayer, SleeperRoster } from "@/lib/sleeper/schemas";
import type { Kickoff, WeekSchedule } from "./schedule";

// ---------- the Moneyballer's threshold (stats steward, 2026-11-26) ----------

/**
 * Per position: sd of a player's weekly points, k = pseudo-games of the
 * position mean blended in, mean = position mean points per game.
 * INTERNAL_HEURISTIC: estimated by the stats steward from the 2026
 * snapshot's started weeks; re-estimate on each snapshot refresh.
 */
export const PPG_PRIOR: Record<"QB" | "RB" | "WR" | "TE", { sd: number; k: number; mean: number }> = {
  QB: { sd: 9.4, k: 2.4, mean: 18.8 },
  RB: { sd: 7.5, k: 3.1, mean: 10.8 },
  WR: { sd: 6.7, k: 4.4, mean: 9.3 },
  TE: { sd: 7.0, k: 5.5, mean: 9.1 },
};
/** Fewest scored games before a player's rate is compared at all. */
export const MIN_GAMES = 3;
/** Bench must beat starter by this many combined standard errors. */
export const SWAP_Z = 1;
/** NFL teams submit inactives 90 minutes before kickoff (league rule). */
export const INACTIVES_LEAD_MIN = 90;

const SKILL = new Set(["QB", "RB", "WR", "TE"]);
const NFL_TEAMS = new Set(
  "ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS".split(" "),
);
/** Statuses that keep a player off the field this week. */
const CANT_PLAY: Record<string, string> = { Out: "Out", IR: "on IR", PUP: "on the PUP list", Sus: "suspended", NA: "not active" };
/** Game-time decisions. */
const GAME_TIME = new Set(["Questionable", "Doubtful"]);

/** Which player positions a starting slot takes. */
export const SLOT_ELIGIBLE: Record<string, Position[]> = {
  QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DEF: ["DST"], DST: ["DST"],
  FLEX: ["RB", "WR", "TE"], SUPER_FLEX: ["QB", "RB", "WR", "TE"], REC_FLEX: ["WR", "TE"], WRRB_FLEX: ["WR", "RB"],
};
export const SLOT_LABEL: Record<string, string> = {
  FLEX: "FLEX", SUPER_FLEX: "superflex", REC_FLEX: "WR/TE flex", WRRB_FLEX: "WR/RB flex", DEF: "DEF", DST: "DEF",
};
const slotLabel = (s: string) => SLOT_LABEL[s] ?? s;

// ---------- types ----------

export interface PpgRead {
  games: number;
  raw: number;
  shrunk: number;
  /** Variance of the shrunk rate. */
  var: number;
}

export interface LineupPlayer {
  id: string;
  name: string;
  pos: Position | null;
  team: string | null;
  injury: string | null;
  kickoff: Kickoff | null;
  /** True only when the team is a known NFL team with no game this week. */
  bye: boolean;
  locked: boolean;
  ppg: PpgRead | null;
}

export type FixKind = "cant_play" | "bye" | "empty" | "game_time";
export interface StrategistFix {
  kind: FixKind;
  slot: string;
  starter: LineupPlayer | null;
  /** The best healthy, unlocked bench player who fits the slot, if any. */
  replacement: LineupPlayer | null;
  /** When this fix stops being possible. */
  lock: Date | null;
  /** Game-time decisions: when the inactives come out (CT label). */
  inactives?: { at: Date; label: string };
}

export interface MoneyballSwap {
  slot: string;
  starter: LineupPlayer;
  bench: LineupPlayer;
  /** Chance the bench player's true scoring rate is the higher one (normal approximation). */
  p_higher: number;
  lock: Date;
}

export interface SwingGame {
  opponent: string;
  /** 0..1 */
  win_pct: number;
  playoff_now: number;
  playoff_if_win: number;
  playoff_if_loss: number;
}

export interface LeagueLineup {
  leagueId: string;
  leagueName: string;
  fixes: StrategistFix[];
  swaps: MoneyballSwap[];
  /** Unlocked skill starters the Moneyballer compared and left alone. */
  checkedSlots: number;
  swing: SwingGame | null;
  /** Earliest time any fix or swap in this league locks. */
  lock: Date | null;
  /** When the read was made; times on another day print with the weekday. */
  asOf: Date;
}

export interface LineupPanel {
  week: number;
  leagues: LeagueLineup[];
  /** Leagues skipped, with why (best ball, no lineup found). */
  skipped: Array<{ leagueName: string; reason: string }>;
}

// ---------- helpers ----------

/** Shrink a raw scoring rate toward the position mean (normal-normal). */
export function shrinkPpg(pos: string, games: number, raw: number): PpgRead | null {
  const prior = PPG_PRIOR[pos as keyof typeof PPG_PRIOR];
  if (!prior || games < 1) return null;
  const shrunk = (games * raw + prior.k * prior.mean) / (games + prior.k);
  return { games, raw, shrunk, var: (prior.sd * prior.sd) / (games + prior.k) };
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26, error under 1.5e-7). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** z of bench over starter on shrunk rates; null when either lacks MIN_GAMES. */
export function swapZ(starter: PpgRead | null, bench: PpgRead | null): number | null {
  if (!starter || !bench || starter.games < MIN_GAMES || bench.games < MIN_GAMES) return null;
  return (bench.shrunk - starter.shrunk) / Math.sqrt(bench.var + starter.var);
}

function pointsMap(row: SleeperMatchup | undefined): Record<string, number> {
  const raw = (row as Record<string, unknown> | undefined)?.players_points;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  return out;
}

/**
 * This season's games for a player on this roster: weeks before `week`
 * where he was on the roster and scored nonzero (a zero is a bye or a
 * DNP, which says nothing about his rate).
 */
export function seasonPpg(
  matchupsByWeek: Record<number, SleeperMatchup[]>,
  rosterId: number,
  playerId: string,
  week: number,
): { games: number; raw: number } {
  let total = 0;
  let games = 0;
  for (const [wk, rows] of Object.entries(matchupsByWeek)) {
    if (Number(wk) >= week) continue;
    const row = rows.find((r) => r.roster_id === rosterId);
    if (!row || !(row.players ?? []).includes(playerId)) continue;
    const pts = pointsMap(row)[playerId];
    if (pts == null || pts === 0) continue;
    total += pts;
    games++;
  }
  return { games, raw: games > 0 ? total / games : 0 };
}

function playerName(id: string, p: SleeperPlayer | undefined): string | null {
  if (!p) return /^[A-Z]{2,3}$/.test(id) ? id : null;
  const r = p as Record<string, unknown>;
  if (r.position === "DEF") return `${String(r.first_name ?? id)} defense`.trim();
  const full = (r.full_name as string | undefined) ?? [r.first_name, r.last_name].filter(Boolean).join(" ");
  return full || null;
}

const isEmpty = (id: string | undefined | null) => !id || id === "0";

// ---------- the build ----------

export interface LineupLeagueInput {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  users: SleeperLeagueUser[];
  matchupsByWeek: Record<number, SleeperMatchup[]>;
}

export function buildLeagueLineup(args: {
  input: LineupLeagueInput;
  sleeperUserId: string;
  week: number;
  schedule: WeekSchedule;
  players: Map<string, SleeperPlayer>;
  now: Date;
  playoffWeekStart: number;
  playoffTeams: number;
  medianGame: boolean;
  seed?: number;
}): LeagueLineup | { skip: string } {
  const { league, rosters, users, matchupsByWeek } = args.input;
  const settings = (league.settings ?? {}) as Record<string, unknown>;
  if (settings.best_ball === 1) return { skip: "best ball sets itself" };
  const mine = rosters.find((r) => isRosterOwnedBy(r, args.sleeperUserId));
  if (!mine) return { skip: "no roster of yours" };
  if (args.week >= args.playoffWeekStart) return { skip: "regular season is over" };
  const row = (matchupsByWeek[args.week] ?? []).find((r) => r.roster_id === mine.roster_id);
  const starters = row?.starters ?? (mine.starters as string[] | undefined) ?? [];
  const slots = ((league.roster_positions ?? []) as string[]).filter((s) => s !== "BN" && s !== "TAXI" && s !== "IR");
  if (starters.length === 0 || slots.length === 0) return { skip: "no lineup this week" };
  const rosterIds = (row?.players ?? (mine.players as string[] | undefined) ?? []).filter((id) => !isEmpty(id));
  const reserve = new Set([...((mine.reserve as string[] | undefined) ?? []), ...((mine.taxi as string[] | undefined) ?? [])]);

  const read = (id: string): LineupPlayer | null => {
    const p = args.players.get(id);
    const name = playerName(id, p);
    if (!name) return null;
    const r = (p ?? {}) as Record<string, unknown>;
    const pos = p ? playerPosition(p) : /^[A-Z]{2,3}$/.test(id) ? "DST" : null;
    const team = (r.team as string | null | undefined) ?? (pos === "DST" ? id : null);
    const kickoff = team ? args.schedule.byTeam.get(team) ?? null : null;
    const bye = !!team && !kickoff && NFL_TEAMS.has(team) && args.schedule.byTeam.size > 0;
    const s = seasonPpg(matchupsByWeek, mine.roster_id, id, args.week);
    return {
      id, name, pos, team: team ?? null,
      injury: (r.injury_status as string | null | undefined) || null,
      kickoff, bye,
      locked: !!kickoff && kickoff.at.getTime() <= args.now.getTime(),
      ppg: pos && SKILL.has(pos) ? shrinkPpg(pos, s.games, s.raw) : null,
    };
  };

  const starterSet = new Set(starters.filter((s) => !isEmpty(s)));
  const bench = rosterIds
    .filter((id) => !starterSet.has(id) && !reserve.has(id))
    .map(read)
    .filter((p): p is LineupPlayer => !!p);
  const healthy = (p: LineupPlayer) => !p.injury && !p.bye && !p.locked && !!p.kickoff;
  const used = new Set<string>();
  const fits = (slot: string, p: LineupPlayer) => !!p.pos && (SLOT_ELIGIBLE[slot] ?? []).includes(p.pos);
  const bestFor = (slot: string): LineupPlayer | null => {
    const c = bench.filter((p) => healthy(p) && !used.has(p.id) && fits(slot, p));
    c.sort((a, b) => (b.ppg?.shrunk ?? -1) - (a.ppg?.shrunk ?? -1) || a.kickoff!.at.getTime() - b.kickoff!.at.getTime());
    return c[0] ?? null;
  };
  const minTime = (...ds: Array<Date | null | undefined>): Date | null => {
    const t = ds.filter((d): d is Date => !!d).map((d) => d.getTime());
    return t.length ? new Date(Math.min(...t)) : null;
  };

  // Strategist first: holes, then game-time decisions.
  const fixes: StrategistFix[] = [];
  const owned = new Set<number>();
  const starterReads: Array<{ i: number; slot: string; p: LineupPlayer }> = [];
  slots.forEach((slot, i) => {
    const id = starters[i];
    if (isEmpty(id)) {
      owned.add(i);
      const rep = bestFor(slot);
      if (rep) used.add(rep.id);
      fixes.push({ kind: "empty", slot, starter: null, replacement: rep, lock: rep?.kickoff?.at ?? null });
      return;
    }
    const p = read(id);
    if (!p || p.locked) return;
    const cant = p.injury && CANT_PLAY[p.injury];
    if (cant || p.bye) {
      owned.add(i);
      const rep = bestFor(slot);
      if (rep) used.add(rep.id);
      fixes.push({ kind: cant ? "cant_play" : "bye", slot, starter: p, replacement: rep, lock: rep?.kickoff?.at ?? null });
      return;
    }
    starterReads.push({ i, slot, p });
  });
  for (const { i, slot, p } of starterReads) {
    if (!p.injury || !GAME_TIME.has(p.injury) || !p.kickoff) continue;
    owned.add(i);
    const rep = bestFor(slot);
    if (rep) used.add(rep.id);
    const at = new Date(p.kickoff.at.getTime() - INACTIVES_LEAD_MIN * 60_000);
    fixes.push({
      kind: "game_time", slot, starter: p, replacement: rep,
      lock: minTime(p.kickoff.at, rep?.kickoff?.at),
      inactives: { at, label: inactivesLabel(at, args.now) },
    });
  }

  // Moneyballer: greedy by z over the slots the Strategist left alone.
  const open = starterReads.filter((s) => !owned.has(s.i) && s.p.pos && SKILL.has(s.p.pos));
  const swaps: MoneyballSwap[] = [];
  const taken = new Set<number>();
  for (;;) {
    let best: { s: (typeof open)[number]; b: LineupPlayer; z: number } | null = null;
    for (const s of open) {
      if (taken.has(s.i)) continue;
      for (const b of bench) {
        if (used.has(b.id) || !healthy(b) || !fits(s.slot, b)) continue;
        const z = swapZ(s.p.ppg, b.ppg);
        if (z != null && z >= SWAP_Z && (!best || z > best.z)) best = { s, b, z };
      }
    }
    if (!best) break;
    taken.add(best.s.i);
    used.add(best.b.id);
    swaps.push({
      slot: best.s.slot, starter: best.s.p, bench: best.b, p_higher: normCdf(best.z),
      lock: minTime(best.s.p.kickoff?.at, best.b.kickoff?.at)!,
    });
  }

  // Gambler: this league's game this week, from the season simulator.
  let swing: SwingGame | null = null;
  const sim = buildSimInputFromSleeper({
    rosterIds: rosters.map((r) => r.roster_id),
    matchupsByWeek,
    firstUnplayedWeek: args.week,
    playoffWeekStart: args.playoffWeekStart,
    playoffTeams: args.playoffTeams,
    medianGame: args.medianGame,
  });
  const res = simulateSeason(sim, { trackWeekOne: mine.roster_id, seed: args.seed });
  if (res.ok && res.week_one) {
    const opp = rosters.find((r) => r.roster_id === res.week_one!.opponent_id);
    const u = users.find((x) => x.user_id === opp?.owner_id);
    swing = {
      opponent: u?.display_name ?? `Roster ${res.week_one.opponent_id}`,
      win_pct: res.week_one.win_pct,
      playoff_now: res.odds[mine.roster_id]?.playoff_pct ?? 0,
      playoff_if_win: res.week_one.playoff_if_win,
      playoff_if_loss: res.week_one.playoff_if_loss,
    };
  }

  return {
    leagueId: league.league_id,
    leagueName: league.name.trim(),
    fixes,
    swaps,
    checkedSlots: open.length - swaps.length,
    swing,
    lock: minTime(...fixes.map((f) => f.lock), ...swaps.map((s) => s.lock)),
    asOf: args.now,
  };
}

/** "1:55 PM" in Central time for an instant. */
export function ctTime(d: Date): string {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).format(d);
  return s.replace(/ /g, " ");
}

const ctDay = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "numeric", day: "numeric" }).format(d);

/** "3:30 PM" when on the same Central day as asOf, else "Sun 12:00 PM". */
export function ctWhen(d: Date, asOf: Date): string {
  if (ctDay(d) === ctDay(asOf)) return ctTime(d);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(d);
  return `${wd} ${ctTime(d)}`;
}

/** "at 1:55 PM" today, "Sun at 10:30 AM" on another day. */
function inactivesLabel(at: Date, now: Date): string {
  const w = ctWhen(at, now);
  return /^[A-Z][a-z]{2} /.test(w) ? `${w.slice(0, 3)} at ${w.slice(4)}` : `at ${w}`;
}

/** Swing size in playoff-chance points (0..1). */
export const swingSize = (s: SwingGame | null) => (s ? s.playoff_if_win - s.playoff_if_loss : 0);

/** Leagues in the order their first fix locks; leagues with nothing to fix last. */
export function byLock(leagues: LeagueLineup[]): LeagueLineup[] {
  return [...leagues].sort((a, b) => (a.lock?.getTime() ?? Infinity) - (b.lock?.getTime() ?? Infinity) || a.leagueName.localeCompare(b.leagueName));
}

export { slotLabel };
