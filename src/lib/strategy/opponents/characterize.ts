/**
 * Opponent team characterization. For each opposing roster, place them
 * on a 5-bucket gradient based on what their team actually IS right
 * now. Gradient (not binary) because real teams have shades of lean,
 * not clean labels.
 *
 * Buckets (high to low win-now):
 *   "win_now"          old roster + spending against the future
 *   "lean_win_now"     mid-old, slightly-aged
 *   "balanced"         mid-age, no clear lean
 *   "lean_win_future"  mid-young, slightly-young
 *   "win_future"       young roster, accumulating youth
 *
 * Plus one special: "punted_season" when they've traded ≥2 of their
 * current-season picks for FUTURE picks. Strongest possible rebuild
 * signal that doesn't need age data; the trades alone tell you.
 *
 * Confidence grows with picks made + signal strength + trade activity.
 */

import type {
  DraftPickRecord,
  LeagueSnapshot,
  RosterSnapshot,
} from "../league-state/snapshot";
import type { Position } from "../archetypes/schema";
import type { TradedPick } from "@/lib/sleeper/draft-state";
import {
  getProjections,
  pickAdpFromVariants,
  type AdpFormatKey,
} from "@/lib/players/projections";

export type TeamLean =
  | "punted_season"
  | "win_now"
  | "lean_win_now"
  | "balanced"
  | "lean_win_future"
  | "win_future";

export type OpponentCharacterization = {
  roster_id: number;
  owner_name: string;
  picks_made: number;
  lean: TeamLean;
  // 0..1 confidence in the characterization. Grows with picks made +
  // signal strength + trade activity.
  confidence: number;
  reasons: string[];
  trade_implication?: string;
  // Expected-value rating, normalized 0..1 within the league. Computed
  // from sum of (cap - ADP) across rostered players. Higher = more
  // valuable players on the roster. Null if we couldn't compute (no
  // ADP data, no projections fetched, etc.).
  ev?: number | null;
  // Raw EV total for tooltips. Same scale across the league so
  // teams are comparable.
  ev_raw?: number | null;
};

const SCORING_POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// Detect strong trade-driven signals that override age-based bucketing.
// A roster that sent 2+ current-season picks for future picks has made
// their position clear: punting this season for futures = full rebuild.
type TradeSignal = {
  punted: boolean;
  mortgaged: boolean;
  current_sent_for_future: number;
  future_sent_for_current: number;
  reasons: string[];
};

function analyzeTrades(
  rosterId: number,
  trades: TradedPick[],
  currentSeason: string,
): TradeSignal {
  const sent = trades.filter((t) => t.original_owner === rosterId);
  const got = trades.filter((t) => t.current_owner === rosterId);
  // Counts. "Current sent for future" requires both current-sent picks
  // AND future-received picks to actually be a punt move (vs. a swap
  // within the current season).
  const sentCurrent = sent.filter((t) => t.season === currentSeason).length;
  const sentFuture = sent.filter((t) => t.season > currentSeason).length;
  const gotCurrent = got.filter((t) => t.season === currentSeason).length;
  const gotFuture = got.filter((t) => t.season > currentSeason).length;

  // Punted: sent more current than got back AND received future picks.
  // Threshold: net loss of 2+ current picks while gaining future picks.
  const currentNetSent = sentCurrent - gotCurrent;
  const punted = currentNetSent >= 2 && gotFuture >= 1;
  // Mortgaged: opposite. Sent future picks for current picks.
  const futureNetSent = sentFuture - gotFuture;
  const mortgaged = futureNetSent >= 2 && gotCurrent >= 1;

  const reasons: string[] = [];
  if (punted) {
    reasons.push(
      `Traded ${currentNetSent} current-season picks for ${gotFuture} future picks. punting this year`,
    );
  }
  if (mortgaged) {
    reasons.push(
      `Traded ${futureNetSent} future picks for ${gotCurrent} current picks. all-in this year`,
    );
  }
  return {
    punted,
    mortgaged,
    current_sent_for_future: punted ? currentNetSent : 0,
    future_sent_for_current: mortgaged ? futureNetSent : 0,
    reasons,
  };
}

