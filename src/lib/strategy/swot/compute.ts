/**
 * SWOT computation. Multi-voice, rank-based, force-filled.
 *
 * Three analyst voices, sometimes conflicting:
 *   - Statistician: counts, ranks, percentiles. Pure data reads.
 *   - Coach: roster construction, lineup math, starter-room health.
 *   - Gambler: composite odds, market-implied risk/reward framing.
 *
 * Rank-based, not threshold-based. Top-3 at a position is always a
 * strength (regardless of absolute gap to median); bottom-3 is always
 * a weakness. The prior threshold-only model produced 0/0/0/2 reports
 * for clearly-asymmetric rosters because clustered data never crossed
 * absolute cutoffs.
 *
 * Force-fill: each quadrant returns at least 3 items by relaxing
 * filters when rule-based fires don't fill the slot. A 0-item
 * quadrant on a real, asymmetric roster was the founder bug
 * 2026-04-26: SWOT-Spark-Sting screen showed 0 strengths and 0
 * weaknesses despite the user being top-2 in RB and bottom-2 in WR.
 */

import type { LeagueSnapshot } from "../league-state/snapshot";
import type {
  LeagueOutlook,
  LeagueOutlookTeam,
} from "../league-outlook/compute";
import type { Position } from "../archetypes/schema";
import {
  buildFormatRulesFromSnapshot,
  type FormatRules,
} from "@/lib/engine/llm-contract";

// Format-aware starter capacity for a position. INVARIANTS: never
// branch on starter_slots.hard.X directly; use the canonical helper
// so superflex / 2QB formats correctly count the second QB slot,
// flex eligibility for RB/WR/TE, and rec-flex for WR/TE.
function startersMaxFor(pos: Position, rules: FormatRules): number {
  switch (pos) {
    case "QB":
      return rules.qb_starters_max;
    case "RB":
      return rules.rb_starters_max;
    case "WR":
      return rules.wr_starters_max;
    case "TE":
      return rules.te_starters_max;
    default:
      return 0;
  }
}

export type SwotVoice = "statistician" | "coach" | "gambler";

export type SwotItem = {
  voice: SwotVoice;
  headline: string;
  evidence: string;
  play: string;
  weight: number;
};

