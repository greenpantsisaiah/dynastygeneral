/**
 * Contend-or-sell verdict: one object the hub card, Coach and the weekly
 * email all read (one computation, every surface; object-parity rule).
 *
 * The rule it lays out (the voices weigh it differently):
 *   sell when  title_worth x (title odds lost)  <  value kept by selling now
 * where value kept = offseason decay avoided on the players sold, and the
 * contender premium (contender_premium@v1) is 0 and labelled unknown.
 *
 * Every number here maps to a registered prediction type:
 *   playoff_odds@v1, title_odds@v1, title_odds_delta@v1,
 *   offseason_value_decay@v1, contender_premium@v1 (0, unknown).
 */

import { decayYearsFor, offseasonValueDecay, verdictHorizon, type DecayRead, type LeagueType, type VerdictHorizon } from "./decay";
import { rankBuyers, type BuyerInput, type BuyerRead } from "./buyers";
import { simulateSeason, type SimInput, type TeamOdds } from "./season-sim";
import type { TradeWindow } from "./trade-window";
import { convene, DEFAULT_TITLE_WORTH, type Panel, type VoiceFacts } from "./voices";

export interface VerdictPlayer {
  player_id: string;
  name: string;
  position: string;
  age: number | null;
  /** Scoring value (the VALUE_MODE seam), 0 to 100. */
  value: number;
  /** Points per started week this season, from startedPoints(). */
  ppg_started: number | null;
  weeks_started: number;
  /** Weekly points of the best same-position replacement, from replacementPpg(). */
  replacement_ppg: number;
}

export interface SellCandidate {
  player: VerdictPlayer;
  decay: DecayRead;
  /** Weekly points the roster loses if he is sold (started ppg minus replacement). */
  weekly_points_lost: number;
  title_pct_if_sold: number;
  title_delta: number;
  playoff_delta: number;
  buyers: BuyerRead[];
  /**
   * The three voices on selling THIS player alone (his decay, his odds
   * change), phrased with his name and the league record. The email trade
   * card names one player, so it reads this panel; the hub reads the
   * package panel below.
   */
  panel: Panel;
}

export interface ContendOrSellVerdict {
  roster_id: number;
  odds: TeamOdds;
  league: { teams: number; fair_title_share: number; rank_by_title_odds: number };
  candidates: SellCandidate[];
  package: {
    player_ids: string[];
    title_pct_if_sold: number;
    title_delta: number;
    value_kept_by_selling: number;
  };
  roster_retained_share: number;
  /**
   * Whether the user can still trade (tradeWindow canonical). When closed
   * (best ball, past the deadline) there are no sell candidates, and every
   * surface shows the odds plus `trade_window.label` instead of the voices.
   */
  trade_window: TradeWindow;
  /**
   * "this_season" in redraft: no offseason decay, no sell candidates (a
   * sale banks nothing that carries over), and the voices reason only on
   * this season's odds. "next_season" in keeper and dynasty leagues.
   */
  horizon: VerdictHorizon;
  panel: Panel;
  title_worth: number;
  contender_premium: { value: 0; status: "unknown" };
  provenance: {
    sims: number;
    seed: number;
    league_mean: number;
    weekly_sd: number;
    shrink_games: number;
    weeks_remaining: number;
    playoff_teams: number;
    prediction_types: string[];
  };
}

export type VerdictResult =
  | { ok: true; verdict: ContendOrSellVerdict }
  | { ok: false; reason: string };

