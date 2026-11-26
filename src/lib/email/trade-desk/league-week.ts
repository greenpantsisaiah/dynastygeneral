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

/**
 * What a shifted manager means for you (desk1 review: the labels were
 * undefined and showed even where no trade is possible). The legend in the
 * email prints these same definitions.
 *   Seller: now a Long shot or No chance, so likely to sell veterans.
 *   Rival: rose this week while you are in the hunt or better (50%+).
 *   Buyer: Bubble or better and either lost a key starter or rose into
 *          Favorite or In the hunt, so likely to pay for help.
 * Blank (null) when none apply, and always blank in a league whose trade
 * window is closed.
 */
export const ROLE_DEFINITIONS: Record<ShiftRole, string> = {
  seller: "Seller: now a long shot or out, likely to sell veterans",
  buyer: "Buyer: still alive and lost a key starter or climbed into the hunt, likely to pay for help",
  rival: "Rival: climbed this week while you are 50% or better",
};

export interface LeagueShift {
  roster_id: number;
  manager: string;
  /** null for an injury-only row (no range move). */
  from: PlayoffRange | null;
  to: PlayoffRange | null;
  injury: { player: string; status: string } | null;
  /** The cause first (result, record, injury), then the odds change. */
  why: string;
  /** null where no label applies or trading is closed in this league. */
  role: ShiftRole | null;
  /**
   * What this manager means for you, said concretely (Isaiah, 2026-11-26:
   * "I genuinely don't understand what buyer/seller is telling me").
   * "Could sell you Ja'Marr Chase or Kyren Williams", "Rival: 1 game back
   * of you", "Needs a RB with Bijan Robinson out". null with no role.
   * The email may replace a buyer's action with the trade card it ties to.
   */
  action: string | null;
  /** Player names inside `action` (user-supplied names for the copy lint). */
  action_players: string[];
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
  /** Trade window open in this league (tradeWindow canonical). Closed: no for-you labels. */
  tradeOpen?: boolean;
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

  /** "Lost 88.2-131.4 to Gridirongoat, now 3-8" for a roster's finished week. */
  const weekCause = (rid: number): string | null => {
    const t = sim.teams.find((x) => x.roster_id === rid);
    const recNow = t ? `now ${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}` : null;
    const row = rows.find((x) => x.roster_id === rid);
    if (!row) return recNow;
    const pts = round1(row.points ?? 0);
    const opp = !args.bestBall && row.matchup_id != null
      ? rows.find((x) => x.matchup_id === row.matchup_id && x.roster_id !== rid)
      : undefined;
    if (!opp) return [`Scored ${fmtScore(pts)}`, recNow].filter(Boolean).join(", ");
    const o = round1(opp.points ?? 0);
    const who = label.get(opp.roster_id) ?? "their opponent";
    const res = pts === o ? `Tied ${who} ${fmtScore(pts)}-${fmtScore(o)}` : pts > o ? `Beat ${who} ${fmtScore(pts)}-${fmtScore(o)}` : `Lost ${fmtScore(pts)}-${fmtScore(o)} to ${who}`;
    return [res, recNow].filter(Boolean).join(", ");
  };

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
      const name = hurt ? hurt.full_name || [hurt.first_name, hurt.last_name].filter(Boolean).join(" ") : "";
      const why = [
        weekCause(r.roster_id),
        hurt ? `${name} is ${hurt.injury_status}` : null,
        moved && a != null ? `playoff chance ${fmtPct(a)} to ${fmtPct(b)}` : null,
      ].filter(Boolean).join("; ");
      const alive = RANGE_ORDER.indexOf(to) >= RANGE_ORDER.indexOf("bubble");
      const intoHunt = up && (to === "favorite" || to === "in_the_hunt");
      const role: ShiftRole | null = args.tradeOpen === false
        ? null
        : to === "long_shot" || to === "no_chance"
          ? "seller"
          : up && iContend
            ? "rival"
            : alive && (hurt || intoHunt)
              ? "buyer"
              : null;
      const act = role ? shiftAction({ role, roster: r, me, sim, hurt: hurt ? { name, position: hurt.position ?? null } : null, players: args.players, valueById: args.valueById }) : null;
      shifts.push({
        roster_id: r.roster_id,
        manager: r.manager,
        from: moved ? from : null,
        to: moved ? to : null,
        injury: hurt ? { player: name, status: hurt.injury_status! } : null,
        why,
        role,
        action: act?.text ?? null,
        action_players: act?.players ?? [],
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

const SKILL = new Set(["QB", "RB", "WR", "TE"]);
const playerName = (p: SleeperPlayer | undefined) =>
  p ? p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") : "";

/** The concrete "for you" line behind a role. Pure over the week's inputs. */
export function shiftAction(a: {
  role: ShiftRole;
  roster: WeekRosterInput;
  me: WeekRosterInput;
  sim: { teams: Array<{ roster_id: number; wins: number; losses: number; ties: number }> };
  hurt: { name: string; position: string | null } | null;
  players?: Map<string, SleeperPlayer>;
  valueById?: Record<string, number>;
}): { text: string; players: string[] } | null {
  if (a.role === "rival") {
    const t = a.sim.teams.find((x) => x.roster_id === a.roster.roster_id);
    const mine = a.sim.teams.find((x) => x.roster_id === a.me.roster_id);
    if (!t || !mine) return null;
    const gap = mine.wins + mine.ties / 2 - (t.wins + t.ties / 2);
    const g = Math.abs(gap);
    const games = `${g % 1 ? g.toFixed(1) : g} ${g === 1 ? "game" : "games"}`;
    return { text: gap === 0 ? "Rival: now tied with you" : gap > 0 ? `Rival: now ${games} back of you` : `Rival: now ${games} ahead of you`, players: [] };
  }
  if (a.role === "seller") {
    const top = a.roster.player_ids
      .map((id) => ({ id, v: a.valueById?.[id] ?? 0, p: a.players?.get(id) }))
      .filter((x) => x.v > 0 && x.p && SKILL.has((x.p.position ?? "").toUpperCase()))
      .sort((x, y) => y.v - x.v || x.id.localeCompare(y.id))
      .slice(0, 2)
      .map((x) => playerName(x.p))
      .filter(Boolean);
    if (top.length === 0) return null;
    return { text: `Could sell you ${top.join(" or ")}`, players: top };
  }
  // Buyer.
  if (a.hurt) {
    const pos = (a.hurt.position ?? "").toUpperCase();
    return { text: `Needs ${SKILL.has(pos) ? `a ${pos}` : "help"} with ${a.hurt.name} out`, players: [a.hurt.name] };
  }
  return { text: "Now contending; likely to pay for help", players: [] };
}

/** Probabilities as printed in the brief: rounded to 5, clamped to "<2%" / ">98%". */
export function fmtPct(p: number): string {
  if (p < 0.02) return "<2%";
  if (p > 0.98) return ">98%";
  const r = Math.round((p * 100) / 5) * 5;
  return `${Math.min(95, Math.max(5, r))}%`;
}
