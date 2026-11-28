/**
 * "Who is this team" for one league, read for /home (Isaiah 2026-11-28:
 * the app's origin is characterizing my teams; home should characterize
 * each team, then call the first decisions). A thin adapter over existing
 * canonicals, never a re-derivation:
 *   - posture (contender / rebuilder / war year): `classifyRosterPosture`
 *     with `rosterValueRank`, the same inputs the league page's banner uses;
 *   - strongest and weakest room: `analyzeTeamIdentity` position fingerprint;
 *   - top rival and how far behind: the contend-or-sell verdict's one
 *     simulator run (`league_odds`) plus Sleeper records.
 * The wording lives here (`characterLine`, `rivalLine`) so every surface
 * that shows a team's character says it the same way.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type { RankedArchetype } from "@/lib/strategy/archetypes/schema";
import type { ContendOrSellVerdict } from "@/lib/strategy/verdict/compose";
import type { ChampionHistory, PostureCategory } from "@/lib/strategy/posture/types";
import { classifyRosterPosture, rosterValueRank } from "@/lib/strategy/posture/detect";
import { analyzeTeamIdentity } from "@/lib/strategy/team-identity/analyze";
import { fmtPct } from "@/lib/email/trade-desk/league-week";
import type { LeagueKind } from "@/lib/email/trade-desk/model";

export interface RoomRead {
  position: string;
  rank: number;
  total: number;
}

export interface LeagueCharacter {
  kind: LeagueKind;
  /** Dynasty and keeper only: the multi-year posture. */
  posture: { category: PostureCategory; headline: string; peak_year: number | null } | null;
  strongest: RoomRead | null;
  weakest: RoomRead | null;
  me: {
    wins: number;
    losses: number;
    ties: number;
    title_pct: number;
    playoff_pct: number;
    /** 1 = best chance to win the league among `teams`. */
    title_rank: number;
    teams: number;
  } | null;
  /** The other team with the best chance to win the league. */
  rival: { manager: string; wins: number; losses: number; ties: number; title_pct: number } | null;
}

export const POSTURE_LABEL: Record<PostureCategory, string> = {
  contender: "Contender",
  win_now: "Win-now",
  balanced: "Balanced",
  rebuilder: "Rebuilder",
  teardown: "Teardown",
  tank: "Tank",
};

export function buildLeagueCharacter(args: {
  kind: LeagueKind;
  snap: LeagueSnapshot;
  ranked: RankedArchetype[];
  valuesById: Record<string, number>;
  nameOf: (id: string) => { name: string; position: string | null } | null;
  verdict: ContendOrSellVerdict | null;
  championHistory?: ChampionHistory | null;
}): LeagueCharacter | null {
  const { snap } = args;
  const mine = snap.rosters.find((r) => r.is_me);
  if (!mine) return null;
  const valueOf = (id: string) => args.valuesById[id];

  let posture: LeagueCharacter["posture"] = null;
  if (args.kind === "dynasty" || args.kind === "keeper") {
    const p = classifyRosterPosture({
      snap,
      myRosterId: mine.roster_id,
      myCurrentValueRank: rosterValueRank({ snap, rosterId: mine.roster_id, valueOf }),
      totalTeams: snap.total_teams,
      championHistory: args.championHistory ?? null,
    });
    posture = { category: p.category, headline: p.headline, peak_year: p.contender_window?.peak_year ?? null };
  }

  const valueMap = new Map(Object.entries(args.valuesById).map(([id, value]) => [id, { value }]));
  const identity = analyzeTeamIdentity({ snap, rankedArchetypes: args.ranked, inflections: [], playerValueMap: valueMap, playerNameLookup: args.nameOf });
  const room = identity?.position_room;
  const strongest = room?.strongest ? { position: room.strongest.position, rank: room.strongest.rank, total: room.strongest.total } : null;
  const weakest =
    room?.weakest && room.weakest.position !== room.strongest?.position
      ? { position: room.weakest.position, rank: room.weakest.rank, total: room.weakest.total }
      : null;

  const v = args.verdict;
  let me: LeagueCharacter["me"] = null;
  let rival: LeagueCharacter["rival"] = null;
  if (v) {
    const all = Object.values(v.league_odds);
    const title_rank = 1 + all.filter((o) => o.roster_id !== mine.roster_id && o.title_pct > v.odds.title_pct).length;
    me = {
      wins: mine.wins,
      losses: mine.losses,
      ties: mine.ties,
      title_pct: v.odds.title_pct,
      playoff_pct: v.odds.playoff_pct,
      title_rank,
      teams: Math.max(all.length, snap.total_teams),
    };
    const best = all
      .filter((o) => o.roster_id !== mine.roster_id)
      .sort((a, b) => b.title_pct - a.title_pct)[0];
    const r = best ? snap.rosters.find((x) => x.roster_id === best.roster_id) : undefined;
    if (best && r) rival = { manager: r.owner_name ?? `Roster ${r.roster_id}`, wins: r.wins, losses: r.losses, ties: r.ties, title_pct: best.title_pct };
  }
  return { kind: args.kind, posture, strongest, weakest, me, rival };
}