export function buildContendOrSellVerdict(args: {
  sim: SimInput;
  rosterId: number;
  players: VerdictPlayer[];
  buyers: BuyerInput[] | ((position: string) => BuyerInput[]);
  titleWorth?: number;
  /** Defaults to open; loadContendOrSellVerdict passes the league's real window. */
  tradeWindow?: TradeWindow;
  packageSize?: number;
  /** snapshot.league_type. Defaults to dynasty (multi-year) when absent. */
  leagueType?: LeagueType | null;
  sims?: number;
  seed?: number;
}): VerdictResult {
  const titleWorth = args.titleWorth ?? DEFAULT_TITLE_WORTH;
  const window: TradeWindow = args.tradeWindow ?? { open: true, deadline_week: null };
  const horizon = verdictHorizon(args.leagueType);
  const seasonOnly = horizon === "this_season";
  const base = simulateSeason(args.sim, { sims: args.sims, seed: args.seed });
  if (!base.ok) return base;
  const mine = base.odds[args.rosterId];
  if (!mine) return { ok: false, reason: "roster not in this league's schedule" };

  const teams = args.sim.teams.length;
  const me = args.sim.teams.find((t) => t.roster_id === args.rosterId);
  const record = me ? `${me.wins}-${me.losses}${me.ties ? `-${me.ties}` : ""}` : "";
  const ranked = Object.values(base.odds).sort((a, b) => b.title_pct - a.title_pct);
  const rank = ranked.findIndex((o) => o.roster_id === args.rosterId) + 1;

  let totalValue = 0;
  let keptValue = 0;
  const decays = new Map<string, DecayRead>();
  for (const p of args.players) {
    const d = offseasonValueDecay({ value: p.value, position: p.position, age: p.age, years: decayYearsFor(horizon) });
    decays.set(p.player_id, d);
    totalValue += d.value_now;
    keptValue += d.value_later;
  }
  const retained = totalValue > 0 ? keptValue / totalValue : 1;

  const shiftFor = (p: VerdictPlayer) =>
    p.ppg_started == null ? 0 : Math.max(0, p.ppg_started - p.replacement_ppg);

  const pool = args.players
    .filter((p) => (decays.get(p.player_id)?.value_lost ?? 0) > 0)
    .sort((a, b) => decays.get(b.player_id)!.value_lost - decays.get(a.player_id)!.value_lost)
    // No sell package when the user cannot trade, or in redraft (decay is
    // 0 there, so this filter is already empty; the guard says it out loud).
    .slice(0, window.open && !seasonOnly ? (args.packageSize ?? 2) : 0);

  const candidates: SellCandidate[] = pool.map((p) => {
    const lost = shiftFor(p);
    const run = simulateSeason(args.sim, {
      sims: base.sims,
      seed: base.seed,
      meanShift: { [args.rosterId]: -lost },
    });
    const after = run.ok ? run.odds[args.rosterId] : mine;
    const buyerRows = typeof args.buyers === "function" ? args.buyers(p.position) : args.buyers;
    const withOdds = buyerRows.map((b) => ({
      ...b,
      title_pct: base.odds[b.roster_id]?.title_pct ?? b.title_pct,
      playoff_pct: base.odds[b.roster_id]?.playoff_pct ?? b.playoff_pct,
    }));
    return {
      player: p,
      decay: decays.get(p.player_id)!,
      weekly_points_lost: lost,
      title_pct_if_sold: after.title_pct,
      title_delta: after.title_pct - mine.title_pct,
      playoff_delta: after.playoff_pct - mine.playoff_pct,
      buyers: rankBuyers({ position: p.position, sellerRosterId: args.rosterId, rosters: withOdds }),
      panel: convene(
        {
          teams,
          title_pct: mine.title_pct,
          playoff_pct: mine.playoff_pct,
          title_delta: after.title_pct - mine.title_pct,
          value_kept_by_selling: decays.get(p.player_id)!.value_lost,
          roster_retained_share: retained,
          horizon,
        },
        titleWorth,
        record ? { player: p.name, record } : undefined,
      ),
    };
  });

  const totalShift = pool.reduce((s, p) => s + shiftFor(p), 0);
  const pkgRun =
    pool.length > 0
      ? simulateSeason(args.sim, { sims: base.sims, seed: base.seed, meanShift: { [args.rosterId]: -totalShift } })
      : base;
  const pkgOdds = pkgRun.ok ? pkgRun.odds[args.rosterId] : mine;
  const valueKept = candidates.reduce((s, c) => s + c.decay.value_lost, 0);

  const facts: VoiceFacts = {
    teams,
    title_pct: mine.title_pct,
    playoff_pct: mine.playoff_pct,
    title_delta: pkgOdds.title_pct - mine.title_pct,
    value_kept_by_selling: valueKept,
    roster_retained_share: retained,
    horizon,
    record: record || undefined,
  };

  return {
    ok: true,
    verdict: {
      roster_id: args.rosterId,
      odds: mine,
      league: { teams, fair_title_share: 1 / teams, rank_by_title_odds: rank },
      candidates,
      package: {
        player_ids: pool.map((p) => p.player_id),
        title_pct_if_sold: pkgOdds.title_pct,
        title_delta: facts.title_delta,
        value_kept_by_selling: valueKept,
      },
      roster_retained_share: retained,
      trade_window: window,
      horizon,
      panel: convene(facts, titleWorth),
      title_worth: titleWorth,
      contender_premium: { value: 0, status: "unknown" },
      provenance: {
        sims: base.sims,
        seed: base.seed,
        ...base.model,
        prediction_types: seasonOnly
          ? ["playoff_odds@v1", "title_odds@v1"]
          : [
              "playoff_odds@v1",
              "title_odds@v1",
              "title_odds_delta@v1",
              "offseason_value_decay@v1",
              "contender_premium@v1",
            ],
      },
    },
  };
}
