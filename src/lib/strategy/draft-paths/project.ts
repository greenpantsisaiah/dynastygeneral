/**
 * Draft path projection engine. Given the user's next N owned slots,
 * their tuned dials, the rookie class strength, and the current
 * available pool, generates 3-5 candidate positional sequences ranked
 * by expected value.
 *
 * Per founder direction 2026-05-16: "projecting their full draft or
 * at least the next 5 picks might be really valuable here. Target
 * this player here, and these players there, given the field."
 *
 * Algorithm:
 *   1. Resolve the user's next N owned picks (default 5) via the
 *      canonical my_pick_schedule snapshot field.
 *   2. Build a fresh available pool, with each player carrying a
 *      survival probability for each of the user's slots.
 *   3. Generate canonical archetype sequences (best-player-available,
 *      anchor-RB, zero-RB, superflex-QB-first, TE-premium-lock, etc.)
 *      filtered by format and roster needs.
 *   4. For each archetype, walk the sequence: pick the highest
 *      expected_value player matching the position at each slot,
 *      then remove that player from subsequent slot pools.
 *   5. Score each completed path; rank.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import { getAvailableForRequest } from "@/lib/strategy/player-suggestions/enrich";
import type { AvailablePlayer } from "@/lib/players/available";
import { resolvePlayerValues } from "@/lib/players/values";
import type { WhyDials } from "@/lib/rankings/why-breakdown";
import type {
  ClassStrength,
  ClassStrengthPosition,
} from "@/lib/strategy/class-strength/compute";
import type {
  DraftPath,
  DraftPathProjection,
  PathCandidate,
  PathDialInfluence,
  PathPick,
  PathPosition,
} from "./types";

const POSITIONS: PathPosition[] = ["QB", "RB", "WR", "TE"];

/** Default count of picks to project ahead. */
const DEFAULT_PICKS_AHEAD = 5;

/** Cap on candidates per pick in the path output. */
const MAX_CANDIDATES_PER_PICK = 3;

function labelForPickNo(pickNo: number, teams: number): string {
  const round = Math.ceil(pickNo / teams);
  const within = ((pickNo - 1) % teams) + 1;
  return `${round}.${within < 10 ? `0${within}` : within}`;
}

/**
 * Probability a player at ADP A is still available at target_pick P,
 * given a position-run multiplier (1.0 = baseline, >1 = run on this
 * position making the player scarcer, <1 = depressed making them
 * easier to land).
 *
 * Model: logistic on (adp - target_pick) / variance. Variance grows
 * with depth (later picks have wider ADP dispersion). Position-run
 * multiplier compresses survival downward for in-demand positions.
 */
export function survivalAtPick(args: {
  adp: number | null;
  targetPickNo: number;
  positionRunMultiplier: number;
}): number {
  if (args.adp == null) return 0.5;
  // Variance grows with depth. Empirically: top-12 picks have ~±3
  // variance; pick 50 has ~±8; pick 100 has ~±12.
  const variance = Math.max(3, Math.sqrt(args.adp) * 1.3);
  const gap = args.adp - args.targetPickNo;
  const z = gap / variance;
  let pct = 1 / (1 + Math.exp(-z));
  // Position-run adjustment: when a position is running (multiplier
  // > 1), it gets scarcer; when depressed (< 1) it's more available.
  // Inverted: high run multiplier reduces survival.
  pct = pct * (2.0 - args.positionRunMultiplier);
  return Math.max(0.02, Math.min(0.98, pct));
}

/**
 * Per-position run multiplier based on the recent draft window.
 * 1.0 = baseline. > 1 = position running hot. < 1 = depressed.
 */
function computePositionRunMultiplier(
  snap: LeagueSnapshot,
): Record<PathPosition, number> {
  const window = snap.draft.picks_made.slice(-snap.total_teams);
  const counts: Record<PathPosition, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
  };
  for (const p of window) {
    const pos = (p.position ?? "").toUpperCase();
    if (POSITIONS.includes(pos as PathPosition)) {
      counts[pos as PathPosition]++;
    }
  }
  const total = window.length;
  if (total === 0) {
    return { QB: 1, RB: 1, WR: 1, TE: 1 };
  }
  const expected = total / 4;
  const out: Record<PathPosition, number> = {
    QB: 1,
    RB: 1,
    WR: 1,
    TE: 1,
  };
  for (const pos of POSITIONS) {
    if (expected > 0) {
      out[pos] = counts[pos] / expected;
    }
  }
  return out;
}

/**
 * Position requirements / preferences derived from the user's roster
 * + league format. Returns a "fit weight" per position [0..2] that
 * biases path scoring toward where the user actually needs production.
 */