const ord = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
};
const rec = (x: { wins: number; losses: number; ties: number }) => `${x.wins}-${x.losses}${x.ties ? `-${x.ties}` : ""}`;

/**
 * The chip: posture in dynasty and keeper, this season's playoff odds
 * otherwise. The odds, not the range label: "Favorite" read as "favorite to
 * win the league" beside a rival line that says otherwise (design-qa, #171).
 */
export function characterChip(c: LeagueCharacter): string | null {
  if (c.posture) return POSTURE_LABEL[c.posture.category];
  if (c.me) return `Playoffs ${fmtPct(c.me.playoff_pct)}`;
  return null;
}

/**
 * Who this team is, in plain fantasy terms, from numbers only:
 * "Rebuilding, built to peak in 2028. Deep at QB (2nd of 12), thin at RB (10th of 12)."
 * "Best title chance in the league. The league's worst QBs."
 * Isaiah 2026-11-28 on the welcome email: lines like "This season is the
 * whole story" and "Best room" read as AI and carry no fact. Every clause
 * here is a rank or a year; a position that is neither top nor bottom third
 * is left out rather than padded.
 */
export function characterNote(c: LeagueCharacter): string | null {
  // Season first (every format has one), then the dynasty posture when it
  // adds a direction. "Balanced" is left out: next to a 9-2 record it reads
  // as a contradiction, and the title-chance rank already places the team.
  const season = c.me ? titlePhrase(c.me.title_rank, c.me.teams) : null;
  const posture = c.posture && c.posture.category !== "balanced" ? POSTURE_PLAIN[c.posture.category](c.posture.peak_year) : null;
  const label = season && posture ? `${season}; ${posture.charAt(0).toLowerCase()}${posture.slice(1)}` : (season ?? posture);
  const rooms = [strengthPhrase(c.strongest), weaknessPhrase(c.weakest)].filter((x): x is string => !!x);
  const parts = [label ? `${label}.` : null, rooms.length ? `${cap(rooms.join(", "))}.` : null].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

const POSTURE_PLAIN: Record<PostureCategory, (peak: number | null) => string> = {
  contender: () => "Contender now",
  win_now: (y) => (y ? `Close to contending, built to peak in ${y}` : "Close to contending"),
  balanced: () => "Middle of the pack",
  rebuilder: (y) => (y ? `Rebuilding, built to peak in ${y}` : "Rebuilding"),
  teardown: (y) => (y ? `Tearing down, built to peak in ${y}` : "Tearing down"),
  tank: () => "Bottom of the league",
};
function titlePhrase(rank: number, teams: number): string {
  if (rank === 1) return "Best title chance in the league";
  if (rank <= teams / 2) return `${ord(rank)}-best title chance of ${teams}`;
  return `Title long shot (${ord(rank)} of ${teams})`;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const third = (total: number) => Math.max(1, Math.round(total / 3));
function strengthPhrase(r: RoomRead | null): string | null {
  if (!r) return null;
  if (r.rank === 1) return `the league's best ${r.position}s`;
  return r.rank <= third(r.total) ? `deep at ${r.position} (${ord(r.rank)} of ${r.total})` : null;
}
function weaknessPhrase(r: RoomRead | null): string | null {
  if (!r) return null;
  if (r.rank === r.total) return `the league's worst ${r.position}s`;
  return r.rank > r.total - third(r.total) ? `thin at ${r.position} (${ord(r.rank)} of ${r.total})` : null;
}

/** Kept for callers of the old name: the same plain characterization. */
export function characterLine(c: LeagueCharacter): string | null {
  return characterNote(c);
}

/**
 * "Top rival: Willfredson, 9-2, 35% to win the league. You are 2 games back at 7-4, <2% to win it."
 * When you are the favorite: "You are the favorite to win the league at 35%. Next: X, 8-3, 25%."
 */
export function rivalLine(c: LeagueCharacter): string | null {
  if (!c.me || !c.rival) return null;
  const me = c.me;
  const r = c.rival;
  const myGames = me.wins + me.ties / 2;
  const theirGames = r.wins + r.ties / 2;
  const gap = theirGames - myGames;
  if (me.title_pct >= r.title_pct) {
    return `You are the favorite to win the league at ${fmtPct(me.title_pct)}. Next: ${r.manager}, ${rec(r)}, ${fmtPct(r.title_pct)}.`;
  }
  const games = gap === 0 ? `level on record at ${rec(me)}` : gap > 0 ? `${gap === 1 ? "1 game" : `${gap} games`} back at ${rec(me)}` : `${-gap === 1 ? "1 game" : `${-gap} games`} ahead on record at ${rec(me)}`;
  return `Top rival: ${r.manager}, ${rec(r)}, ${fmtPct(r.title_pct)} to win the league. You are ${games}, ${fmtPct(me.title_pct)} to win it.`;
}

/**
 * One team, shaped for the /home tile: numbers first, words second
 * (Isaiah 2026-11-28 on the prose tiles: "pure text, not data or fun").
 * Every number is read off `LeagueCharacter`; nothing is re-derived here.
 */
export interface TeamTile {
  leagueId: string;
  leagueName: string;
  /** Posture label (dynasty, keeper) or the league kind (redraft, best ball). */
  chip: string | null;
  /** Plain characterization from `characterNote`, or null when there is no fact to state. */
  note: string | null;
  /** Probabilities 0..1 with display text from `fmtPct`. */
  playoff: { pct: number; label: string } | null;
  title: { pct: number; label: string } | null;
  best: RoomRead | null;
  thinnest: RoomRead | null;
  rival: {
    manager: string;
    record: string;
    myRecord: string;
    titleLabel: string;
    myTitleLabel: string;
    titlePct: number;
    myTitlePct: number;
    /** Games behind the rival on record (negative = ahead); ties count half. */
    gamesBack: number;
    /** You have the better chance to win the league. */
    favorite: boolean;
  } | null;
  /** Sort key: your chance to win the league, best first. */
  order: number;
}

const KIND_CHIP: Record<LeagueKind, string> = { dynasty: "Dynasty", keeper: "Keeper", redraft: "Redraft", best_ball: "Best ball" };

export function teamTile(leagueId: string, leagueName: string, c: LeagueCharacter): TeamTile | null {
  const me = c.me;
  if (!me && !c.strongest && !c.posture) return null;
  const pct = (p: number) => ({ pct: p, label: fmtPct(p) });
  const note = characterNote(c);
  const r = c.rival;
  return {
    leagueId,
    leagueName,
    chip: c.posture ? POSTURE_LABEL[c.posture.category] : KIND_CHIP[c.kind],
    note,
    playoff: me ? pct(me.playoff_pct) : null,
    title: me ? pct(me.title_pct) : null,
    best: c.strongest,
    thinnest: c.weakest,
    rival:
      me && r
        ? {
            manager: r.manager,
            record: rec(r),
            myRecord: rec(me),
            titleLabel: fmtPct(r.title_pct),
            myTitleLabel: fmtPct(me.title_pct),
            titlePct: r.title_pct,
            myTitlePct: me.title_pct,
            gamesBack: r.wins + r.ties / 2 - (me.wins + me.ties / 2),
            favorite: me.title_pct >= r.title_pct,
          }
        : null,
    order: me?.title_pct ?? -1,
  };
}
