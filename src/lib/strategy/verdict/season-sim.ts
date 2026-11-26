/**
 * Season simulator: P(playoffs) and P(title) for every roster in a league,
 * from this season's weekly scores. Canonical for playoff_odds@v1 and
 * title_odds@v1 (src/lib/predictions/registry.ts). Pure, seeded, no IO.
 *
 * Model (stated so the stats steward can attack it):
 * - Each roster's weekly score is Normal(mean_i, sd). mean_i is the
 *   roster's average this season shrunk toward the league average by
 *   SHRINK_GAMES pseudo-games (early-season averages are noisy). sd is the
 *   pooled within-roster standard deviation of weekly scores, so it
 *   measures week-to-week luck, not the spread between teams.
 * - Remaining regular-season weeks are played on the real Sleeper
 *   schedule. Seeding: wins (ties count half), then points for.
 * - Leagues with a weekly game against the median (Sleeper
 *   league_average_match) play it in every simulated week too: the top
 *   half of that week's draws gets a second win, so those leagues have
 *   two decisions per week, the same as Sleeper's standings.
 * - Playoffs: fixed single-elimination bracket of `playoffTeams`, byes to
 *   the top seeds when the bracket is not a power of two (Sleeper's
 *   default 6-team shape gives seeds 1 and 2 a bye). One week per round.
 * - A "move" (sell a starter) is a shift to that roster's weekly mean.
 *   Baseline and move runs share a seed (common random numbers), so the
 *   delta is not swamped by simulation noise.
 *
 * Known gaps, logged not hidden: no injuries or bye weeks, no
 * two-week playoff rounds, no lineup mistakes, a constant sd for every
 * roster. The prediction ledger is how we learn whether any of that
 * matters (Brier vs the standings baseline in the registry).
 */

/** Pseudo-games of league-average scoring blended into each roster mean.
 * INTERNAL_HEURISTIC (stats steward to calibrate against the ledger). */
export const SHRINK_GAMES = 3;
/** Default number of simulated seasons. Monte Carlo error on a 50% event
 * is about 0.7 points at 5,000 runs. */
export const DEFAULT_SIMS = 5000;
/** Minimum scored roster-weeks beyond one per roster before we trust the
 * pooled sd. Below this the simulator declines rather than guesses. */
const MIN_RESIDUAL_DOF = 8;

export interface SimTeam {
  roster_id: number;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
}

export interface SimInput {
  teams: SimTeam[];
  /** Weekly points already scored this season, by roster_id. */
  scored: Record<number, number[]>;
  /** Remaining regular-season weeks, each a list of [roster_id, roster_id] games. */
  remaining: Array<Array<[number, number]>>;
  playoffTeams: number;
  /**
   * The league also plays the median each week (Sleeper
   * league_average_match). Each simulated week then awards one extra win to
   * every roster in the top half of that week's scores and a loss to the
   * bottom half, on top of the head-to-head game. `teams[].wins` must
   * already include the median games played (buildSimInputFromSleeper does).
   */
  medianGame?: boolean;
}

export interface SimOptions {
  sims?: number;
  seed?: number;
  /** Points added to a roster's weekly mean (negative = weaker), by roster_id. */
  meanShift?: Record<number, number>;
}

export interface TeamOdds {
  roster_id: number;
  playoff_pct: number;
  title_pct: number;
  mean_wins: number;
  weekly_mean: number;
}

export type SimResult =
  | {
      ok: true;
      odds: Record<number, TeamOdds>;
      sims: number;
      seed: number;
      model: {
        league_mean: number;
        weekly_sd: number;
        shrink_games: number;
        weeks_remaining: number;
        playoff_teams: number;
        median_game: boolean;
      };
    }
  | { ok: false; reason: string };

// mulberry32: small, fast, seedable. Plenty for Monte Carlo of this size.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalSampler(u: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare != null) {
      const s = spare;
      spare = null;
      return s;
    }
    let a = 0;
    while (a === 0) a = u();
    const b = u();
    const r = Math.sqrt(-2 * Math.log(a));
    spare = r * Math.sin(2 * Math.PI * b);
    return r * Math.cos(2 * Math.PI * b);
  };
}

/** Standard bracket order for a power-of-two field: 1,8,4,5,2,7,3,6 for 8. */
export function bracketOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

export function scoreModel(input: SimInput): {
  league_mean: number;
  weekly_sd: number;
  means: Record<number, number>;
  dof: number;
} {
  let total = 0;
  let count = 0;
  for (const t of input.teams) {
    for (const p of input.scored[t.roster_id] ?? []) {
      total += p;
      count++;
    }
  }
  const leagueMean = count > 0 ? total / count : 0;
  let ss = 0;
  let dof = 0;
  const means: Record<number, number> = {};
  for (const t of input.teams) {
    const pts = input.scored[t.roster_id] ?? [];
    const raw = pts.length > 0 ? pts.reduce((s, x) => s + x, 0) / pts.length : leagueMean;
    for (const p of pts) ss += (p - raw) * (p - raw);
    if (pts.length > 1) dof += pts.length - 1;
    means[t.roster_id] =
      (pts.length * raw + SHRINK_GAMES * leagueMean) / (pts.length + SHRINK_GAMES);
  }
  const sd = dof > 0 ? Math.sqrt(ss / dof) : 0;
  return { league_mean: leagueMean, weekly_sd: sd, means, dof };
}