function computeRosterFit(snap: LeagueSnapshot): Record<PathPosition, number> {
  const me = snap.rosters.find((r) => r.is_me);
  if (!me) return { QB: 1, RB: 1, WR: 1, TE: 1 };
  const counts = me.position_counts;
  const isSuperflex =
    snap.format === "superflex" || snap.format === "2qb";
  const fit: Record<PathPosition, number> = {
    QB: 1,
    RB: 1,
    WR: 1,
    TE: 1,
  };
  // SF QB premium: if SF AND fewer than 2 starting QBs, weight QB 1.5.
  if (isSuperflex && (counts.QB ?? 0) < 2) fit.QB = 1.5;
  // Standard need weights: more weight per missing starter.
  if ((counts.RB ?? 0) < 2) fit.RB = 1.35;
  if ((counts.WR ?? 0) < 3) fit.WR = 1.3;
  if ((counts.TE ?? 0) < 1) fit.TE = 1.25;
  // TE-premium adds 0.15 to TE fit.
  if (snap.scoring.includes("TE-premium")) fit.TE += 0.15;
  return fit;
}

/**
 * Per-position dial bias. Sums the dial weights that bias toward
 * each position. Used by the scoring layer to favor positions the
 * user's doctrine tilts toward.
 */
function dialBiasFor(args: {
  position: PathPosition;
  isRookie: boolean;
  age: number | null;
  dials: WhyDials;
}): { bias: number; influences: PathDialInfluence[] } {
  const { dials } = args;
  const influences: PathDialInfluence[] = [];
  // Youth dial: young player → positive weight when dial positive.
  let youthSignal = 0;
  if (args.age != null) {
    if (args.position === "RB") youthSignal = args.age <= 22 ? 1 : args.age <= 24 ? 0.7 : args.age <= 26 ? 0.3 : -0.5;
    else if (args.position === "WR") youthSignal = args.age <= 23 ? 1 : args.age <= 25 ? 0.7 : -0.3;
    else if (args.position === "TE") youthSignal = args.age <= 24 ? 1 : -0.2;
    else if (args.position === "QB") youthSignal = args.age <= 27 ? 0.6 : 0;
  }
  // Rookie tilt
  const rookieSignal = args.isRookie ? 1 : -0.4;
  // Horizon (future tilt for young players)
  const horizonSignal = args.isRookie || (args.age ?? 99) <= 24 ? 0.8 : -0.3;
  // Bellcow (RB-only, archetype is built from position rank elsewhere)
  // Skip in this helper; bellcow gets approximated via roster_fit.

  const youthContrib = (dials.youth / 100) * youthSignal * 10;
  const horizonContrib = (dials.horizon / 100) * horizonSignal * 10;
  const rookieContrib = (dials.rookie / 100) * rookieSignal * 8;

  if (Math.abs(youthContrib) >= 0.5) {
    influences.push({
      dial: "youth",
      label: `Youth ${dials.youth >= 0 ? "+" : ""}${dials.youth}`,
      delta: youthContrib,
    });
  }
  if (Math.abs(horizonContrib) >= 0.5) {
    influences.push({
      dial: "horizon",
      label: `Horizon ${dials.horizon >= 0 ? "+" : ""}${dials.horizon}`,
      delta: horizonContrib,
    });
  }
  if (Math.abs(rookieContrib) >= 0.5) {
    influences.push({
      dial: "rookie",
      label: `Rookie tilt ${dials.rookie >= 0 ? "+" : ""}${dials.rookie}`,
      delta: rookieContrib,
    });
  }

  return {
    bias: youthContrib + horizonContrib + rookieContrib,
    influences,
  };
}