function bucketFromAge(med: number): TeamLean {
  // Continuous gradient. Thresholds tuned for fantasy-skill ages where
  // 25-26 is the typical median.
  if (med <= 23.5) return "win_future";
  if (med <= 25.0) return "lean_win_future";
  if (med < 26.5) return "balanced";
  if (med < 28.0) return "lean_win_now";
  return "win_now";
}

function tradeImplicationFor(lean: TeamLean): string {
  switch (lean) {
    case "punted_season":
      return "Already punted this year. Will deal anyone for picks/youth. Buy their veterans cheap; don't expect picks back.";
    case "win_now":
      return "All-in this year. Will overpay (futures + youth) for proven production. Ship them aging vets they need; demand picks back.";
    case "lean_win_now":
      return "Mostly win-now. Will trade modest futures for clear upgrades, less for depth. Lead with starter-quality offers.";
    case "balanced":
      return "No strong lean either way. Deals possible in both directions; lead with what you actually want and see how they respond.";
    case "lean_win_future":
      return "Mostly future. Some openness to win-now help if it's a young asset. Don't expect them to ship rookies for vets.";
    case "win_future":
      return "Wants young/rookie assets. They'll trade veterans for picks or upside. Don't expect them to ship a future 1st for win-now help.";
  }
}

export function characterizeOpponent(
  roster: RosterSnapshot,
  picks: DraftPickRecord[],
  trades: TradedPick[],
  currentSeason: string,
): OpponentCharacterization {
  const myPicks = picks.filter((p) => p.roster_id === roster.roster_id);
  const ages = myPicks
    .map((p) => p.age)
    .filter((a): a is number => typeof a === "number");
  const yearsExp = myPicks
    .map((p) => p.years_exp)
    .filter((y): y is number => typeof y === "number");

  const tradeSignal = analyzeTrades(roster.roster_id, trades, currentSeason);
  const picksCount = myPicks.length;

  // Hard override: if they've punted via trades, that's the call no
  // matter how few picks they've made. The trades ARE the signal.
  if (tradeSignal.punted) {
    return {
      roster_id: roster.roster_id,
      owner_name: roster.owner_name ?? `Roster ${roster.roster_id}`,
      picks_made: picksCount,
      lean: "punted_season",
      confidence: 0.95,
      reasons: tradeSignal.reasons,
      trade_implication: tradeImplicationFor("punted_season"),
    };
  }
  if (tradeSignal.mortgaged) {
    // Mortgaged future = aggressive win-now even if picks haven't shown
    // age skew yet. Count it as win-now with high confidence.
    const reasons = [...tradeSignal.reasons];
    if (ages.length >= 3) {
      reasons.push(
        `Median pick age ${median(ages).toFixed(1)} across ${picksCount} picks`,
      );
    }
    return {
      roster_id: roster.roster_id,
      owner_name: roster.owner_name ?? `Roster ${roster.roster_id}`,
      picks_made: picksCount,
      lean: "win_now",
      confidence: 0.9,
      reasons,
      trade_implication: tradeImplicationFor("win_now"),
    };
  }

  // No strong trade signal. Use age-based gradient.
  // Sub-2-pick rosters with no trade activity: still call it, but
  // explicitly flag low confidence. Don't say "too early to call"
  // because that hides the small signal we DO have.
  if (ages.length < 2) {
    return {
      roster_id: roster.roster_id,
      owner_name: roster.owner_name ?? `Roster ${roster.roster_id}`,
      picks_made: picksCount,
      lean: "balanced",
      confidence: 0.15,
      reasons: [
        picksCount === 0
          ? `No picks yet`
          : `${picksCount} pick${picksCount === 1 ? "" : "s"} so far. very low signal`,
      ],
      trade_implication: tradeImplicationFor("balanced"),
    };
  }

  const medAge = median(ages);
  const youngCount = ages.filter((a) => a <= 23).length;
  const veteranCount = ages.filter((a) => a >= 28).length;
  const rookieCount = yearsExp.filter((y) => y === 0).length;
  const lean = bucketFromAge(medAge);

  const reasons: string[] = [];
  reasons.push(
    `Median pick age ${medAge.toFixed(1)} across ${picksCount} picks`,
  );
  if (lean === "win_future" || lean === "lean_win_future") {
    if (youngCount >= 2) {
      reasons.push(
        `${youngCount} of ${picksCount} picks at age ≤23${rookieCount > 0 ? `, ${rookieCount} rookies` : ""}`,
      );
    }
  } else if (lean === "win_now" || lean === "lean_win_now") {
    if (veteranCount >= 2) {
      reasons.push(
        `${veteranCount} of ${picksCount} picks at age ≥28`,
      );
    }
  } else {
    reasons.push("Mid-age roster with no strong lean either direction");
  }

  // Confidence model: more picks = more reliable, extreme bucket = more
  // confident, weak bucket caps lower.
  let conf = Math.min(0.95, 0.35 + (picksCount / 15) * 0.4);
  if (lean === "win_future" || lean === "win_now") conf = Math.min(0.95, conf + 0.1);
  if (lean === "balanced") conf = Math.min(0.65, conf);

  return {
    roster_id: roster.roster_id,
    owner_name: roster.owner_name ?? `Roster ${roster.roster_id}`,
    picks_made: picksCount,
    lean,
    confidence: conf,
    reasons,
    trade_implication: tradeImplicationFor(lean),
  };
}

