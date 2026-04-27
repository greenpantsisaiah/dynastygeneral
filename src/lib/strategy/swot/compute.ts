/**
 * SWOT computation for the user's roster vs the league. Rule-based,
 * deterministic, no LLM call. Each quadrant returns 2-4 of the most
 * differentiating items. Each item has a "play it" follow-on string
 * with concrete next-action language.
 *
 * Per founder pitch 2026-04-26: SWOT is the natural intelligence-
 * analyst framework for fantasy. Strengths (what you outclass the
 * field on), Weaknesses (where you lag), Opportunities (market
 * conditions to exploit), Threats (rivals' strengths in your weak
 * areas, convergence risks). Each item with a "how to play it"
 * follow-on turns the chart into a briefing, not a list.
 *
 * Inputs:
 *   - LeagueSnapshot: starter slots, format, scoring, rosters
 *   - LeagueOutlook: per-team win-now, future, peak forecast,
 *                    position counts, trajectory
 *
 * Output: SwotReport with 4 quadrants of items + headline summary.
 */

import type { LeagueSnapshot } from "../league-state/snapshot";
import type {
  LeagueOutlook,
  LeagueOutlookTeam,
} from "../league-outlook/compute";
import type { Position } from "../archetypes/schema";

export type SwotItem = {
  // Headline statement (e.g. "Top-2 RB depth in the league").
  headline: string;
  // Evidence bullet (data backing the headline).
  evidence: string;
  // "Play it" follow-on: concrete action language.
  play: string;
  // Severity / leverage signal for sort order. Higher = more important.
  weight: number;
};

export type SwotReport = {
  strengths: SwotItem[];
  weaknesses: SwotItem[];
  opportunities: SwotItem[];
  threats: SwotItem[];
  // Brief executive summary of the user's posture.
  posture: string;
  // The user's team for header reference.
  me_owner: string | null;
};

const POSITION_LABEL: Record<Position, string> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  K: "K",
  DST: "DST",
};

const SKILL: Position[] = ["QB", "RB", "WR", "TE"];

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function rankOf<T>(items: T[], target: T, key: (x: T) => number): number {
  // 1-indexed rank by key descending. Ties broken by order seen.
  const sorted = [...items].sort((a, b) => key(b) - key(a));
  return sorted.findIndex((x) => x === target) + 1;
}