/** Convert AvailablePlayer to PathCandidate at a target slot. */
function buildCandidate(args: {
  player: AvailablePlayer;
  targetPickNo: number;
  positionRunMultiplier: Record<PathPosition, number>;
  classStrengthByPos: Record<ClassStrengthPosition, number>;
  rosterFit: Record<PathPosition, number>;
  dials: WhyDials;
}): PathCandidate | null {
  const positionRaw = (args.player.position ?? "").toUpperCase();
  if (!POSITIONS.includes(positionRaw as PathPosition)) return null;
  const position = positionRaw as PathPosition;
  const survival = survivalAtPick({
    adp: args.player.adp,
    targetPickNo: args.targetPickNo,
    positionRunMultiplier: args.positionRunMultiplier[position] ?? 1,
  });
  // Value derived from FantasyCalc 0-100. Read from the player record
  // via the available pool's value field if present; fallback to a
  // search_rank-based proxy when value is missing.
  // (AvailablePlayer carries it indirectly; the pool builder upstream
  // ensures it's set.)
  // We pass value in via the player object's `value` field. The
  // current AvailablePlayer type doesn't expose `value` directly;
  // callers attach it before calling buildCandidate.
  const value =
    typeof (args.player as AvailablePlayer & { value?: number }).value ===
    "number"
      ? (args.player as AvailablePlayer & { value: number }).value
      : Math.max(1, 100 - args.player.dynasty_rank * 0.4);

  // Class strength multiplier applies ONLY to rookies. The
  // multipliers describe the strength of the rookie class at each
  // position; they shouldn't inflate veterans' values. Veteran
  // (years_exp > 0) values come from FantasyCalc as-is. Founder
  // report 2026-05-19: late-round veteran RBs were being boosted by
  // the RB class strength multiplier and dominating the BPA path.
  const classMult = args.player.is_rookie
    ? (args.classStrengthByPos[position] ?? 1)
    : 1;
  const fit = args.rosterFit[position] ?? 1;
  const bias = dialBiasFor({
    position,
    isRookie: args.player.is_rookie,
    age: args.player.age,
    dials: args.dials,
  });

  // Expected value composite:
  //   base_score = value × survival × class_strength × roster_fit
  //   bias_added = bias bonus from dial tilt
  const baseScore = value * survival * classMult * fit;
  const expectedValue = baseScore + bias.bias;

  return {
    player_id: args.player.id,
    name: args.player.name,
    position,
    team: args.player.team,
    age: args.player.age,
    is_rookie: args.player.is_rookie,
    adp: args.player.adp,
    adp_variant: args.player.adp_variant ?? null,
    value,
    survival,
    expected_value: Math.round(expectedValue * 100) / 100,
  };
}

/**
 * Canonical path archetypes. Each defines a positional preference
 * order; the projector walks the user's slots and at each slot picks
 * the highest-EV candidate matching the constraint.
 *
 * The `sequence_template` is a positional template applied across
 * slots. "BPA_*" archetypes leave one or more slots flexible (any
 * position) so the projector can fill with the best player available.
 */
type Archetype = {
  id: string;
  label: string;
  why: string;
  /** Sequence template across N slots. "any" = BPA, else fixed position. */
  build: (mySlotsCount: number) => Array<PathPosition | "any">;
  /** Format gate. */
  appliesTo: (snap: LeagueSnapshot) => boolean;
};

const ARCHETYPES: Archetype[] = [
  {
    id: "bpa",
    label: "Best Player Available",
    why: "Take the highest-value player on the board at every slot. Position-agnostic. Best when the field is unpredictable.",
    build: (n) => Array(n).fill("any"),
    appliesTo: () => true,
  },
  {
    id: "anchor_rb",
    label: "Anchor RB",
    why: "Lock the bellcow at slot 1, then stack WR depth. Defends against the RB cliff.",
    build: (n) => {
      const seq: Array<PathPosition | "any"> = ["RB"];
      for (let i = 1; i < n; i++) seq.push(i % 2 === 1 ? "WR" : "any");
      return seq;
    },
    appliesTo: () => true,
  },
  {
    id: "zero_rb",
    label: "Zero RB",
    why: "Pass on early RB for elite WR talent. Trust late-round RB lottery tickets + injury opportunity later.",
    build: (n) => {
      const seq: Array<PathPosition | "any"> = ["WR", "WR"];
      for (let i = 2; i < n; i++) seq.push(i < 4 ? "any" : "RB");
      return seq;
    },
    appliesTo: () => true,
  },
  {
    id: "sf_qb_first",
    label: "Superflex QB-first",
    why: "Lock a top-tier QB early. In SF, QB scarcity is the dominant constraint.",
    build: (n) => {
      const seq: Array<PathPosition | "any"> = ["QB"];
      for (let i = 1; i < n; i++) seq.push(i === 2 ? "QB" : "any");
      return seq;
    },
    appliesTo: (snap) =>
      snap.format === "superflex" || snap.format === "2qb",
  },
  {
    id: "te_premium",
    label: "TE-Premium Lock",
    why: "Take a top-end TE in your first two picks. TE-premium scoring inflates their value past consensus.",
    build: (n) => {
      const seq: Array<PathPosition | "any"> = ["TE", "any"];
      for (let i = 2; i < n; i++) seq.push("any");
      return seq;
    },
    appliesTo: (snap) => snap.scoring.includes("TE-premium"),
  },
];

