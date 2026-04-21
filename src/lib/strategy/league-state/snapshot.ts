/**
 * League state snapshot. the single object the ranker consumes.
 *
 * Built once per request from Sleeper data + the existing draft-state
 * + player cache. Includes everything fit_signals, opening_signals,
 * and likelihood_modifiers need to evaluate.
 *
 * Keep this server-only. the player metadata map behind it is large.
 */

import type { DraftState, TradedPick } from "@/lib/sleeper/draft-state";
import type {
  SleeperLeague,
  SleeperRoster,
  SleeperLeagueUser,
} from "@/lib/sleeper/schemas";
import { resolvePlayers } from "@/lib/players/cache";
import type {
  LeagueFormat,
  LeagueScoring,
  Position,
} from "../archetypes/schema";

const FANTASY_POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];

export type RosterSnapshot = {
  roster_id: number;
  owner_id: string | null;
  owner_name: string | null;
  is_me: boolean;
  position_counts: Record<Position, number>;
  player_ids: string[];
  avg_age: number | null;
  wins: number;
  losses: number;
  ties: number;
};

export type DraftPickRecord = {
  pick_no: number;
  round: number;
  roster_id: number;
  player_id: string;
  position: Position | null;
  // Age + years_exp at time of pick. Used downstream to detect
  // win-now vs. rebuild posture from THIS draft's picks (different
  // signal than roster.avg_age, which averages whole-team).
  age: number | null;
  years_exp: number | null;
};

export type LeagueSnapshot = {
  league_id: string;
  season: string;
  total_teams: number;
  format: LeagueFormat;
  scoring: LeagueScoring[];
  rosters: RosterSnapshot[];
  my_roster_id: number | null;
  // Draft state at moment of snapshot. May be no_draft.
  draft: {
    status: DraftState["status"];
    type: DraftState["type"];
    rounds: number;
    reversal_round: number | null;
    slot_to_roster_id: Record<number, number>;
    my_slot: number | null;
    next_pick_no: number | null;
    picks_made: DraftPickRecord[];
    // All league traded picks (current + future seasons). Used for
    // characterization signals like "punted this season for futures."
    traded_picks: TradedPick[];
  };
  // Pre-computed convenience aggregates for likelihood modifiers + openings
  agg: {
    teams_without_position_after_round: (
      position: Position,
      round: number,
    ) => number;
    avg_position_count: (position: Position) => number;
  };
};

function detectFormat(league: SleeperLeague): LeagueFormat {
  const positions = league.roster_positions ?? [];
  if (positions.includes("SUPER_FLEX")) return "superflex";
  const qbCount = positions.filter((p) => p === "QB").length;
  if (qbCount >= 2) return "2qb";
  return "1qb";
}

function detectScoring(league: SleeperLeague): LeagueScoring[] {
  const out: LeagueScoring[] = [];
  const s = league.scoring_settings ?? {};
  const rec = typeof s.rec === "number" ? s.rec : 0;
  if (rec >= 1) out.push("PPR");
  else if (rec >= 0.4) out.push("half-PPR");
  else out.push("standard");
  const teRec = typeof s.bonus_rec_te === "number" ? s.bonus_rec_te : 0;
  if (teRec >= 0.4) out.push("TE-premium");
  return out;
}

