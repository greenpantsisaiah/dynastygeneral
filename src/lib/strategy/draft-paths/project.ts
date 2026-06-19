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
import { type PlayerValue } from "@/lib/players/values";
import { scoringValueByIds } from "@/lib/players/value-mode";
import { resolvePlayers } from "@/lib/players/cache";
import type { WhyDials } from "@/lib/rankings/why-breakdown";
import type {
  ClassStrength,
  ClassStrengthPosition,
} from "@/lib/strategy/class-strength/compute";
import type {
  DraftPath,
  DraftPathProjection,
  LockedPick,
  PathCandidate,
  PathDialInfluence,
  PathPick,
  PathPosition,
  RosterContext,
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
 * Build a RosterContext from snap + value lookup. Reads the user's
 * roster, counts positions, identifies anchors (top 1-2 by value at
 * each position), and composes a plain-English summary line.
 */
function buildRosterContext(args: {
  snap: LeagueSnapshot;
  myRosterId: number;
  valueMap: Map<string, { value: number }>;
  lockedNameMap?: Map<string, string>;
}): RosterContext {
  const { snap, myRosterId, valueMap } = args;
  const me = snap.rosters.find((r) => r.roster_id === myRosterId);
  const isSuperflex =
    snap.format === "superflex" || snap.format === "2qb";
  const starterNeeds: Record<PathPosition, number> = {
    QB: isSuperflex ? 2 : 1,
    RB: 2,
    WR: 3,
    TE: 1,
  };
  const counts: Record<PathPosition, number> = {
    QB: me?.position_counts.QB ?? 0,
    RB: me?.position_counts.RB ?? 0,
    WR: me?.position_counts.WR ?? 0,
    TE: me?.position_counts.TE ?? 0,
  };
  const gaps: Record<PathPosition, number> = {
    QB: Math.max(0, starterNeeds.QB - counts.QB),
    RB: Math.max(0, starterNeeds.RB - counts.RB),
    WR: Math.max(0, starterNeeds.WR - counts.WR),
    TE: Math.max(0, starterNeeds.TE - counts.TE),
  };

  // Anchors: for each position, find the user's top 1-2 picks by
  // FantasyCalc value. Pulled from picks_made attributed to the user.
  const anchors: Record<
    PathPosition,
    Array<{ name: string; value: number }>
  > = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
  };
  const myPicks = snap.draft.picks_made.filter(
    (p) => p.roster_id === myRosterId,
  );
  for (const pos of ["QB", "RB", "WR", "TE"] as PathPosition[]) {
    const candidates = myPicks
      .filter((p) => (p.position ?? "").toUpperCase() === pos)
      .map((p) => ({
        name:
          args.lockedNameMap?.get(p.player_id) ?? p.player_id.slice(0, 10),
        value: valueMap.get(p.player_id)?.value ?? 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 2);
    anchors[pos] = candidates;
  }

  // Summary: position counts + gaps + biggest hole.
  const filled: PathPosition[] = [];
  const partial: PathPosition[] = [];
  const empty: PathPosition[] = [];
  for (const pos of ["QB", "RB", "WR", "TE"] as PathPosition[]) {
    if (counts[pos] >= starterNeeds[pos]) filled.push(pos);
    else if (counts[pos] > 0) partial.push(pos);
    else empty.push(pos);
  }
  const summaryParts: string[] = [];
  if (myPicks.length === 0) {
    summaryParts.push("No picks made yet; projection starts from your first slot.");
  } else {
    summaryParts.push(
      `${myPicks.length} pick${myPicks.length === 1 ? "" : "s"} made.`,
    );
    if (filled.length > 0) {
      summaryParts.push(`Starter quota met at ${filled.join(", ")}.`);
    }
    if (empty.length > 0) {
      summaryParts.push(`No bodies at ${empty.join(", ")} yet.`);
    }
    if (partial.length > 0) {
      const partialDescriptions = partial.map(
        (p) => `${counts[p]}/${starterNeeds[p]} ${p}`,
      );
      summaryParts.push(`Partial: ${partialDescriptions.join(", ")}.`);
    }
  }
  const summary = summaryParts.join(" ");

  return {
    position_counts: counts,
    starter_needs: starterNeeds,
    gaps,
    anchors,
    summary,
    picks_made: myPicks.length,
  };
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
  /**
   * Returns the one-line why for this path given the user's current
   * roster state. Lets the description acknowledge "you already have
   * Saquon + Judkins, extend with a 3rd RB" instead of the static
   * pre-draft "lock the bellcow at slot 1" line.
   */
  why: (ctx: RosterContext) => string;
  /** Sequence template across N slots. "any" = BPA, else fixed position. */
  build: (mySlotsCount: number) => Array<PathPosition | "any">;
  /** Format + roster gate. Excludes paths that don't apply. */
  appliesTo: (snap: LeagueSnapshot, ctx: RosterContext) => boolean;
};

function listAnchors(
  ctx: RosterContext,
  position: PathPosition,
  max = 2,
): string {
  const names = ctx.anchors[position].slice(0, max).map((a) => a.name);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} + ${names[names.length - 1]}`;
}

const ARCHETYPES: Archetype[] = [
  {
    id: "bpa",
    label: "Value-first",
    why: () =>
      "Take the highest-value player on the board at every slot. Position-agnostic. Best when the field is unpredictable.",
    build: (n) => Array(n).fill("any"),
    appliesTo: () => true,
  },
  {
    id: "anchor_rb",
    label: "Anchor RB",
    why: (ctx) => {
      const rbs = ctx.position_counts.RB;
      if (rbs === 0)
        return "Lock the bellcow at slot 1, then stack WR depth. Defends against the RB cliff.";
      if (rbs === 1) {
        const anchor = listAnchors(ctx, "RB", 1);
        return `Pair ${anchor} with a complementary RB2, then build WR depth around them.`;
      }
      // 2+ RBs already.
      const anchors = listAnchors(ctx, "RB");
      return `You have ${anchors}. Extend the RB lead with a third anchor to insulate against injury, then stack WR depth.`;
    },
    build: (n) => {
      const seq: Array<PathPosition | "any"> = ["RB"];
      for (let i = 1; i < n; i++) seq.push(i % 2 === 1 ? "WR" : "any");
      return seq;
    },
    appliesTo: (_snap, ctx) => ctx.position_counts.RB < 4,
  },
  {
    id: "zero_rb",
    label: "Zero RB",
    why: (ctx) => {
      const wrs = ctx.position_counts.WR;
      if (wrs === 0)
        return "Pass on early RB for elite WR talent. Trust late-round RB lottery tickets + injury opportunity later.";
      const anchor = listAnchors(ctx, "WR", 1);
      return `Extend the WR lead with ${anchor} on roster; late-round RB lottery tickets + injury opportunity later.`;
    },
    build: (n) => {
      const seq: Array<PathPosition | "any"> = ["WR", "WR"];
      for (let i = 2; i < n; i++) seq.push(i < 4 ? "any" : "RB");
      return seq;
    },
    appliesTo: (_snap, ctx) => ctx.position_counts.RB < 2,
  },
  {
    id: "sf_qb_first",
    label: "Superflex QB-first",
    why: (ctx) => {
      const qbs = ctx.position_counts.QB;
      if (qbs === 0)
        return "Lock a top-tier QB early. In SF, QB scarcity is the dominant constraint.";
      if (qbs === 1) {
        const anchor = listAnchors(ctx, "QB", 1);
        return `Pair ${anchor} with a second SF-eligible QB to lock both starter slots. SF starter QB count maxes at 2.`;
      }
      const anchors = listAnchors(ctx, "QB");
      return `You have ${anchors} locked at QB. This path adds a QB3 for SF flex insurance, then stacks skill depth.`;
    },
    build: (n) => {
      const seq: Array<PathPosition | "any"> = ["QB"];
      for (let i = 1; i < n; i++) seq.push(i === 2 ? "QB" : "any");
      return seq;
    },
    appliesTo: (snap, ctx) =>
      (snap.format === "superflex" || snap.format === "2qb") &&
      ctx.position_counts.QB < 3,
  },
  {
    id: "te_premium",
    label: "TE-Premium Lock",
    why: (ctx) => {
      const tes = ctx.position_counts.TE;
      if (tes === 0)
        return "Take a top-end TE in your first two picks. TE-premium scoring inflates their value past consensus.";
      const anchor = listAnchors(ctx, "TE", 1);
      return `You have ${anchor} locked at TE. Add a second top-end TE to extend the position lead in TE-premium scoring.`;
    },
    build: (n) => {
      const seq: Array<PathPosition | "any"> = ["TE", "any"];
      for (let i = 2; i < n; i++) seq.push("any");
      return seq;
    },
    appliesTo: (snap, ctx) =>
      snap.scoring.includes("TE-premium") && ctx.position_counts.TE < 2,
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
  rosterContext: RosterContext;
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
    why: args.archetype.why(args.rosterContext),
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
  // Handed-down priced pool from the canonical buildLeagueContext. When
  // provided, the projector consumes the SAME available pool + value map
  // the hub board already built instead of re-fetching getAvailableForRequest
  // + resolvePlayerValues (the redundant re-resolution the architecture
  // audit flagged). The handed-down value map covers all rosters + the
  // available pool (a superset of what this projector resolved on its own),
  // so roster-context anchors get values too. Falls back to self-resolution
  // when absent (e.g. callers without a prebuilt context).
  available?: AvailablePlayer[];
  valueMap?: Map<string, PlayerValue>;
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

  // Build the available pool with player values attached. Prefer the
  // handed-down priced pool (canonical buildLeagueContext) over a second
  // resolution; fall back to self-resolution only when not provided.
  const availableRaw =
    args.available ?? (await getAvailableForRequest(snap).catch(() => []));
  if (availableRaw.length === 0) return null;
  // Attach the scoring value through the ONE value seam. Reuse the handed-down
  // priced-pool value map (canonical buildLeagueContext) when present so there
  // is no second FantasyCalc fetch; otherwise the seam fetches. The value is
  // market in shadow, rubric on flip, so the path projection flips with the
  // board instead of diverging on the available-only fallback path.
  const { valueById, valueMap } = await scoringValueByIds({
    ids: availableRaw.map((p) => p.id),
    valueMap: args.valueMap,
    isSuperflex: snap.format === "superflex" || snap.format === "2qb",
    isPpr: snap.scoring.includes("PPR"),
    isHalfPpr: snap.scoring.includes("half-PPR"),
    isTePremium: snap.scoring.includes("TE-premium"),
  });
  const availableWithValue = availableRaw.map((p) => ({
    ...p,
    value: valueById[p.id] ?? null,
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

  // Resolve player names for the user's full pick history so the
  // RosterContext anchors carry real names ("Saquon Barkley"), not
  // truncated player_id stubs.
  const allMyPickIds = snap.draft.picks_made
    .filter((p) => p.roster_id === myRosterId)
    .map((p) => p.player_id);
  const fullNameMap = new Map<string, string>();
  if (allMyPickIds.length > 0) {
    const resolved = await resolvePlayers(allMyPickIds);
    for (const [id, sp] of resolved) {
      if (sp.full_name) fullNameMap.set(id, sp.full_name);
    }
  }

  // Roster context. Used by archetype filters + dynamic why functions
  // so descriptions read "you have Saquon + Judkins, extend with a
  // third anchor" instead of the static "lock the bellcow at slot 1."
  const rosterContext = buildRosterContext({
    snap,
    myRosterId,
    valueMap,
    lockedNameMap: fullNameMap,
  });

  // Walk every applicable archetype, produce one DraftPath each.
  const applicable = ARCHETYPES.filter((a) => a.appliesTo(snap, rosterContext));
  const paths: DraftPath[] = [];
  for (const archetype of applicable) {
    const path = walkArchetype({
      archetype,
      rank: 0, // placeholder; assigned below
      mySlots,
      candidatesBySlot,
      rosterContext,
    });
    if (path) paths.push(path);
  }

  // Rank by total_value descending. Top is recommended.
  paths.sort((a, b) => b.total_value - a.total_value);
  paths.forEach((p, i) => {
    p.rank = i + 1;
    p.is_recommended = i === 0;
  });

  // Locked picks: the user's last 5 picks in this draft, sorted
  // oldest-to-newest for display. Reuses fullNameMap built above
  // (avoids redundant resolvePlayers call).
  const myPicksRaw = snap.draft.picks_made
    .filter((p) => p.roster_id === myRosterId)
    .sort((a, b) => b.pick_no - a.pick_no)
    .slice(0, 5);
  // Resolve teams (full_name already in fullNameMap). One more
  // resolvePlayers call for team data when needed.
  const teamMap = new Map<string, string | null>();
  if (myPicksRaw.length > 0) {
    const resolved = await resolvePlayers(myPicksRaw.map((p) => p.player_id));
    for (const [id, sp] of resolved) teamMap.set(id, sp.team ?? null);
  }
  const lockedPicks: LockedPick[] = myPicksRaw
    .map((p) => {
      const positionRaw = (p.position ?? "").toUpperCase();
      const value = valueMap.get(p.player_id)?.value ?? null;
      return {
        pick_no: p.pick_no,
        pick_label: labelForPickNo(p.pick_no, snap.total_teams),
        round: Math.ceil(p.pick_no / snap.total_teams),
        player_id: p.player_id,
        player_name: fullNameMap.get(p.player_id) ?? p.player_id,
        position: positionRaw,
        team: teamMap.get(p.player_id) ?? null,
        age: typeof p.age === "number" ? p.age : null,
        is_rookie: p.years_exp === 0,
        value,
      };
    })
    .reverse();

  return {
    my_slots: mySlots,
    locked_picks: lockedPicks,
    roster_context: rosterContext,
    paths,
    class_strength: classStrength,
    generated_at: new Date().toISOString(),
  };
}