/**
 * Pick the best candidate at this slot whose position matches the
 * archetype's slot constraint. Returns null if no candidate viable.
 *
 * Backup candidate behavior:
 * - When constraint is a specific position (e.g. "RB"), top3 returns
 *   the three highest-EV players at THAT position so the user sees
 *   "if my RB target is gone, here's my RB backup."
 * - When constraint is "any" (BPA archetype), top3 returns the
 *   highest-EV player at the recommendation's position PLUS the
 *   highest-EV player at each of the other 3 positions. This gives
 *   position diversity in the backup view so the user can compare
 *   "BPA RB at this slot vs BPA WR vs BPA TE." Founder report
 *   2026-05-19: BPA was showing 3 RBs at every slot because RBs
 *   happened to dominate the EV ranking; user wanted to see the
 *   best across positions.
 */
function pickForSlot(args: {
  poolForSlot: PathCandidate[];
  constraint: PathPosition | "any";
  alreadyPicked: Set<string>;
}): { rec: PathCandidate; top3: PathCandidate[] } | null {
  const eligible = args.poolForSlot.filter(
    (c) =>
      !args.alreadyPicked.has(c.player_id) &&
      (args.constraint === "any" || c.position === args.constraint),
  );
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => b.expected_value - a.expected_value);
  const rec = eligible[0];

  if (args.constraint !== "any") {
    // Same-position backup view: top 3 at the constrained position.
    return {
      rec,
      top3: eligible.slice(0, MAX_CANDIDATES_PER_PICK),
    };
  }

  // BPA: diversify the backup view across positions. Walk through
  // eligible in EV order, take the recommendation first, then the
  // best player at each other position (up to MAX_CANDIDATES_PER_PICK).
  const top3: PathCandidate[] = [rec];
  const seenPositions = new Set<PathPosition>([rec.position]);
  for (const c of eligible) {
    if (top3.length >= MAX_CANDIDATES_PER_PICK) break;
    if (seenPositions.has(c.position)) continue;
    top3.push(c);
    seenPositions.add(c.position);
  }
  // If position diversity didn't fill all slots (rare; happens only
  // when fewer than 3 positions are available), fall back to next-
  // highest EV regardless of position.
  if (top3.length < MAX_CANDIDATES_PER_PICK) {
    const takenIds = new Set(top3.map((c) => c.player_id));
    for (const c of eligible) {
      if (top3.length >= MAX_CANDIDATES_PER_PICK) break;
      if (takenIds.has(c.player_id)) continue;
      top3.push(c);
    }
  }
  return { rec, top3 };
}

/**
 * Run a single archetype against the user's slots and produce a
 * complete DraftPath.
 */
function walkArchetype(args: {
  archetype: Archetype;
  rank: number;
  mySlots: Array<{ pick_no: number; pick_label: string; round: number; slot: number }>;
  candidatesBySlot: PathCandidate[][];
}): DraftPath | null {
  const template = args.archetype.build(args.mySlots.length);
  const picks: PathPick[] = [];
  const usedPlayerIds = new Set<string>();
  let totalValue = 0;
  let totalEv = 0;
  let confidenceProduct = 1;
  const dialInfluences = new Map<string, PathDialInfluence>();
  const positionSig: PathPosition[] = [];

  for (let i = 0; i < args.mySlots.length; i++) {
    const slotMeta = args.mySlots[i];
    const constraint = template[i] ?? "any";
    const result = pickForSlot({
      poolForSlot: args.candidatesBySlot[i],
      constraint,
      alreadyPicked: usedPlayerIds,
    });
    if (!result) {
      // No viable candidate at this slot under constraint. Try BPA fallback.
      const fallback = pickForSlot({
        poolForSlot: args.candidatesBySlot[i],
        constraint: "any",
        alreadyPicked: usedPlayerIds,
      });
      if (!fallback) {
        continue;
      }
      usedPlayerIds.add(fallback.rec.player_id);
      positionSig.push(fallback.rec.position);
      const pick: PathPick = {
        pick_no: slotMeta.pick_no,
        pick_label: slotMeta.pick_label,
        round: slotMeta.round,
        slot: slotMeta.slot,
        position: fallback.rec.position,
        candidates: fallback.top3,
        recommendation: fallback.rec,
        confidence: fallback.rec.survival,
      };
      picks.push(pick);
      totalValue += fallback.rec.expected_value;
      totalEv += (fallback.rec.value ?? 0) * (fallback.rec.survival ?? 1);
      confidenceProduct *= Math.max(0.1, fallback.rec.survival);
      continue;
    }
    usedPlayerIds.add(result.rec.player_id);
    positionSig.push(result.rec.position);
    const pick: PathPick = {
      pick_no: slotMeta.pick_no,
      pick_label: slotMeta.pick_label,
      round: slotMeta.round,
      slot: slotMeta.slot,
      position: result.rec.position,
      candidates: result.top3,
      recommendation: result.rec,
      confidence: result.rec.survival,
    };
    picks.push(pick);
    totalValue += result.rec.expected_value;
    totalEv += (result.rec.value ?? 0) * (result.rec.survival ?? 1);
    confidenceProduct *= Math.max(0.1, result.rec.survival);
  }

  if (picks.length === 0) return null;

  // Dial influences: not currently computed per path here because the
  // candidate's expected_value already bakes in the bias. We could
  // re-derive per-path dial deltas by re-running dialBiasFor on each
  // pick's recommendation; v1 leaves the per-path influences empty
  // and lets the UI surface dial bias at the candidate level.
  return {
    id: args.archetype.id,
    position_signature: positionSig.join("-"),
    archetype: args.archetype.label,
    why: args.archetype.why,
    picks,
    total_value: Math.round(totalValue * 100) / 100,
    total_ev: Math.round(totalEv * 100) / 100,
    rank: args.rank,
    is_recommended: false,
    dial_influences: Array.from(dialInfluences.values()),
  };
}

