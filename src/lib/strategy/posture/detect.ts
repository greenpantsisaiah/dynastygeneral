/**
 * Roster posture classifier. Synthesizes:
 *   1. Current-year roster value rank (how the roster looks TODAY)
 *   2. Future capital rank (how much pick stash the roster holds)
 *   3. Champion history (won within the last 2 seasons?)
 *   4. Contender forecast peak year (when the model projects contention)
 *
 * Into a categorical posture + a recommended-lens recommendation +
 * a multi-year window framing.
 *
 * The classifier is a decision tree, not ML. Confidence is derived
 * from how cleanly the inputs agree.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import {
  computeOwnedFuturePicks,
  totalFuturePickValue,
  SUPERFLEX_PICK_MULTIPLIER,
  resolveRookieRounds,
  type OwnedPick,
} from "@/lib/players/future-picks";
import type {
  ChampionHistory,
  ContenderWindow,
  FutureCapitalSummary,
  PostureCategory,
  RecommendedLens,
  RosterPosture,
} from "./types";

/**
 * Build a per-season-per-round breakdown of the user's owned picks.
 * The OwnedPick rows from computeOwnedFuturePicks group by season+round
 * with counts; we re-shape into the FutureCapitalSummary structure.
 */
function summarizeFutureCapital(args: {
  myPicks: OwnedPick[];
  totalValue: number;
  leagueRank: number | null;
  rankTotal: number;
}): FutureCapitalSummary {
  const bySeason: FutureCapitalSummary["by_season"] = {};
  let totalFirsts = 0;
  for (const p of args.myPicks) {
    const slot =
      bySeason[p.season] ??
      (bySeason[p.season] = {
        round_1: 0,
        round_2: 0,
        round_3: 0,
        round_4_plus: 0,
      });
    if (p.round === 1) {
      slot.round_1 += p.count;
      totalFirsts += p.count;
    } else if (p.round === 2) slot.round_2 += p.count;
    else if (p.round === 3) slot.round_3 += p.count;
    else slot.round_4_plus += p.count;
  }
  return {
    by_season: bySeason,
    total_value: args.totalValue,
    league_rank: args.leagueRank,
    rank_total: args.rankTotal,
    total_first_rounders: totalFirsts,
  };
}

function classifyTier(
  rank: number | null,
  total: number,
): "top_3" | "top_half" | "bottom_half" | "bottom_3" | "unknown" {
  if (rank == null || total <= 0) return "unknown";
  if (rank <= 3) return "top_3";
  if (rank <= Math.ceil(total / 2)) return "top_half";
  if (rank > total - 3) return "bottom_3";
  return "bottom_half";
}

function lensFor(category: PostureCategory): RecommendedLens {
  switch (category) {
    case "contender":
      return "defend_window";
    case "win_now":
      return "complete_contender";
    case "balanced":
      return "balance_both";
    case "rebuilder":
      return "patient_build";
    case "teardown":
      return "preserve_capital";
    case "tank":
      return "evaluate_teardown";
  }
}

function headlineFor(
  category: PostureCategory,
  window: ContenderWindow,
): string {
  switch (category) {
    case "contender":
      return "Your window is open now. Defend it.";
    case "win_now":
      return window.peak_year
        ? `Close to contention. Peak projects ${window.peak_year}.`
        : "Close to contention. Complete the roster.";
    case "balanced":
      return "Mid-pack. Two playable lenses; pick a direction.";
    case "rebuilder":
      return window.peak_year
        ? `Patient build. War year projects ${window.peak_year}.`
        : "Patient build. Accumulate young assets and picks.";
    case "teardown":
      return window.peak_year
        ? `Active teardown. Your war is in ${window.peak_year}.`
        : "Active teardown. Recent champion in sell-off; future capital banked.";
    case "tank":
      return "Bottom of the league. Decide whether to commit to teardown.";
  }
}