export type SwotReport = {
  strengths: SwotItem[];
  weaknesses: SwotItem[];
  opportunities: SwotItem[];
  threats: SwotItem[];
  posture: string;
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

// Rank a target item by a numeric key, descending (1 = highest).
function rankOf<T>(items: readonly T[], target: T, key: (x: T) => number): number {
  const sorted = [...items].sort((a, b) => key(b) - key(a));
  return sorted.findIndex((x) => x === target) + 1;
}

function ordinalSuffix(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return "st";
  if (j === 2 && k !== 12) return "nd";
  if (j === 3 && k !== 13) return "rd";
  return "th";
}

function ord(n: number): string {
  return `${n}${ordinalSuffix(n)}`;
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
  const rules = buildFormatRulesFromSnapshot(snap);

  // Pre-compute per-position rank tables.
  const posRank: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
  const posMed: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
  const posMax: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
  for (const pos of SKILL) {
    const counts = outlook.teams.map((t) => t.position_counts[pos] ?? 0);
    posRank[pos] = rankOf(outlook.teams, me, (t) => t.position_counts[pos] ?? 0);
    posMed[pos] = median(counts);
    posMax[pos] = Math.max(...counts);
  }

  const winNows = outlook.teams.map((t) => t.win_now);
  const futures = outlook.teams.map((t) => t.future);
  const composites = outlook.teams.map((t) => t.win_now + t.future);
  const medWinNow = median(winNows);
  const medFuture = median(futures);
  const myCompositeRank = rankOf(
    outlook.teams,
    me,
    (t) => t.win_now + t.future,
  );
  const myWinNowRank = rankOf(outlook.teams, me, (t) => t.win_now);
  const myFutureRank = rankOf(outlook.teams, me, (t) => t.future);

  // ─────────────────────────────────────────────────────────────────
  // Strengths
  // ─────────────────────────────────────────────────────────────────
  const strengths: SwotItem[] = [];

  // Statistician: top-3 ranks at any position (rank-based, not threshold).
  for (const pos of SKILL) {
    const r = posRank[pos];
    const myCount = me.position_counts[pos] ?? 0;
    if (r <= 3) {
      const tePremiumNote =
        pos === "TE" && isTePremium
          ? " TE-premium scoring multiplies the asset value."
          : "";
      strengths.push({
        voice: "statistician",
        headline: `${ord(r)} of ${totalTeams} in ${POSITION_LABEL[pos]} count (${myCount} on roster)`,
        evidence: `League median ${posMed[pos].toFixed(1)} ${POSITION_LABEL[pos]}s; max ${posMax[pos]}.${tePremiumNote}`,
        play:
          r === 1
            ? `You set the ${POSITION_LABEL[pos]} market in this league. Trade surplus to a thin team for what you lack; you have the leverage.`
            : `Top-${r} depth at ${POSITION_LABEL[pos]} is real lineup edge. Hold or convert via trade.`,
        weight: 80 - r * 5 + Math.max(0, myCount - posMed[pos]) * 3,
      });
    }
  }

  // Coach: starter-room locked. Format-aware: SF / 2QB count the
  // second QB slot, flex eligibility counts for RB/WR/TE, REC_FLEX
  // counts for WR/TE. NEVER branch on starter_slots.hard directly.
  for (const pos of SKILL) {
    const myCount = me.position_counts[pos] ?? 0;
    const starters = startersMaxFor(pos, rules);
    if (starters >= 1 && myCount >= starters + 2) {
      strengths.push({
        voice: "coach",
        headline: `${POSITION_LABEL[pos]} room locked (${myCount} bodies for ${starters} starter slot${starters === 1 ? "" : "s"})`,
        evidence: `You can absorb a ${POSITION_LABEL[pos]} injury without losing lineup capacity. Most teams can't.`,
        play: `When the league hits its first ${POSITION_LABEL[pos]} injury wave, you're the leverage point. Don't preempt; let urgency build.`,
        weight: 65 + (myCount - starters) * 4,
      });
    }
  }

  // Gambler: contender-bracket composite rank.
  if (myCompositeRank <= 4) {
    const composite = me.win_now + me.future;
    strengths.push({
      voice: "gambler",
      headline: `Contender-bracket odds (composite rank ${myCompositeRank}/${totalTeams})`,
      evidence: `Win-now ${me.win_now} + future ${me.future} = ${composite}, ${ord(myCompositeRank)} in league.`,
      play: `Bet the window. Don't trade for picks; you're already on the contender odds board. Lock starters; defend.`,
      weight: 70 - myCompositeRank * 4,
    });
  }

  // Gambler: pure win-now bracket.
  if (myWinNowRank <= 3 && myCompositeRank > 4) {
    strengths.push({
      voice: "gambler",
      headline: `Win-now bracket (${ord(myWinNowRank)} of ${totalTeams} in 2026 odds)`,
      evidence: `Your win-now ${me.win_now} vs league median ${medWinNow.toFixed(1)}. The market hasn't priced your 2026 ceiling.`,
      play: `Sell rookie picks now while market values them high. Convert to proven 25-29 starters before week 1.`,
      weight: 60 - myWinNowRank * 5,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Weaknesses
  // ─────────────────────────────────────────────────────────────────
  const weaknesses: SwotItem[] = [];

  // Statistician: bottom-3 ranks at any position.
  for (const pos of SKILL) {
    const r = posRank[pos];
    const myCount = me.position_counts[pos] ?? 0;
    if (r >= totalTeams - 2) {
      const fromBottom = totalTeams - r + 1;
      const teamsAboveMe = outlook.teams.filter(
        (t) => (t.position_counts[pos] ?? 0) > myCount,
      ).length;
      const flexNote =
        pos === "WR" && isPpr
          ? " PPR scoring rewards WR depth heavily; this is a flex-EV gap."
          : "";
      weaknesses.push({
        voice: "statistician",
        headline: `${ord(r)} of ${totalTeams} in ${POSITION_LABEL[pos]} count (${myCount} on roster, ${ord(fromBottom)} from bottom)`,
        evidence: `${teamsAboveMe} of ${totalTeams - 1} other teams have more ${POSITION_LABEL[pos]}s than you; league median ${posMed[pos].toFixed(1)}, max ${posMax[pos]}.${flexNote}`,
        play:
          pos === "WR"
            ? `Target WR in your next picks; package elsewhere for a proven WR before week 4. Don't paper over with bench fillers.`
            : `Address ${POSITION_LABEL[pos]} via draft + trade. Bench fillers won't move the lineup math.`,
        weight: 80 + (posMed[pos] - myCount) * 5 + (4 - fromBottom) * 3,
      });
    }
  }

  // Coach: starter-room thin vs format demand. "Thin" = bodies barely
  // cover the format's actual starter slots (zero injury cushion).
  // Format-aware via buildFormatRulesFromSnapshot.
  for (const pos of SKILL) {
    const myCount = me.position_counts[pos] ?? 0;
    const starters = startersMaxFor(pos, rules);
    if (starters >= 1 && myCount <= starters) {
      weaknesses.push({
        voice: "coach",
        headline: `${POSITION_LABEL[pos]} room thin (${myCount} bodies for ${starters} starter slot${starters === 1 ? "" : "s"})`,
        evidence: `One injury at ${POSITION_LABEL[pos]} forces a flex / waiver scramble. League median is ${posMed[pos].toFixed(1)}; ${posMax[pos]} max.`,
        play: `Build ${POSITION_LABEL[pos]} insurance into your next 2-3 picks. Bench depth is starter capacity in disguise.`,
        weight: 75 + (starters + 2 - myCount) * 5,
      });
    }
  }

  // Gambler: longshot-bracket composite.
  if (myCompositeRank >= totalTeams - 3) {
    const composite = me.win_now + me.future;
    weaknesses.push({
      voice: "gambler",
      headline: `Longshot-bracket odds (composite rank ${myCompositeRank}/${totalTeams})`,
      evidence: `Win-now ${me.win_now} + future ${me.future} = ${composite}, ${ord(myCompositeRank)} in league.`,
      play: `Decide your bet: accelerate via trade-up using future picks, OR sell remaining win-now assets for 2027+ picks. Don't sit between.`,
      weight: 65 + (myCompositeRank - (totalTeams - 3)) * 4,
    });
  }

  // Gambler: future-cliff. Win-now strong but future weak = closing window.
  if (myWinNowRank <= 4 && myFutureRank >= totalTeams - 2) {
    weaknesses.push({
      voice: "gambler",
      headline: `Closing-window risk (win-now ${ord(myWinNowRank)}, future ${ord(myFutureRank)})`,
      evidence: `You're priced as a 2026 contender but a 2028 longshot. Window is 1-2 years.`,
      play: `Trade rookie picks for proven anchors NOW while market still values your futures. Don't accumulate; convert.`,
      weight: 70 + (totalTeams - myFutureRank) * 2,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Opportunities
  // ─────────────────────────────────────────────────────────────────
  const opportunities: SwotItem[] = [];

  // Statistician: cross-reference your surplus + others' deficit per position.
  for (const pos of SKILL) {
    const myCount = me.position_counts[pos] ?? 0;
    if (myCount < posMed[pos] + 1) continue;
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
      voice: "statistician",
      headline: `${thinTeams.length} team${thinTeams.length === 1 ? "" : "s"} thin at ${POSITION_LABEL[pos]}${tePremiumNote}`,
      evidence: `${names}${thinTeams.length > 3 ? ` (+${thinTeams.length - 3} more)` : ""} have 0-1 ${POSITION_LABEL[pos]}s; you have ${myCount}.`,
      play: `Trade your ${POSITION_LABEL[pos]} surplus for what you lack. ${thinTeams.length} potential partner${thinTeams.length === 1 ? "" : "s"}; their urgency drops every week. Move early.`,
      weight: 70 + thinTeams.length * 5 + (myCount - posMed[pos]) * 4,
    });
  }

  // Coach: cross-reference YOUR strength position vs YOUR weakness position
  // for an internal trade thesis.
  const strongest: Position | null = SKILL.reduce<Position | null>(
    (best, p) =>
      best == null
        ? p
        : posRank[p] < posRank[best]
          ? p
          : best,
    null,
  );
  const weakest: Position | null = SKILL.reduce<Position | null>(
    (worst, p) =>
      worst == null
        ? p
        : posRank[p] > posRank[worst]
          ? p
          : worst,
    null,
  );
  if (
    strongest &&
    weakest &&
    strongest !== weakest &&
    posRank[strongest] <= 4 &&
    posRank[weakest] >= totalTeams - 3
  ) {
    opportunities.push({
      voice: "coach",
      headline: `Trade thesis: convert ${POSITION_LABEL[strongest]} surplus into ${POSITION_LABEL[weakest]} need`,
      evidence: `You're ${ord(posRank[strongest])} at ${POSITION_LABEL[strongest]} and ${ord(posRank[weakest])} at ${POSITION_LABEL[weakest]}. Most asymmetric roster in the league at this pair.`,
      play: `Build a 2-for-1 offer: your ${POSITION_LABEL[strongest]}3 + a future pick for their ${POSITION_LABEL[weakest]}2. The asymmetry is the leverage.`,
      weight: 75 + (posRank[weakest] - posRank[strongest]) * 3,
    });
  }

  // Gambler: future score >= median + significant = capital advantage to flip.
  if (me.future >= medFuture + 6) {
    opportunities.push({
      voice: "gambler",
      headline: `Capital-edge play (future ${ord(myFutureRank)} of ${totalTeams})`,
      evidence: `Your future score ${me.future} vs league median ${medFuture.toFixed(1)}. Market rates futures cheap pre-NFL-draft; the spread is widest now.`,
      play: `Use a 2027 R2 + R3 to package up for a proven win-now starter at your weakest position. Flip the spread before draft pricing tightens.`,
      weight: 60 + (me.future - medFuture) * 0.7,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Threats
  // ─────────────────────────────────────────────────────────────────
  const threats: SwotItem[] = [];

  // Statistician: closest composite rival.
  const myComposite = me.win_now + me.future;
  const rivals = others
    .map((t) => ({ t, gap: myComposite - (t.win_now + t.future) }))
    .filter((r) => Math.abs(r.gap) <= 15)
    .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap));
  if (rivals.length > 0) {
    const rival = rivals[0].t;
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
      voice: "statistician",
      headline: `${rival.owner_name ?? "Rival"} is your closest convergence threat (${advantageNote})`,
      evidence: `Composite gap: ${rivals[0].gap >= 0 ? "+" : ""}${rivals[0].gap.toFixed(0)}. Your ${me.win_now}/${me.future}; their ${rival.win_now}/${rival.future}.`,
      play: `Don't trade picks or starters TO this team. Check their open roster needs before any 3-team or future-pick deal that could pass through.`,
      weight: 70 + (15 - Math.abs(rivals[0].gap)) * 2,
    });
  }

  // Coach: position dominators in YOUR weak areas.
  for (const pos of SKILL) {
    if (posRank[pos] <= Math.ceil(totalTeams / 2)) continue;
    const dominator = others
      .map((t) => ({ t, count: t.position_counts[pos] ?? 0 }))
      .sort((a, b) => b.count - a.count)[0];
    if (!dominator) continue;
    const myCount = me.position_counts[pos] ?? 0;
    if (dominator.count < myCount + 2) continue;
    threats.push({
      voice: "coach",
      headline: `${dominator.t.owner_name ?? "Rival"} dominates ${POSITION_LABEL[pos]} (${dominator.count} on roster vs your ${myCount})`,
      evidence: `Their ${POSITION_LABEL[pos]} surplus reduces your in-season trade leverage; they don't need yours and won't pay premium.`,
      play: `Don't depend on trading FOR ${POSITION_LABEL[pos]} from this team. Solve via draft + waiver. Or target a ${POSITION_LABEL[pos]}-thin team for a deal before this roster recalibrates.`,
      weight: 55 + (dominator.count - myCount) * 5,
    });
  }

  // Gambler: rising rival on the same window. Younger trajectory = future
  // pricing pressure on YOUR contender window.
  const risingRivals = others.filter(
    (t) =>
      t.trajectory === "rising" &&
      Math.abs(t.win_now + t.future - myComposite) <= 25,
  );
  if (risingRivals.length > 0) {
    const top = risingRivals.sort((a, b) => b.peak_score - a.peak_score)[0];
    threats.push({
      voice: "gambler",
      headline: `${top.owner_name ?? "Rival"} on a rising trajectory toward your window`,
      evidence: `Their peak forecast ${top.peak_score} (${top.peak_year}); trajectory rising. They're closing toward your bracket from below.`,
      play: `Don't sell win-now to them. They're betting the same window you are. Trade with capital-rich rebuilders instead.`,
      weight: 55 + (top.peak_score - 50) * 0.5,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Force-fill: each quadrant returns at least 3 items. If rule-based
  // didn't fill, surface "next-tier" candidates so the briefing always
  // has substance even on a clustered roster.
  // ─────────────────────────────────────────────────────────────────

  // Sort each quadrant.
  strengths.sort((a, b) => b.weight - a.weight);
  weaknesses.sort((a, b) => b.weight - a.weight);
  opportunities.sort((a, b) => b.weight - a.weight);
  threats.sort((a, b) => b.weight - a.weight);

  // Strengths force-fill: best position by rank if not already covered.
  if (strengths.length < 3) {
    const ranked = SKILL.slice().sort((a, b) => posRank[a] - posRank[b]);
    for (const pos of ranked) {
      if (strengths.length >= 3) break;
      if (strengths.some((s) => s.headline.includes(POSITION_LABEL[pos]))) continue;
      const r = posRank[pos];
      const myCount = me.position_counts[pos] ?? 0;
      strengths.push({
        voice: "statistician",
        headline: `Best position: ${POSITION_LABEL[pos]} (${ord(r)} of ${totalTeams})`,
        evidence: `Your strongest relative position. ${myCount} on roster vs league median ${posMed[pos].toFixed(1)}.`,
        play: `Even if not top-3, this is your most defensible asset class. Don't trade ${POSITION_LABEL[pos]} away to fill weaker spots.`,
        weight: 40 - r,
      });
    }
  }
  // Strengths force-fill: composite rank if mid-pack.
  if (strengths.length < 3) {
    const composite = me.win_now + me.future;
    strengths.push({
      voice: "gambler",
      headline: `Mid-pack durability (composite ${ord(myCompositeRank)} of ${totalTeams})`,
      evidence: `Win-now ${me.win_now} + future ${me.future} = ${composite}. Not a top bet, but no glaring betting line against you either.`,
      play: `Mid-pack rosters win by avoiding mistakes. Trade for fit, not for splash. Defend EV.`,
      weight: 35,
    });
  }

  // Weaknesses force-fill: worst position by rank.
  if (weaknesses.length < 3) {
    const ranked = SKILL.slice().sort((a, b) => posRank[b] - posRank[a]);
    for (const pos of ranked) {
      if (weaknesses.length >= 3) break;
      if (weaknesses.some((w) => w.headline.includes(POSITION_LABEL[pos]))) continue;
      const r = posRank[pos];
      const myCount = me.position_counts[pos] ?? 0;
      weaknesses.push({
        voice: "statistician",
        headline: `Weakest position: ${POSITION_LABEL[pos]} (${ord(r)} of ${totalTeams})`,
        evidence: `Your thinnest relative position. ${myCount} on roster vs league median ${posMed[pos].toFixed(1)}, max ${posMax[pos]}.`,
        play: `Even if not bottom-3, this is your most fragile asset class. Address via draft or trade before week 4.`,
        weight: 40 - (totalTeams - r),
      });
    }
  }
  // Weaknesses force-fill: age cliff. avg_age > 27 = aging-roster gambler take.
  if (weaknesses.length < 3 && me.avg_age != null && me.avg_age >= 27) {
    weaknesses.push({
      voice: "gambler",
      headline: `Roster age (${me.avg_age.toFixed(1)} avg)`,
      evidence: `Above 27 avg = aging cohort. Future score ${me.future} reflects the cliff.`,
      play: `Don't accumulate more aging vets. Pivot to rookie picks or sub-25 trades to extend the window.`,
      weight: 30,
    });
  }
  // Weaknesses force-fill: composite mid-pack as soft observation.
  if (weaknesses.length < 3) {
    weaknesses.push({
      voice: "coach",
      headline: `No top-tier anchor (composite ${ord(myCompositeRank)} of ${totalTeams})`,
      evidence: `No position where you're #1, no composite rank ≤ 3. Rosters that win without an anchor need flawless management.`,
      play: `Identify the position you can credibly become #1 at via 1-2 trades. Without an anchor, EV depends on perfect lineup decisions.`,
      weight: 25,
    });
  }

  // Opportunities force-fill: any team thin at any position vs your median+.
  if (opportunities.length < 3) {
    for (const pos of SKILL) {
      if (opportunities.length >= 3) break;
      const myCount = me.position_counts[pos] ?? 0;
      if (myCount < posMed[pos]) continue;
      const thinTeams = others.filter(
        (t) => (t.position_counts[pos] ?? 0) <= 2 && (t.position_counts[pos] ?? 0) < myCount,
      );
      if (thinTeams.length === 0) continue;
      if (opportunities.some((o) => o.headline.includes(POSITION_LABEL[pos]))) continue;
      const names = thinTeams
        .slice(0, 3)
        .map((t) => t.owner_name ?? "?")
        .join(", ");
      opportunities.push({
        voice: "statistician",
        headline: `Soft trade lane at ${POSITION_LABEL[pos]} (${thinTeams.length} thinner team${thinTeams.length === 1 ? "" : "s"})`,
        evidence: `${names} have fewer ${POSITION_LABEL[pos]}s than you. Smaller asymmetry, but still in your favor.`,
        play: `Watch for in-season catalyst (injury, breakout) that flips a soft lane into a real trade window.`,
        weight: 30 + thinTeams.length * 3,
      });
    }
  }
  // Opportunities force-fill: any rebuild-trajectory team in the league.
  if (opportunities.length < 3) {
    const rebuilders = others.filter(
      (t) => t.trajectory === "rising" && t.win_now + t.future <= myComposite - 10,
    );
    if (rebuilders.length > 0) {
      const top = rebuilders.sort((a, b) => b.future - a.future)[0];
      opportunities.push({
        voice: "gambler",
        headline: `${top.owner_name ?? "Rebuilder"} priced as a future bet`,
        evidence: `They're trajectory rising but still below your composite. Their future score ${top.future}; they're a long-window bidder.`,
        play: `Approach with a "your win-now for my future picks" frame. They're optimizing for 2027-28 and will pay above-market for proven assets.`,
        weight: 40,
      });
    }
  }
  if (opportunities.length < 3) {
    opportunities.push({
      voice: "coach",
      headline: `No standout opportunity yet`,
      evidence: `Roster shapes haven't diverged enough across the league. Re-check after week 1 + first injury wave.`,
      play: `In-season flux creates trade lanes the pre-season doesn't. Stay patient; the opportunities show up on the catalysts.`,
      weight: 15,
    });
  }

  // Threats force-fill: highest composite rival even if not within 15.
  if (threats.length < 3) {
    const sortedRivals = others
      .slice()
      .sort((a, b) => b.win_now + b.future - (a.win_now + a.future));
    for (const r of sortedRivals) {
      if (threats.length >= 3) break;
      if (threats.some((t) => t.headline.includes(r.owner_name ?? "?"))) continue;
      const composite = r.win_now + r.future;
      const gap = myComposite - composite;
      threats.push({
        voice: "statistician",
        headline: `${r.owner_name ?? "Rival"} sits ${gap >= 0 ? "below" : "above"} you (composite ${composite})`,
        evidence: `Gap of ${Math.abs(gap)} on the composite scale. ${gap >= 0 ? "Closing rival." : "Above-bracket competition."}`,
        play: `${gap >= 0 ? "Track their picks; they're the most likely to converge with you." : "They're the bracket above. Don't trade up to chase; build asymmetric edge."}`,
        weight: 25 + Math.max(0, 20 - Math.abs(gap)),
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Cap each quadrant at 4 items. Compose posture line.
  // ─────────────────────────────────────────────────────────────────
  const sCap = strengths.slice(0, 4);
  const wCap = weaknesses.slice(0, 4);
  const oCap = opportunities.slice(0, 4);
  const tCap = threats.slice(0, 4);

  // Posture: anchored on composite rank, then voiced.
  const composite = me.win_now + me.future;
  let posture: string;
  if (myCompositeRank <= 3) {
    posture = `Contender posture (composite ${ord(myCompositeRank)} of ${totalTeams}, score ${composite}). ${sCap.length} strengths to leverage; ${wCap.length} gaps to defend. Don't lose the window to overcorrection.`;
  } else if (myCompositeRank >= totalTeams - 2) {
    posture = `Longshot posture (composite ${ord(myCompositeRank)} of ${totalTeams}, score ${composite}). ${wCap.length} structural gaps. Choose your bet: accelerate via trade-up, or sell win-now for capital. Don't sit between.`;
  } else {
    posture = `Mid-pack posture (composite ${ord(myCompositeRank)} of ${totalTeams}, score ${composite}). ${sCap.length} edges, ${wCap.length} gaps, ${oCap.length} opportunities. Pick the lane you can credibly become #1 in; don't chase every gap.`;
  }

  return {
    strengths: sCap,
    weaknesses: wCap,
    opportunities: oCap,
    threats: tCap,
    posture,
    me_owner: meOwner,
  };
}
