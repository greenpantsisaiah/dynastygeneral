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
  posture: { category: PostureCategory; headline: string } | null;
  strongest: RoomRead | null;
  weakest: RoomRead | null;
  me: { wins: number; losses: number; ties: number; title_pct: number; playoff_pct: number } | null;
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
    posture = { category: p.category, headline: p.headline };
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
    me = { wins: mine.wins, losses: mine.losses, ties: mine.ties, title_pct: v.odds.title_pct, playoff_pct: v.odds.playoff_pct };
    const best = Object.values(v.league_odds)
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
 * "Patient build. War year projects 2028. Best room: QB (5th of 12). Thinnest: RB (10th)."
 * Redraft drops the multi-year posture: a redraft team is this season only.
 */
export function characterLine(c: LeagueCharacter): string | null {
  const parts: string[] = [];
  if (c.posture) parts.push(c.posture.headline);
  else if (c.kind === "redraft" && c.me) parts.push(`Redraft: this season is the whole story, ${fmtPct(c.me.playoff_pct)} to make the playoffs.`);
  if (c.strongest) parts.push(`Best room: ${c.strongest.position} (${ord(c.strongest.rank)} of ${c.strongest.total}).`);
  if (c.weakest) parts.push(`Thinnest: ${c.weakest.position} (${ord(c.weakest.rank)}).`);
  return parts.length ? parts.join(" ") : null;
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