export function simulateSeason(input: SimInput, opts: SimOptions = {}): SimResult {
  const sims = opts.sims ?? DEFAULT_SIMS;
  const seed = opts.seed ?? 20261124;
  const teams = input.teams;
  if (teams.length < 2) return { ok: false, reason: "fewer than two rosters" };
  const playoffTeams = Math.min(Math.max(1, Math.floor(input.playoffTeams)), teams.length);
  const model = scoreModel(input);
  if (model.dof < MIN_RESIDUAL_DOF) {
    return { ok: false, reason: "not enough scored weeks this season to estimate weekly variance" };
  }
  const ids = teams.map((t) => t.roster_id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const mean = ids.map((id) => model.means[id] + (opts.meanShift?.[id] ?? 0));
  const sd = model.weekly_sd;
  const u = rng(seed);
  const z = normalSampler(u);
  const draw = (i: number) => mean[i] + sd * z();

  const playoffHits = new Array(ids.length).fill(0);
  const titleHits = new Array(ids.length).fill(0);
  const winSum = new Array(ids.length).fill(0);
  const size = 2 ** Math.ceil(Math.log2(Math.max(playoffTeams, 1)));
  const order = bracketOrder(size);

  const games = input.remaining.map((wk) =>
    wk
      .map(([a, b]) => [idx.get(a), idx.get(b)] as const)
      .filter((g): g is readonly [number, number] => g[0] != null && g[1] != null),
  );

  const wins = new Float64Array(ids.length);
  const pf = new Float64Array(ids.length);
  const seedOrder = ids.map((_, i) => i);
  const median = input.medianGame === true;
  const weekPts = new Float64Array(ids.length * 2);
  const weekIdx = new Int32Array(ids.length * 2);

  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < ids.length; i++) {
      wins[i] = teams[i].wins + teams[i].ties * 0.5;
      pf[i] = teams[i].points_for;
    }
    for (const wk of games) {
      let n = 0;
      for (const [a, b] of wk) {
        const pa = draw(a);
        const pb = draw(b);
        pf[a] += pa;
        pf[b] += pb;
        if (pa > pb) wins[a] += 1;
        else if (pb > pa) wins[b] += 1;
        else {
          wins[a] += 0.5;
          wins[b] += 0.5;
        }
        if (median) {
          weekIdx[n] = a;
          weekPts[n++] = pa;
          weekIdx[n] = b;
          weekPts[n++] = pb;
        }
      }
      if (median && n >= 2) {
        // Top half of this week's scores beats the median. Ties at the
        // median are measure-zero with continuous draws, so ignore them.
        const order = Array.from({ length: n }, (_, k) => k).sort((x, y) => weekPts[y] - weekPts[x]);
        const half = Math.floor(n / 2);
        for (let k = 0; k < half; k++) wins[weekIdx[order[k]]] += 1;
        if (n % 2 === 1) wins[weekIdx[order[half]]] += 0.5;
      }
    }
    seedOrder.sort((x, y) => wins[y] - wins[x] || pf[y] - pf[x] || x - y);
    for (let i = 0; i < ids.length; i++) winSum[i] += wins[i] - (teams[i].wins + teams[i].ties * 0.5);
    for (let k = 0; k < playoffTeams; k++) playoffHits[seedOrder[k]]++;

    // Bracket: slots hold team index or -1 for a bye.
    let field = order.map((seedNo) => (seedNo <= playoffTeams ? seedOrder[seedNo - 1] : -1));
    while (field.length > 1) {
      const next: number[] = [];
      for (let k = 0; k < field.length; k += 2) {
        const a = field[k];
        const b = field[k + 1];
        if (a < 0) next.push(b);
        else if (b < 0) next.push(a);
        else next.push(draw(a) >= draw(b) ? a : b);
      }
      field = next;
    }
    if (field[0] >= 0) titleHits[field[0]]++;
  }

  const odds: Record<number, TeamOdds> = {};
  ids.forEach((id, i) => {
    odds[id] = {
      roster_id: id,
      playoff_pct: playoffHits[i] / sims,
      title_pct: titleHits[i] / sims,
      mean_wins: teams[i].wins + teams[i].ties * 0.5 + winSum[i] / sims,
      weekly_mean: mean[i],
    };
  });
  return {
    ok: true,
    odds,
    sims,
    seed,
    model: {
      league_mean: model.league_mean,
      weekly_sd: sd,
      shrink_games: SHRINK_GAMES,
      weeks_remaining: games.length,
      playoff_teams: playoffTeams,
      median_game: median,
    },
  };
}