// Compute per-roster Expected Value totals from Sleeper ADP. Sum
// across rostered players: each player contributes (CAP - adp), where
// lower ADP means more value. Players without ADP contribute 0
// (unknown rookies, deep flyers). Normalized within the league so
// the EV axis on the spectrum reflects relative team strength.
async function computeEvByRoster(
  snap: LeagueSnapshot,
): Promise<Map<number, { raw: number; norm: number }>> {
  const out = new Map<number, { raw: number; norm: number }>();
  let projections: Awaited<ReturnType<typeof getProjections>> | null = null;
  try {
    projections = await getProjections(snap.season);
  } catch {
    return out;
  }
  const fmt: AdpFormatKey = {
    isSuperflex: snap.format === "superflex" || snap.format === "2qb",
    isPpr: snap.scoring.includes("PPR"),
    isHalfPpr: snap.scoring.includes("half-PPR"),
    isTePremium: snap.scoring.includes("TE-premium"),
  };
  // ADP cap: anything past the cap counts as 0 contribution.
  const CAP = 250;
  const raws = new Map<number, number>();
  for (const r of snap.rosters) {
    let total = 0;
    for (const pid of r.player_ids) {
      const adpRaw = projections.byPlayerId.get(pid);
      const { value } = pickAdpFromVariants(adpRaw, fmt);
      if (value == null || !Number.isFinite(value)) continue;
      const v = Math.max(0, CAP - value);
      total += v;
    }
    raws.set(r.roster_id, total);
  }
  // Normalize 0..1 across the league. If everyone has 0 EV, leave as 0.
  const max = Math.max(0, ...raws.values());
  for (const [rid, raw] of raws) {
    out.set(rid, { raw, norm: max > 0 ? raw / max : 0 });
  }
  return out;
}

export async function buildOpponentCharacterizations(
  snap: LeagueSnapshot,
): Promise<OpponentCharacterization[]> {
  const me = snap.rosters.find((r) => r.is_me);
  const trades = snap.draft.traded_picks ?? [];
  const currentSeason = snap.season;
  const evByRoster = await computeEvByRoster(snap);
  const out: OpponentCharacterization[] = [];
  for (const roster of snap.rosters) {
    if (me && roster.roster_id === me.roster_id) continue;
    const base = characterizeOpponent(
      roster,
      snap.draft.picks_made,
      trades,
      currentSeason,
    );
    const ev = evByRoster.get(roster.roster_id);
    out.push({
      ...base,
      ev: ev?.norm ?? null,
      ev_raw: ev?.raw ?? null,
    });
  }
  // Sort: punted first (stark signal), then win-now → win-future.
  // Within bucket, by confidence.
  const order: Record<TeamLean, number> = {
    punted_season: -1,
    win_now: 0,
    lean_win_now: 1,
    balanced: 2,
    lean_win_future: 3,
    win_future: 4,
  };
  out.sort((a, b) => {
    const ord = order[a.lean] - order[b.lean];
    if (ord !== 0) return ord;
    return b.confidence - a.confidence;
  });
  return out;
}