function emptyPositionCounts(): Record<Position, number> {
  return { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function normalizePosition(raw: string | null | undefined): Position | null {
  if (!raw) return null;
  const u = raw.toUpperCase();
  if (u === "DEF") return "DST";
  return FANTASY_POSITIONS.includes(u as Position) ? (u as Position) : null;
}

export async function buildLeagueSnapshot(args: {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  users: SleeperLeagueUser[];
  draftState: DraftState;
  mySleeperUserId: string | null;
}): Promise<LeagueSnapshot> {
  const { league, rosters, users, draftState, mySleeperUserId } = args;

  // Gather every player ID we need to resolve (rostered + drafted)
  const allPlayerIds = new Set<string>();
  for (const r of rosters) {
    for (const id of r.players ?? []) allPlayerIds.add(id);
  }
  for (const p of draftState.picks_so_far) {
    if (p.player_id) allPlayerIds.add(p.player_id);
  }

  const playerMap = await resolvePlayers([...allPlayerIds]);

  // Owner name lookup
  const userById = new Map<string, string>();
  for (const u of users) {
    const meta = (u.metadata ?? {}) as Record<string, unknown>;
    const name =
      (typeof meta.team_name === "string" && meta.team_name) ||
      u.display_name ||
      `User ${u.user_id}`;
    userById.set(u.user_id, name);
  }

  // Build a roster-id → drafted-player-ids map. During a live draft,
  // Sleeper's roster.players field doesn't reflect picks until the
  // draft completes, so we merge drafted picks in by roster_id to get
  // accurate mid-draft position counts.
  const draftedByRoster = new Map<number, string[]>();
  for (const p of draftState.picks_so_far) {
    if (!p.player_id || typeof p.roster_id !== "number") continue;
    const list = draftedByRoster.get(p.roster_id) ?? [];
    list.push(p.player_id);
    draftedByRoster.set(p.roster_id, list);
  }

  // Per-roster snapshots
  const rosterSnapshots: RosterSnapshot[] = rosters.map((r) => {
    const counts = emptyPositionCounts();
    const ages: number[] = [];
    const merged = new Set<string>([
      ...(r.players ?? []),
      ...(draftedByRoster.get(r.roster_id) ?? []),
    ]);
    for (const id of merged) {
      const p = playerMap.get(id);
      const pos = normalizePosition(p?.position ?? null);
      if (pos) counts[pos] += 1;
      if (p && typeof p.age === "number") ages.push(p.age);
    }
    const avg_age =
      ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : null;
    const settings = (r.settings ?? {}) as Record<string, unknown>;
    return {
      roster_id: r.roster_id,
      owner_id: r.owner_id,
      owner_name: r.owner_id ? userById.get(r.owner_id) ?? null : null,
      is_me: !!mySleeperUserId && r.owner_id === mySleeperUserId,
      position_counts: counts,
      player_ids: [...merged],
      avg_age,
      wins: asNumber(settings.wins),
      losses: asNumber(settings.losses),
      ties: asNumber(settings.ties),
    };
  });

  // Draft picks made, with positions resolved
  const totalTeams = league.total_rosters ?? rosters.length ?? 12;
  const picksMade: DraftPickRecord[] = draftState.picks_so_far
    .filter((p) => p.player_id)
    .map((p) => {
      const player = p.player_id ? playerMap.get(p.player_id) : undefined;
      const round =
        typeof p.round === "number"
          ? p.round
          : Math.ceil((p.pick_no ?? 0) / totalTeams);
      const pickNo = typeof p.pick_no === "number" ? p.pick_no : 0;
      const rosterId =
        typeof p.roster_id === "number" ? p.roster_id : 0;
      return {
        pick_no: pickNo,
        round,
        roster_id: rosterId,
        player_id: p.player_id ?? "",
        position: normalizePosition(player?.position ?? null),
        age: typeof player?.age === "number" ? player.age : null,
        years_exp:
          typeof player?.years_exp === "number" ? player.years_exp : null,
      };
    });

  const myRoster = rosterSnapshots.find((r) => r.is_me) ?? null;
  const myRosterId = myRoster?.roster_id ?? null;

  // Aggregates
  function teams_without_position_after_round(
    position: Position,
    round: number,
  ): number {
    // Rosters that have NOT drafted ≥1 player at `position` in rounds 1..round.
    const rostersWithPosition = new Set<number>();
    for (const p of picksMade) {
      if (p.round <= round && p.position === position) {
        rostersWithPosition.add(p.roster_id);
      }
    }
    return totalTeams - rostersWithPosition.size;
  }

  function avg_position_count(position: Position): number {
    if (rosterSnapshots.length === 0) return 0;
    const total = rosterSnapshots.reduce(
      (sum, r) => sum + r.position_counts[position],
      0,
    );
    return total / rosterSnapshots.length;
  }

  return {
    league_id: league.league_id,
    season: league.season,
    total_teams: totalTeams,
    format: detectFormat(league),
    scoring: detectScoring(league),
    rosters: rosterSnapshots,
    my_roster_id: myRosterId,
    draft: {
      status: draftState.status,
      type: draftState.type,
      rounds: draftState.rounds,
      reversal_round: draftState.reversal_round,
      slot_to_roster_id: draftState.slot_to_roster_id,
      my_slot: draftState.my_slot,
      next_pick_no: draftState.next_pick_no,
      picks_made: picksMade,
      traded_picks: draftState.traded_picks,
    },
    agg: {
      teams_without_position_after_round,
      avg_position_count,
    },
  };
}

export function getMyRoster(
  snapshot: LeagueSnapshot,
): RosterSnapshot | null {
  if (snapshot.my_roster_id == null) return null;
  return (
    snapshot.rosters.find((r) => r.roster_id === snapshot.my_roster_id) ?? null
  );
}
