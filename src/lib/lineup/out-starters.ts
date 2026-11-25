/**
 * Out-starter detector: the factual half of lineup alerts (founder
 * direction 2026-11-25: "out alerts first, then graded advice").
 *
 * A problem is a starting slot that will score zero unless the user acts:
 * the starter is ruled out (Sleeper injury_status), his team is on bye,
 * or the slot is empty. Only problems whose game has NOT started and
 * kicks off inside the alert window are actionable; anything else is
 * either too late to fix or too early to be final.
 *
 * Bench options are ranked by this season's points per game in the
 * league's scoring. This is a stated, factual ranking, not a projection:
 * the engine has no weekly projection yet (graded advice is step 2, gated
 * on beating Sleeper's projection). Copy must say "season average".
 *
 * Pure: no IO. The cron hands in the roster, player meta, the NFL week's
 * games and season stats.
 */

export type GameState = "pre" | "in" | "post";

export interface TeamGame {
  /** Kickoff time, ISO string. */
  kickoff: string;
  state: GameState;
}

export interface PlayerMeta {
  player_id: string;
  name: string;
  position: string | null;
  fantasy_positions: string[];
  team: string | null;
  injury_status: string | null;
}

export type ProblemKind = "out" | "bye" | "empty";

export interface BenchOption {
  player_id: string;
  name: string;
  position: string;
  team: string | null;
  /** Season points per game in this league's scoring; null when no games played. */
  ppg: number | null;
}

export interface LineupProblem {
  kind: ProblemKind;
  /** Slot label as Sleeper names it (RB, FLEX, SUPER_FLEX ...). */
  slot: string;
  /** Position of the slot among the starter slots, 0-based. */
  slot_index: number;
  /** Null for an empty slot. */
  player: PlayerMeta | null;
  /** Kickoff that makes this urgent: the starter's game, or the earliest eligible bench game for empty / bye slots. */
  lock: string | null;
  options: BenchOption[];
}

/** Sleeper injury statuses that mean the player will not play. */
export const OUT_STATUSES = new Set(["out", "ir", "pup", "sus", "suspended", "cov", "na", "dnr"]);

/** Which player positions may fill each Sleeper starter slot. */
export const SLOT_ELIGIBILITY: Record<string, string[]> = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  K: ["K"],
  DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};

/** Sleeper's empty-slot sentinel in `starters`. */
export const EMPTY_SLOT = "0";

export function isOut(status: string | null | undefined): boolean {
  return status != null && OUT_STATUSES.has(status.trim().toLowerCase());
}

/** Starter slots in order, excluding bench / taxi / reserve. */
export function starterSlots(rosterPositions: readonly string[]): string[] {
  return rosterPositions.filter((p) => p !== "BN" && p !== "TAXI" && p !== "IR");
}

function eligible(slot: string, p: PlayerMeta): boolean {
  const allowed = SLOT_ELIGIBILITY[slot];
  if (!allowed) return false;
  const positions = p.fantasy_positions.length > 0 ? p.fantasy_positions : p.position ? [p.position] : [];
  return positions.some((pos) => allowed.includes(pos === "DST" ? "DEF" : pos));
}

/** Season points per game for a league's reception scoring. */
export function ppgFor(
  stats: { pts_ppr: number | null; pts_half_ppr: number | null; pts_std: number | null; games_played: number | null } | undefined,
  recPoints: number,
): number | null {
  if (!stats || !stats.games_played) return null;
  const total = recPoints >= 0.75 ? stats.pts_ppr : recPoints >= 0.25 ? stats.pts_half_ppr : stats.pts_std;
  if (total == null) return null;
  return Math.round((total / stats.games_played) * 10) / 10;
}

export function detectLineupProblems(args: {
  rosterPositions: readonly string[];
  starters: readonly string[];
  /** Every player on the roster (starters included). */
  rosterPlayers: readonly string[];
  /** Taxi and IR ids; never offered as bench options. */
  unavailable?: readonly string[];
  meta: ReadonlyMap<string, PlayerMeta>;
  /** This NFL week's games keyed by Sleeper team abbreviation. Teams missing here are on bye. */
  games: ReadonlyMap<string, TeamGame>;
  ppgById: ReadonlyMap<string, number | null>;
  now: Date;
  /** Only problems whose lock falls inside this many hours are returned. */
  windowHours: number;
  maxOptions?: number;
}): LineupProblem[] {
  const slots = starterSlots(args.rosterPositions);
  const horizon = args.now.getTime() + args.windowHours * 3_600_000;
  const starting = new Set(args.starters.filter((id) => id && id !== EMPTY_SLOT));
  const blocked = new Set(args.unavailable ?? []);

  const playable = (id: string): { p: PlayerMeta; game: TeamGame } | null => {
    const p = args.meta.get(id);
    if (!p || !p.team || isOut(p.injury_status)) return null;
    const game = args.games.get(p.team);
    if (!game || game.state !== "pre") return null;
    return { p, game };
  };

  const bench = args.rosterPlayers.filter((id) => !starting.has(id) && !blocked.has(id));
  const optionsFor = (slot: string) =>
    bench
      .map((id) => playable(id))
      .filter((x): x is { p: PlayerMeta; game: TeamGame } => x != null && eligible(slot, x.p))
      .map(({ p, game }) => ({
        option: {
          player_id: p.player_id,
          name: p.name,
          position: p.position ?? "",
          team: p.team,
          ppg: args.ppgById.get(p.player_id) ?? null,
        },
        kickoff: game.kickoff,
      }))
      .sort((a, b) => (b.option.ppg ?? -1) - (a.option.ppg ?? -1));

  const out: LineupProblem[] = [];
  slots.forEach((slot, i) => {
    const id = args.starters[i] ?? EMPTY_SLOT;
    const ranked = optionsFor(slot);
    const options = ranked.slice(0, args.maxOptions ?? 2).map((r) => r.option);
    const earliestBench = ranked.map((r) => r.kickoff).sort()[0] ?? null;

    let problem: LineupProblem | null = null;
    if (!id || id === EMPTY_SLOT) {
      problem = { kind: "empty", slot, slot_index: i, player: null, lock: earliestBench, options };
    } else {
      const p = args.meta.get(id);
      if (!p) return;
      const game = p.team ? args.games.get(p.team) : undefined;
      if (p.team && !game) {
        problem = { kind: "bye", slot, slot_index: i, player: p, lock: earliestBench, options };
      } else if (game && game.state === "pre" && isOut(p.injury_status)) {
        problem = { kind: "out", slot, slot_index: i, player: p, lock: game.kickoff, options };
      }
    }
    if (!problem || !problem.lock) return;
    const lockMs = Date.parse(problem.lock);
    if (lockMs <= args.now.getTime() || lockMs > horizon) return;
    out.push(problem);
  });
  return out;
}

/** Stable per-week key so a problem is emailed once. */
export function problemKey(season: string, week: number, leagueId: string, p: LineupProblem): string {
  const who = p.player?.player_id ?? `empty-${p.slot_index}`;
  return `lineup_alert_${season}_w${week}_${leagueId}_${p.kind}_${who}`;
}
