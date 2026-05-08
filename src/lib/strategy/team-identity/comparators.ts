/**
 * Comparator team narrative. Matches the user's roster shape against
 * a curated library of historical NFL team profiles so the panel can
 * say "Your team profile looks like 2024 Lions" with a defensible
 * similarity score.
 *
 * Per founder direction 2026-05-08: characterizing the team is core
 * mission; a relatable NFL-team comparator is the kind of frame that
 * makes a screenshot feel like a verdict and gives the user a mental
 * model for their own roster's strengths and weaknesses.
 *
 * The comparator library is hand-curated to capture distinct fantasy
 * shapes (bellcow vs committee RB, anchor vs spread WR, anchor TE
 * present or absent, elite vs mid QB, young vs balanced). Cosine
 * similarity over a normalized feature vector picks the closest
 * match. Matches above CONFIDENCE_FLOOR surface; below the floor
 * the comparator is null and the panel says "no clear comparator yet."
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type { Position } from "@/lib/strategy/archetypes/schema";

const SCORING_POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];
const CONFIDENCE_FLOOR = 0.85;

export type ComparatorMatch = {
  team: string;
  season: number;
  // 0..1 cosine similarity. Surfaced when >= CONFIDENCE_FLOOR.
  similarity: number;
  // Plain-English description that the panel renders. Names what about
  // the comparator's shape resembles the user's roster.
  narrative: string;
  // Honest sub-line for confidence. "Strong match" / "Loose match."
  confidence_label: "strong" | "loose";
};

type FeatureVector = {
  qb_strength: number;
  rb_bellcow: number;
  rb_value_total: number;
  wr_top_heavy: number;
  wr_value_total: number;
  te_anchor: number;
  young_skew: number;
  old_skew: number;
  starter_value_density: number;
};

const FEATURE_KEYS: Array<keyof FeatureVector> = [
  "qb_strength",
  "rb_bellcow",
  "rb_value_total",
  "wr_top_heavy",
  "wr_value_total",
  "te_anchor",
  "young_skew",
  "old_skew",
  "starter_value_density",
];

type Comparator = {
  team: string;
  season: number;
  vector: FeatureVector;
  // Narrative templates: each describes a recognizable feature of the
  // comparator team. The matcher picks the 1-2 most resonant for the
  // user's specific match.
  notes: string[];
};

// Hand-curated library. Each profile reflects the actual fantasy
// shape of that NFL season's team (FantasyPros / KTC era data).
// Vectors normalized 0..1. Adding teams: keep the vector tight to
// real season production, not aspirational. Notes should be testable
// claims a fan would recognize.
const COMPARATORS: Comparator[] = [
  {
    team: "Lions",
    season: 2024,
    vector: {
      qb_strength: 0.55,
      rb_bellcow: 0.45,
      rb_value_total: 0.85,
      wr_top_heavy: 0.65,
      wr_value_total: 0.85,
      te_anchor: 0.85,
      young_skew: 0.55,
      old_skew: 0.25,
      starter_value_density: 0.85,
    },
    notes: [
      "RB committee that totals more than most bellcows (Gibbs + Montgomery).",
      "Top-tier WR1 anchoring a deep pass game (St. Brown, then Williams).",
      "Anchor TE you start every week (LaPorta).",
      "Mid-tier QB carried by surrounding talent (Goff).",
    ],
  },
  {
    team: "49ers",
    season: 2023,
    vector: {
      qb_strength: 0.55,
      rb_bellcow: 0.95,
      rb_value_total: 0.95,
      wr_top_heavy: 0.55,
      wr_value_total: 0.75,
      te_anchor: 0.90,
      young_skew: 0.40,
      old_skew: 0.40,
      starter_value_density: 0.90,
    },
    notes: [
      "Elite bellcow RB carrying the offense (McCaffrey).",
      "Anchor TE in the top tier (Kittle).",
      "Spread WR room with two reliable starters (Aiyuk + Samuel).",
      "Mid QB whose weekly upside comes from scheme + supporting cast (Purdy).",
    ],
  },
  {
    team: "Bills",
    season: 2024,
    vector: {
      qb_strength: 0.95,
      rb_bellcow: 0.45,
      rb_value_total: 0.65,
      wr_top_heavy: 0.45,
      wr_value_total: 0.55,
      te_anchor: 0.50,
      young_skew: 0.55,
      old_skew: 0.25,
      starter_value_density: 0.75,
    },
    notes: [
      "Elite QB doing the heaviest lifting (Allen).",
      "RB committee with a clear lead but no bellcow (Cook).",
      "WR room built on volume and committee, not a single alpha.",
      "Mid-tier TE in a passing game.",
    ],
  },
  {
    team: "Eagles",
    season: 2024,
    vector: {
      qb_strength: 0.85,
      rb_bellcow: 0.95,
      rb_value_total: 0.95,
      wr_top_heavy: 0.85,
      wr_value_total: 0.90,
      te_anchor: 0.65,
      young_skew: 0.45,
      old_skew: 0.30,
      starter_value_density: 0.95,
    },
    notes: [
      "Top-shelf RB workhorse anchoring the offense (Saquon).",
      "Two-WR alpha pairing where both finish top-12 (Brown + Smith).",
      "Dual-threat QB with rushing floor (Hurts).",
      "Mid-tier TE who matters in red zone (Goedert).",
    ],
  },
  {
    team: "Ravens",
    season: 2024,
    vector: {
      qb_strength: 0.95,
      rb_bellcow: 0.85,
      rb_value_total: 0.85,
      wr_top_heavy: 0.55,
      wr_value_total: 0.55,
      te_anchor: 0.85,
      young_skew: 0.40,
      old_skew: 0.45,
      starter_value_density: 0.85,
    },
    notes: [
      "Elite dual-threat QB with rushing floor (Lamar).",
      "Aging bellcow workhorse RB (Henry, age 30+ but still volume).",
      "Anchor TE who plays week-one starter (Andrews).",
      "WR room is functional but not the focal point.",
    ],
  },
  {
    team: "Chiefs",
    season: 2023,
    vector: {
      qb_strength: 0.95,
      rb_bellcow: 0.55,
      rb_value_total: 0.55,
      wr_top_heavy: 0.40,
      wr_value_total: 0.65,
      te_anchor: 0.95,
      young_skew: 0.50,
      old_skew: 0.35,
      starter_value_density: 0.80,
    },
    notes: [
      "Elite QB who elevates a thin supporting cast (Mahomes).",
      "Anchor TE on the Mount Rushmore tier (Kelce).",
      "Spread WR room without a true alpha; volume distributed.",
      "RB room with role security but no bellcow workload.",
    ],
  },
  {
    team: "Bengals",
    season: 2023,
    vector: {
      qb_strength: 0.85,
      rb_bellcow: 0.65,
      rb_value_total: 0.65,
      wr_top_heavy: 0.95,
      wr_value_total: 0.95,
      te_anchor: 0.30,
      young_skew: 0.55,
      old_skew: 0.30,
      starter_value_density: 0.85,
    },
    notes: [
      "Elite QB-WR1 stack defining the offense (Burrow + Chase).",
      "Two-deep WR alpha pairing both finishing top-15 (Chase + Higgins).",
      "Lead RB with role but not a featured workload.",
      "TE room is functional, never the engine.",
    ],
  },
  {
    team: "Dolphins",
    season: 2023,
    vector: {
      qb_strength: 0.70,
      rb_bellcow: 0.40,
      rb_value_total: 0.65,
      wr_top_heavy: 0.95,
      wr_value_total: 0.95,
      te_anchor: 0.20,
      young_skew: 0.65,
      old_skew: 0.20,
      starter_value_density: 0.80,
    },
    notes: [
      "Top-shelf WR1 + complementary alpha WR2 (Hill + Waddle).",
      "RB committee with split rush + receiving (Achane + Mostert).",
      "QB carried by scheme + speed (Tua).",
      "TE room is a dead spot.",
    ],
  },
  {
    team: "Cowboys",
    season: 2023,
    vector: {
      qb_strength: 0.80,
      rb_bellcow: 0.50,
      rb_value_total: 0.55,
      wr_top_heavy: 0.95,
      wr_value_total: 0.85,
      te_anchor: 0.40,
      young_skew: 0.40,
      old_skew: 0.45,
      starter_value_density: 0.75,
    },
    notes: [
      "Top-tier WR1 carrying the pass game (Lamb).",
      "Mid-tier QB whose ceiling is matchup dependent (Prescott).",
      "RB room thin once Pollard left (a depth liability).",
      "TE room functional, never featured.",
    ],
  },
  {
    team: "Vikings",
    season: 2024,
    vector: {
      qb_strength: 0.55,
      rb_bellcow: 0.35,
      rb_value_total: 0.50,
      wr_top_heavy: 0.95,
      wr_value_total: 0.85,
      te_anchor: 0.55,
      young_skew: 0.55,
      old_skew: 0.30,
      starter_value_density: 0.75,
    },
    notes: [
      "WR1-driven offense with elite alpha (Jefferson).",
      "RB committee, no clear workhorse.",
      "Mid-tier QB and supporting cast (Darnold breakout year).",
      "Mid-tier TE that matters in red zone.",
    ],
  },
];

export function buildUserFeatureVector(args: {
  snap: LeagueSnapshot;
  playerValueMap: Map<string, { value: number }>;
  playerAges: Map<string, number | null>;
  playerPositions: Map<string, Position | null>;
}): FeatureVector | null {
  const { snap, playerValueMap, playerAges, playerPositions } = args;
  const myRoster = snap.rosters.find((r) => r.is_me);
  if (!myRoster) return null;
  const playerIds = myRoster.player_ids ?? [];
  if (playerIds.length === 0) return null;

  const valuesByPos: Record<Position, number[]> = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
    K: [],
    DST: [],
  };
  let youngCount = 0;
  let oldCount = 0;
  let agedTotal = 0;

  for (const id of playerIds) {
    const pos = playerPositions.get(id);
    if (!pos || !SCORING_POSITIONS.includes(pos)) continue;
    const v = playerValueMap.get(id);
    valuesByPos[pos].push(v?.value ?? 0);
    const age = playerAges.get(id);
    if (typeof age === "number") {
      agedTotal++;
      if (age <= 24) youngCount++;
      if (age >= 28) oldCount++;
    }
  }

  // Sort each position's values descending for top/total math.
  for (const pos of SCORING_POSITIONS) {
    valuesByPos[pos].sort((a, b) => b - a);
  }

  const topQb = valuesByPos.QB[0] ?? 0;
  const topRb = valuesByPos.RB[0] ?? 0;
  const totalRb = valuesByPos.RB.reduce((s, v) => s + v, 0);
  const topWr = valuesByPos.WR[0] ?? 0;
  const totalWr = valuesByPos.WR.reduce((s, v) => s + v, 0);
  const topTe = valuesByPos.TE[0] ?? 0;

  const rbBellcow = totalRb > 0 ? topRb / totalRb : 0;
  const wrTopHeavy = totalWr > 0 ? topWr / totalWr : 0;

  // Starter density = mean value of the user's projected starters
  // (top-N at each position by format) / 100. Drives "top-heavy
  // contender" vs "deep but capped" reads.
  const reqs = effectiveStartersFor(snap);
  let starterValueSum = 0;
  let starterCount = 0;
  for (const pos of SCORING_POSITIONS) {
    const need = reqs[pos] ?? 0;
    const sortedValues = valuesByPos[pos];
    for (let i = 0; i < need && i < sortedValues.length; i++) {
      starterValueSum += sortedValues[i];
      starterCount++;
    }
  }
  const starterDensity = starterCount > 0 ? starterValueSum / starterCount / 100 : 0;

  return {
    qb_strength: clamp01(topQb / 100),
    rb_bellcow: clamp01(rbBellcow),
    rb_value_total: clamp01(totalRb / 200),
    wr_top_heavy: clamp01(wrTopHeavy),
    wr_value_total: clamp01(totalWr / 250),
    te_anchor: clamp01(topTe / 100),
    young_skew: agedTotal > 0 ? clamp01(youngCount / agedTotal) : 0,
    old_skew: agedTotal > 0 ? clamp01(oldCount / agedTotal) : 0,
    starter_value_density: clamp01(starterDensity),
  };
}

export function findBestComparator(user: FeatureVector): ComparatorMatch | null {
  let best: { comp: Comparator; sim: number } | null = null;
  for (const comp of COMPARATORS) {
    const sim = cosineSimilarity(user, comp.vector);
    if (!best || sim > best.sim) best = { comp, sim };
  }
  if (!best) return null;
  if (best.sim < CONFIDENCE_FLOOR) {
    return null;
  }
  // Pick the 1-2 most resonant notes for this user. A note is more
  // resonant when the comparator dimension it talks about is also
  // strong on the user's vector. Heuristic: rank notes by the
  // comparator's vector value at the indexed dimension, top 2.
  const noteRanking = rankNotesForUser(user, best.comp);
  const topNotes = noteRanking.slice(0, 2);
  const narrative = topNotes.length > 0 ? topNotes.join(" ") : best.comp.notes[0] ?? "";
  return {
    team: best.comp.team,
    season: best.comp.season,
    similarity: round3(best.sim),
    narrative,
    confidence_label: best.sim >= 0.92 ? "strong" : "loose",
  };
}

function rankNotesForUser(user: FeatureVector, comp: Comparator): string[] {
  // Each note is associated with the comparator dimension it most
  // describes. We score the note by how well-aligned that dimension
  // is between user and comparator (low absolute difference = high
  // resonance).
  const noteToKey: Array<keyof FeatureVector> = [];
  for (const note of comp.notes) {
    const lower = note.toLowerCase();
    if (lower.includes("qb")) noteToKey.push("qb_strength");
    else if (lower.includes("bellcow") || lower.includes("workhorse")) noteToKey.push("rb_bellcow");
    else if (lower.includes("rb committee") || lower.includes("rb")) noteToKey.push("rb_value_total");
    else if (lower.includes("wr1") || lower.includes("alpha") || lower.includes("top-shelf")) noteToKey.push("wr_top_heavy");
    else if (lower.includes("wr")) noteToKey.push("wr_value_total");
    else if (lower.includes("anchor te") || lower.includes("anchor tight") || lower.includes("kelce") || lower.includes("kittle") || lower.includes("laporta") || lower.includes("andrews")) noteToKey.push("te_anchor");
    else noteToKey.push("starter_value_density");
  }
  const scored = comp.notes.map((note, i) => {
    const key = noteToKey[i];
    const userVal = user[key];
    const compVal = comp.vector[key];
    // High resonance: both user and comparator are strong on this
    // dimension (avg high + small gap).
    const resonance = (userVal + compVal) / 2 - Math.abs(userVal - compVal);
    return { note, resonance };
  });
  scored.sort((a, b) => b.resonance - a.resonance);
  return scored.map((s) => s.note);
}

function cosineSimilarity(a: FeatureVector, b: FeatureVector): number {
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (const k of FEATURE_KEYS) {
    const av = a[k];
    const bv = b[k];
    dot += av * bv;
    aMag += av * av;
    bMag += bv * bv;
  }
  if (aMag === 0 || bMag === 0) return 0;
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Local effectiveStartersFor avoids a circular import. Mirrors the
// canonical helper for the keys we need (QB / RB / WR / TE only;
// starter density doesn't need K / DST). If the league has 0 hard
// at a position we still allow flex/superflex to populate via flex
// share, mimicking the canonical behavior for top-N.
function effectiveStartersFor(snap: LeagueSnapshot): Record<Position, number> {
  const reqs: Record<Position, number> = {
    QB: snap.starter_slots.hard.QB ?? 0,
    RB: snap.starter_slots.hard.RB ?? 0,
    WR: snap.starter_slots.hard.WR ?? 0,
    TE: snap.starter_slots.hard.TE ?? 0,
    K: 0,
    DST: 0,
  };
  // Add superflex to QB demand.
  reqs.QB += snap.starter_slots.superflex ?? 0;
  // Distribute flex across RB / WR / TE proportionally so
  // starter density picks up flex starters too.
  const flexCount = snap.starter_slots.flex ?? 0;
  if (flexCount > 0) {
    const flexShare = flexCount / 3;
    reqs.RB += Math.round(flexShare);
    reqs.WR += Math.round(flexShare);
    reqs.TE += Math.round(flexCount - 2 * Math.round(flexShare));
  }
  return reqs;
}