export async function projectDraftPaths(args: {
  snap: LeagueSnapshot;
  myRosterId: number;
  dials: WhyDials;
  classStrength: ClassStrength;
  numPicksAhead?: number;
}): Promise<DraftPathProjection | null> {
  const { snap, myRosterId, dials, classStrength } = args;
  const numPicks = args.numPicksAhead ?? DEFAULT_PICKS_AHEAD;

  // Resolve the user's next N owned picks via my_pick_schedule (the
  // canonical trade-aware list). Falls back to snake math for slot
  // mapping when schedule is missing.
  const schedule = snap.draft.my_pick_schedule ?? [];
  const mySlots = schedule.slice(0, numPicks).map((entry) => ({
    pick_no: entry.pick_no,
    pick_label: labelForPickNo(entry.pick_no, snap.total_teams),
    round: Math.ceil(entry.pick_no / snap.total_teams),
    slot: ((entry.pick_no - 1) % snap.total_teams) + 1,
  }));
  if (mySlots.length === 0) return null;

  // Build the available pool with player values attached.
  const availableRaw = await getAvailableForRequest(snap).catch(() => []);
  if (availableRaw.length === 0) return null;
  const ids = availableRaw.map((p) => p.id);
  const valueMap = await resolvePlayerValues({
    ids,
    isSuperflex: snap.format === "superflex" || snap.format === "2qb",
    isPpr: snap.scoring.includes("PPR"),
    isHalfPpr: snap.scoring.includes("half-PPR"),
    isTePremium: snap.scoring.includes("TE-premium"),
  });
  const availableWithValue = availableRaw.map((p) => ({
    ...p,
    value: valueMap.get(p.id)?.value ?? null,
  }));

  // Build context derived signals: position-run multiplier from
  // recent picks, roster-fit weights from current roster.
  const positionRunMultiplier = computePositionRunMultiplier(snap);
  const rosterFit = computeRosterFit(snap);

  // Build candidate pool per slot. Each slot has its own survival
  // probability because survival depends on the target pick_no.
  const candidatesBySlot: PathCandidate[][] = mySlots.map((slot) => {
    const candidates: PathCandidate[] = [];
    for (const p of availableWithValue) {
      const cand = buildCandidate({
        player: p as AvailablePlayer,
        targetPickNo: slot.pick_no,
        positionRunMultiplier,
        classStrengthByPos: classStrength.by_position,
        rosterFit,
        dials,
      });
      if (cand) candidates.push(cand);
    }
    candidates.sort((a, b) => b.expected_value - a.expected_value);
    return candidates.slice(0, 60); // top-60 per slot is plenty
  });

  // Walk every applicable archetype, produce one DraftPath each.
  const applicable = ARCHETYPES.filter((a) => a.appliesTo(snap));
  const paths: DraftPath[] = [];
  for (const archetype of applicable) {
    const path = walkArchetype({
      archetype,
      rank: 0, // placeholder; assigned below
      mySlots,
      candidatesBySlot,
    });
    if (path) paths.push(path);
  }

  // Rank by total_value descending. Top is recommended.
  paths.sort((a, b) => b.total_value - a.total_value);
  paths.forEach((p, i) => {
    p.rank = i + 1;
    p.is_recommended = i === 0;
  });

  return {
    my_slots: mySlots,
    paths,
    class_strength: classStrength,
    generated_at: new Date().toISOString(),
  };
}
