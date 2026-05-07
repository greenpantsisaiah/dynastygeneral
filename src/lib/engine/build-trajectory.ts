/**
 * Build trajectory: emergent read of where the user's roster is
 * heading, computed from their actual picks rather than a declared
 * window. Per founder ultrathink 2026-04-27: "win-now/later isn't a
 * choice; it's an emergent observation. My picks reveal the path."
 *
 * Two signals composited into one trajectory:
 *   - Composition: % future / balanced / win-now across ALL of the
 *     user's picks this draft. Stable, full-roster read.
 *   - Trend: lane classification of the LAST 3 picks. Tells the user
 *     whether they're currently steering OR holding.
 *
 * Lane classification per pick:
 *   future    is_rookie, years_exp <= 1, OR age <= 23
 *   win-now   age >= 27
 *   balanced  age 24-26
 *
 * Boundary set at 27 (not 28) per founder feedback 2026-04-27 live
 * draft pick 19.11: a 27yo established starter (Jerry Jeudy) was
 * being bucketed to "balanced" while a 37yo backup QB (Kirk Cousins)
 * was the only candidate populating "win-now." Win-now should mean
 * "starts now, declining future runway" not just "old"; most NFL
 * skill positions are in mild decline by 27 (RB peak ~24-25, WR peak
 * ~26), so 27+ captures veterans whose 2025 contribution is the
 * primary asset and whose dynasty horizon is shorter than the
 * already-played career length. Age 24-26 stays in balanced as the
 * actual "prime + future runway" cohort.
 *
 * Output shape replaces "LEAN HEAVILY WIN-NOW · 16 below win-now
 * target" with something like "BUILD: Future Lean · Last 3: future,
 * future, balanced." The user sees their own behavior reflected back,
 * not an algorithmic declaration they have to obey.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";

export type TimelineLane = "win-now" | "balanced" | "future";

export type BuildTrajectory = {
  /** Total picks the user has made this draft. 0 = pre-draft. */
  pick_count: number;
  /** Lane breakdown across ALL user picks this draft. */
  composition: { winNow: number; balanced: number; future: number };
  /** Lane labels for the last up-to-3 picks (most recent first). */
  recent_lanes: TimelineLane[];
  /** Composite build label, derived from composition. */
  build_label:
    | "Pre-Draft"
    | "Future Build"
    | "Future Lean"
    | "Balanced Build"
    | "Win-Now Lean"
    | "Win-Now Build";
  /** Direction read from recent_lanes. */
  trend_label:
    | "No data yet"
    | "Mixed direction"
    | "Leaning Future"
    | "Trending Future"
    | "Leaning Win-Now"
    | "Trending Win-Now"
    | "Holding Balanced";
};

export function classifyLane(pick: {
  age: number | null;
  years_exp: number | null;
}): TimelineLane {
  if (pick.years_exp != null && pick.years_exp <= 1) return "future";
  if (pick.age != null && pick.age <= 23) return "future";
  if (pick.age != null && pick.age >= 27) return "win-now";
  return "balanced";
}

/**
 * Format-aware lane definition (label + blurb + tone). The engine's
 * classifier is age-based and stays the same across formats; only
 * the user-facing rendering shifts. Per founder ask 2026-05-07:
 * "future" framing isn't relevant in keeper / redraft formats and
 * may bias the user away from the right pick.
 *
 * Dynasty (default): WIN-NOW / BALANCED / FUTURE
 * Keeper (low max <= 4): WIN-NOW / TRADE-FLEX / KEEPER-LOCK
 * Keeper (max >= 5): close to dynasty (WIN-NOW / BALANCED / FUTURE)
 * Redraft: LOCK / CEILING / DEPTH
 *
 * The internal IDs ("win-now" / "balanced" / "future") are stable
 * across formats so existing lane-routing logic (emphasisLane,
 * trajectory composition, byLane) keeps working unchanged.
 */
export type LaneDefinition = {
  id: TimelineLane;
  label: string;
  blurb: string;
  tone: "warning" | "neutral" | "success";
};