export function computeSwot(
  snap: LeagueSnapshot,
  outlook: LeagueOutlook,
): SwotReport {
  const me = outlook.teams.find((t) => t.is_me);
  const meOwner = me?.owner_name ?? null;
  if (!me) {
    return {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [],
      posture: "No roster identified for SWOT analysis.",
      me_owner: null,
    };
  }
  const others = outlook.teams.filter((t) => !t.is_me);
  const totalTeams = outlook.teams.length;

  const isTePremium = snap.scoring.includes("TE-premium");
  const isPpr =
    snap.scoring.includes("PPR") || snap.scoring.includes("half-PPR");

  // ─────────────────────────────────────────────────────────────────
  // Strengths
  // ─────────────────────────────────────────────────────────────────
  const strengths: SwotItem[] = [];

  // Per-position count vs league.
  for (const pos of SKILL) {
    const myCount = me.position_counts[pos] ?? 0;
    const leagueCounts = outlook.teams.map(
      (t) => t.position_counts[pos] ?? 0,
    );
    const med = median(leagueCounts);
    const myRank = rankOf(outlook.teams, me, (t) => t.position_counts[pos] ?? 0);
    if (myCount >= med + 2 && myRank <= 3) {
      // Materially above median AND top-3 in the league at position.
      const tePremiumBoost =
        pos === "TE" && isTePremium
          ? " TE-premium scoring multiplies the asset value."
          : "";
      strengths.push({
        headline: `${POSITION_LABEL[pos]} depth (${myCount} on roster, ${myRank}${ordinalSuffix(myRank)} in league)`,
        evidence: `League median is ${med.toFixed(1)} ${POSITION_LABEL[pos]}s; you have ${myCount}.${tePremiumBoost}`,
        play:
          myCount >= med + 3
            ? `Trade surplus ${POSITION_LABEL[pos]} to a position-thin team for what you lack. The asymmetry is real.`
            : `Hold the depth advantage; lineup flexibility is your edge.`,
        weight: 70 + (myCount - med) * 10 + (myRank === 1 ? 15 : 0),
      });
    }
  }

  // Win-now or future score above league median.
  const winNows = outlook.teams.map((t) => t.win_now);
  const futures = outlook.teams.map((t) => t.future);
  const medWinNow = median(winNows);
  const medFuture = median(futures);
  if (me.win_now >= medWinNow + 5) {
    const r = rankOf(outlook.teams, me, (t) => t.win_now);
    strengths.push({
      headline: `Win-now position (${r}${ordinalSuffix(r)} of ${totalTeams})`,
      evidence: `Your win-now score ${me.win_now} vs league median ${medWinNow.toFixed(1)}.`,
      play: `Lean roster decisions toward proven production over upside until the gap closes.`,
      weight: 60 + (me.win_now - medWinNow),
    });
  }
  if (me.future >= medFuture + 5) {
    const r = rankOf(outlook.teams, me, (t) => t.future);
    strengths.push({
      headline: `Future capital (${r}${ordinalSuffix(r)} of ${totalTeams})`,
      evidence: `Your future score ${me.future} vs league median ${medFuture.toFixed(1)}.`,
      play: `Hold rookie picks; they fund the back half of your contender window.`,
      weight: 60 + (me.future - medFuture),
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Weaknesses
  // ─────────────────────────────────────────────────────────────────
  const weaknesses: SwotItem[] = [];

  // Per-position count below median by a meaningful margin.
  for (const pos of SKILL) {
    const myCount = me.position_counts[pos] ?? 0;
    const leagueCounts = outlook.teams.map(
      (t) => t.position_counts[pos] ?? 0,
    );
    const med = median(leagueCounts);
    const max = Math.max(...leagueCounts);
    const teamsAtOrAbove = leagueCounts.filter((c) => c >= med + 1).length;
    if (myCount <= med - 2 || (myCount <= 1 && med >= 3)) {
      const flexNote =
        pos === "WR" && isPpr
          ? " PPR scoring rewards WR depth heavily; this is a flex-EV gap."
          : "";
      weaknesses.push({
        headline: `${POSITION_LABEL[pos]} thinness (${myCount} on roster, league median ${med.toFixed(1)})`,
        evidence: `${teamsAtOrAbove} of ${totalTeams} teams have ${med + 1}+ ${POSITION_LABEL[pos]}s; max is ${max}.${flexNote}`,
        play:
          pos === "WR"
            ? `Target WR in next 2-3 picks; package surplus elsewhere for a proven WR before week 4.`
            : `Address ${POSITION_LABEL[pos]} via draft (next 2-3 picks) or trade. Don't paper over with bench fillers.`,
        weight: 80 + (med - myCount) * 8,
      });
    }
  }

  // Below-median win-now or future.
  if (me.win_now <= medWinNow - 5) {
    weaknesses.push({
      headline: `Win-now lag (${me.win_now} vs league median ${medWinNow.toFixed(1)})`,
      evidence: `You're scoring ${(medWinNow - me.win_now).toFixed(1)} below the field on current production capacity.`,
      play: `Skew remaining picks toward proven 25-29 starters; defer rookie speculation.`,
      weight: 65 + (medWinNow - me.win_now),
    });
  }
  if (me.future <= medFuture - 5) {
    weaknesses.push({
      headline: `Future capital lag (${me.future} vs league median ${medFuture.toFixed(1)})`,
      evidence: `Your future score is ${(medFuture - me.future).toFixed(1)} below the field. Younger rosters will pass you by 2028.`,
      play: `Trade win-now surplus for rookie picks before season starts; the market rates rookies cheap pre-NFL-draft.`,
      weight: 60 + (medFuture - me.future),
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Opportunities
  // ─────────────────────────────────────────────────────────────────
  const opportunities: SwotItem[] = [];

  // Cross-reference: positions where YOU have surplus AND others have deficit.
  for (const pos of SKILL) {
    const myCount = me.position_counts[pos] ?? 0;
    const leagueCounts = outlook.teams.map(
      (t) => t.position_counts[pos] ?? 0,
    );
    const med = median(leagueCounts);
    if (myCount < med + 1) continue; // not surplus
    const thinTeams = others.filter(
      (t) => (t.position_counts[pos] ?? 0) <= 1,
    );
    if (thinTeams.length === 0) continue;
    const names = thinTeams
      .slice(0, 3)
      .map((t) => t.owner_name ?? "?")
      .join(", ");
    const tePremiumNote =
      pos === "TE" && isTePremium ? " in TE-premium scoring" : "";
    opportunities.push({
      headline: `${thinTeams.length} team${thinTeams.length === 1 ? "" : "s"} thin at ${POSITION_LABEL[pos]}${tePremiumNote}`,
      evidence: `${names}${thinTeams.length > 3 ? ` (+${thinTeams.length - 3} more)` : ""} have 0-1 ${POSITION_LABEL[pos]}s; you have ${myCount}.`,
      play: `Trade your ${POSITION_LABEL[pos]} surplus for what you lack. ${thinTeams.length} potential trade partners; their urgency drops every week so move early.`,
      weight: 70 + thinTeams.length * 5 + (myCount - med) * 4,
    });
  }

  // Future pick advantage.
  // (We don't have explicit pick counts on outlook today; surface the
  //  future score advantage as a signal.)
  if (me.future >= medFuture + 8) {
    opportunities.push({
      headline: `Capital advantage for trade-up plays`,
      evidence: `Your future score ${me.future} is well above league median ${medFuture.toFixed(1)}.`,
      play: `Use a 2027 R2 or R3 to package up for a proven win-now starter at your weakest position. The market rates futures cheap pre-draft; flip the spread.`,
      weight: 55 + (me.future - medFuture) * 0.5,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Threats
  // ─────────────────────────────────────────────────────────────────
  const threats: SwotItem[] = [];

  // Closest rival by overall composite (win-now + future).
  const myComposite = me.win_now + me.future;
  const rivals = others
    .map((t) => ({ t, gap: myComposite - (t.win_now + t.future) }))
    .filter((r) => Math.abs(r.gap) <= 15)
    .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap));
  if (rivals.length > 0) {
    const rival = rivals[0].t;
    // Identify positions where rival outranks user materially.
    const rivalAdvantages: Position[] = [];
    for (const pos of SKILL) {
      const my = me.position_counts[pos] ?? 0;
      const rv = rival.position_counts[pos] ?? 0;
      if (rv >= my + 2) rivalAdvantages.push(pos);
    }
    const advantageNote =
      rivalAdvantages.length > 0
        ? `${rivalAdvantages.map((p) => POSITION_LABEL[p]).join(", ")} edge`
        : "broad balance";
    threats.push({
      headline: `${rival.owner_name ?? "Rival"} is your closest convergence threat (${advantageNote})`,
      evidence: `Composite gap: ${rivals[0].gap >= 0 ? "+" : ""}${rivals[0].gap.toFixed(0)}. Your ${me.win_now}/${me.future}; their ${rival.win_now}/${rival.future}.`,
      play: `Don't trade picks or starters TO this team. Check their open roster needs before any 3-team or future-pick deal that could pass through.`,
      weight: 70 + (15 - Math.abs(rivals[0].gap)) * 2,
    });
  }

  // Position dominance threats: someone in the league is at peak strength
  // at YOUR weakest position.
  for (const pos of SKILL) {
    const myCount = me.position_counts[pos] ?? 0;
    const leagueCounts = outlook.teams.map(
      (t) => t.position_counts[pos] ?? 0,
    );
    const med = median(leagueCounts);
    if (myCount >= med) continue; // not a weakness for us at this pos
    const dominator = others
      .map((t) => ({ t, count: t.position_counts[pos] ?? 0 }))
      .sort((a, b) => b.count - a.count)[0];
    if (!dominator || dominator.count < med + 2) continue;
    threats.push({
      headline: `${dominator.t.owner_name ?? "Rival"} dominates ${POSITION_LABEL[pos]} (${dominator.count} on roster vs your ${myCount})`,
      evidence: `Their ${POSITION_LABEL[pos]} surplus reduces your in-season trade leverage; they don't need yours and won't pay premium.`,
      play: `Don't depend on trading FOR ${POSITION_LABEL[pos]} from this team. Solve via draft + waiver. Or target a ${POSITION_LABEL[pos]}-thin team for a deal before this roster recalibrates.`,
      weight: 55 + (dominator.count - myCount) * 5,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Sort + cap quadrants. Cap at 4 items per to keep the briefing
  // scannable. Posture is a one-line summary of the dominant signal.
  // ─────────────────────────────────────────────────────────────────
  strengths.sort((a, b) => b.weight - a.weight);
  weaknesses.sort((a, b) => b.weight - a.weight);
  opportunities.sort((a, b) => b.weight - a.weight);
  threats.sort((a, b) => b.weight - a.weight);

  const sCount = strengths.length;
  const wCount = weaknesses.length;
  const oCount = opportunities.length;
  const tCount = threats.length;

  let posture: string;
  if (wCount === 0 && sCount >= 2) {
    posture = `Dominant posture. ${sCount} clear strengths, no material weaknesses. Lock in. Defend leverage.`;
  } else if (wCount > sCount && tCount >= 2) {
    posture = `Vulnerable posture. ${wCount} weaknesses, ${tCount} convergence threats. Address weakness via trade + targeted picks before week 4.`;
  } else if (sCount >= 2 && wCount >= 1) {
    posture = `Balanced posture with one structural gap. ${sCount} strengths to leverage, ${wCount} weakness to cover. Trade surplus for need; don't paper over.`;
  } else {
    posture = `Mid-pack posture. ${sCount} strengths, ${wCount} weaknesses, ${oCount} opportunities. Pick your strongest lane; don't chase every gap.`;
  }

  return {
    strengths: strengths.slice(0, 4),
    weaknesses: weaknesses.slice(0, 4),
    opportunities: opportunities.slice(0, 4),
    threats: threats.slice(0, 4),
    posture,
    me_owner: meOwner,
  };
}

function ordinalSuffix(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return "st";
  if (j === 2 && k !== 12) return "nd";
  if (j === 3 && k !== 13) return "rd";
  return "th";
}