export function classifyRosterPosture(args: {
  snap: LeagueSnapshot;
  myRosterId: number;
  /** 1-indexed value rank for the current year (from draftProgress.league_rank). Null when ungraded. */
  myCurrentValueRank: number | null;
  /** Total rosters in the league. */
  totalTeams: number;
  /** Champion history walking the previous_league_id chain. Null when not loaded. */
  championHistory?: ChampionHistory | null;
  /** Optional contender-forecast peak year + score, for the war-year headline. */
  contenderForecast?: {
    peak_year: number | null;
    peak_score: number | null;
  } | null;
}): RosterPosture {
  const {
    snap,
    myRosterId,
    myCurrentValueRank,
    totalTeams,
    championHistory,
    contenderForecast,
  } = args;

  const isSuperflex = snap.format === "superflex" || snap.format === "2qb";
  const formatMultiplier = isSuperflex ? SUPERFLEX_PICK_MULTIPLIER : 1.0;
  const rosterIds = snap.rosters.map((r) => r.roster_id);
  const rounds = resolveRookieRounds(snap.draft.rounds);

  // My future picks + value.
  const myPicks = computeOwnedFuturePicks({
    rosterId: myRosterId,
    rosterIds,
    tradedPicks: snap.draft.traded_picks,
    leagueSeason: snap.season,
    rounds,
  });
  const myFutureValue = totalFuturePickValue(
    myPicks,
    snap.season,
    formatMultiplier,
  );

  // League-wide ranking on future capital. Loop every roster, compute
  // their total future value, sort. O(rosters^2 × rounds × horizon)
  // worst case, but rounds ≤ 6 and horizon = 5 so this is cheap.
  const futureTotalsByRoster: Array<{
    roster_id: number;
    total_value: number;
  }> = [];
  for (const rid of rosterIds) {
    const picks = computeOwnedFuturePicks({
      rosterId: rid,
      rosterIds,
      tradedPicks: snap.draft.traded_picks,
      leagueSeason: snap.season,
      rounds,
    });
    const value = totalFuturePickValue(
      picks,
      snap.season,
      formatMultiplier,
    );
    futureTotalsByRoster.push({ roster_id: rid, total_value: value });
  }
  futureTotalsByRoster.sort((a, b) => b.total_value - a.total_value);
  const myFutureRank =
    futureTotalsByRoster.findIndex((r) => r.roster_id === myRosterId) + 1 ||
    null;

  const futureCapital = summarizeFutureCapital({
    myPicks,
    totalValue: myFutureValue,
    leagueRank: myFutureRank,
    rankTotal: futureTotalsByRoster.length,
  });

  // Tier classification on the two axes.
  const currentTier = classifyTier(myCurrentValueRank, totalTeams);
  const futureTier = classifyTier(myFutureRank, totalTeams);

  // Recent-champion signal: did we win in the last 2 seasons?
  const currentYear = parseInt(snap.season, 10);
  const recentChampion =
    championHistory?.seasons.some((s) => {
      if (!s.was_me) return false;
      const yr = parseInt(s.season, 10);
      if (!Number.isFinite(yr)) return false;
      return Number.isFinite(currentYear) && currentYear - yr <= 2 && yr < currentYear;
    }) ?? false;

  // Posture decision tree.
  let category: PostureCategory;
  let confidence: number;
  const signals: string[] = [];

  if (currentTier === "top_3" && (futureTier === "top_3" || futureTier === "top_half")) {
    category = "contender";
    confidence = 0.85;
    signals.push(`Rostered value ranks ${myCurrentValueRank} of ${totalTeams}.`);
    signals.push("Future capital intact; the window stays open.");
  } else if (currentTier === "top_3" && (futureTier === "bottom_half" || futureTier === "bottom_3")) {
    category = "win_now";
    confidence = 0.8;
    signals.push(`Rostered value ranks ${myCurrentValueRank} of ${totalTeams}.`);
    signals.push("Future capital sold off; contender window is now.");
  } else if (currentTier === "top_half" && futureTier !== "bottom_3") {
    category = "balanced";
    confidence = 0.6;
    signals.push(
      `Rostered value ranks ${myCurrentValueRank} of ${totalTeams}; mid-pack.`,
    );
    if (myFutureRank) {
      signals.push(
        `Future capital ranks ${myFutureRank} of ${totalTeams}; balanced both ways.`,
      );
    }
  } else if (
    (currentTier === "bottom_half" || currentTier === "bottom_3") &&
    (futureTier === "top_3" || futureTier === "top_half") &&
    recentChampion
  ) {
    category = "teardown";
    confidence = 0.9;
    signals.push(
      `Rostered value ranks ${myCurrentValueRank} of ${totalTeams}.`,
    );
    if (myFutureRank) {
      signals.push(
        `Future capital ranks ${myFutureRank} of ${totalTeams}; ${futureCapital.total_first_rounders} future R1s banked.`,
      );
    }
    const lastWin = championHistory?.seasons.find((s) => s.was_me);
    if (lastWin) {
      signals.push(
        `Won the league in ${lastWin.season}; this looks like a deliberate sell-off.`,
      );
    }
  } else if (
    (currentTier === "bottom_half" || currentTier === "bottom_3") &&
    (futureTier === "top_3" || futureTier === "top_half")
  ) {
    category = "rebuilder";
    confidence = 0.8;
    signals.push(
      `Rostered value ranks ${myCurrentValueRank} of ${totalTeams}.`,
    );
    if (myFutureRank) {
      signals.push(
        `Future capital ranks ${myFutureRank} of ${totalTeams}; ${futureCapital.total_first_rounders} future R1s banked.`,
      );
    }
  } else if (currentTier === "bottom_3" && (futureTier === "bottom_half" || futureTier === "bottom_3")) {
    category = "tank";
    confidence = 0.75;
    signals.push(
      `Rostered value ranks ${myCurrentValueRank} of ${totalTeams}.`,
    );
    signals.push("Light future capital; no obvious window in view yet.");
  } else {
    category = "balanced";
    confidence = 0.5;
    signals.push(
      `Mixed signals; the model could not cleanly classify the posture.`,
    );
  }

  // Contender window. Use the forecast peak_year when available; for
  // teardown/rebuilder default to currentYear + 2 (the typical rookie
  // pick maturation window).
  let peakYear: number | null = null;
  let windowWhy = "Contender window not yet projected.";
  if (contenderForecast?.peak_year) {
    peakYear = contenderForecast.peak_year;
    windowWhy = `Forecast model projects peak roster value in ${peakYear}.`;
  } else if (
    category === "teardown" ||
    category === "rebuilder"
  ) {
    if (Number.isFinite(currentYear)) {
      peakYear = currentYear + 2;
      windowWhy = `Owned future capital matures into starters around ${peakYear}-${peakYear + 1}.`;
    }
  } else if (category === "contender" || category === "win_now") {
    if (Number.isFinite(currentYear)) {
      peakYear = currentYear;
      windowWhy = "Roster value is concentrated in current-year producers.";
    }
  }

  const window: ContenderWindow = {
    earliest_year:
      category === "contender" || category === "win_now"
        ? Number.isFinite(currentYear)
          ? currentYear
          : null
        : peakYear,
    peak_year: peakYear,
    why: windowWhy,
  };

  return {
    category,
    confidence,
    contender_window: window,
    future_capital: futureCapital,
    signals,
    recommended_lens: lensFor(category),
    headline: headlineFor(category, window),
  };
}