export function laneDefinitionsForFormat(
  leagueType: "dynasty" | "keeper" | "redraft" | "unknown",
  maxKeepers: number | null,
): LaneDefinition[] {
  if (leagueType === "redraft") {
    return [
      {
        id: "win-now",
        label: "Lock",
        blurb: "Proven Week-1 starter floor",
        tone: "warning",
      },
      {
        id: "balanced",
        label: "Ceiling",
        blurb: "High upside this season",
        tone: "neutral",
      },
      {
        id: "future",
        label: "Depth",
        blurb: "Insurance / late-round value",
        tone: "success",
      },
    ];
  }
  if (leagueType === "keeper" && maxKeepers != null && maxKeepers <= 4) {
    return [
      {
        id: "win-now",
        label: "Win-Now",
        blurb: "Proven, starts now",
        tone: "warning",
      },
      {
        id: "balanced",
        label: "Trade-Flex",
        blurb: "Productive but not your keeper lock",
        tone: "neutral",
      },
      {
        id: "future",
        label: "Keeper-Lock",
        blurb: `Cornerstone-tier; ${maxKeepers}-keeper candidate`,
        tone: "success",
      },
    ];
  }
  // Dynasty + keeper-with-many-keepers: original framing.
  return [
    {
      id: "win-now",
      label: "Win-Now",
      blurb: "Proven, starts now",
      tone: "warning",
    },
    {
      id: "balanced",
      label: "Balanced",
      blurb: "Productive across both windows",
      tone: "neutral",
    },
    {
      id: "future",
      label: "Future",
      blurb: "Young upside, building",
      tone: "success",
    },
  ];
}

export function buildTrajectory(snap: LeagueSnapshot): BuildTrajectory {
  const myRosterId = snap.my_roster_id;
  if (myRosterId == null) {
    return emptyTrajectory();
  }
  const myPicks = snap.draft.picks_made
    .filter((p) => p.roster_id === myRosterId)
    .sort((a, b) => a.pick_no - b.pick_no);

  if (myPicks.length === 0) return emptyTrajectory();

  let winNow = 0;
  let balanced = 0;
  let future = 0;
  for (const p of myPicks) {
    const lane = classifyLane(p);
    if (lane === "win-now") winNow++;
    else if (lane === "balanced") balanced++;
    else future++;
  }

  const recent_lanes: TimelineLane[] = myPicks
    .slice(-3)
    .reverse()
    .map((p) => classifyLane(p));

  const total = myPicks.length;
  const futurePct = future / total;
  const winNowPct = winNow / total;
  let build_label: BuildTrajectory["build_label"];
  if (futurePct >= 0.55) build_label = "Future Build";
  else if (futurePct >= 0.4) build_label = "Future Lean";
  else if (winNowPct >= 0.55) build_label = "Win-Now Build";
  else if (winNowPct >= 0.4) build_label = "Win-Now Lean";
  else build_label = "Balanced Build";

  let trend_label: BuildTrajectory["trend_label"];
  if (recent_lanes.length === 0) {
    trend_label = "No data yet";
  } else {
    const futureRecent = recent_lanes.filter((l) => l === "future").length;
    const winNowRecent = recent_lanes.filter((l) => l === "win-now").length;
    const balancedRecent = recent_lanes.filter((l) => l === "balanced").length;
    if (recent_lanes.length >= 3 && futureRecent === 3) trend_label = "Trending Future";
    else if (recent_lanes.length >= 3 && winNowRecent === 3) trend_label = "Trending Win-Now";
    else if (recent_lanes.length >= 3 && balancedRecent === 3) trend_label = "Holding Balanced";
    else if (futureRecent >= 2) trend_label = "Leaning Future";
    else if (winNowRecent >= 2) trend_label = "Leaning Win-Now";
    else trend_label = "Mixed direction";
  }

  return {
    pick_count: total,
    composition: { winNow, balanced, future },
    recent_lanes,
    build_label,
    trend_label,
  };
}

function emptyTrajectory(): BuildTrajectory {
  return {
    pick_count: 0,
    composition: { winNow: 0, balanced: 0, future: 0 },
    recent_lanes: [],
    build_label: "Pre-Draft",
    trend_label: "No data yet",
  };
}
