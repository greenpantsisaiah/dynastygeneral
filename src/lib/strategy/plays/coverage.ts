/**
 * Play coverage. For a committed play, what has the user already built
 * on their roster toward it? The "no target on the board yet" empty
 * state reads as "nothing happening" even when the user has the anchor,
 * the partner, or 3 of 3 lane contributors already in hand. Founder
 * report 2026-05-26: "It feels a little empty when I'm actually doing
 * well at one. Find a way to illustrate the strength/build that already
 * happened on it so I can feel whether finishing it is a hole or we've
 * already got it covered."
 *
 * Coverage is a deterministic, snapshot-grounded function from a play
 * and the user's rostered players. Voice A: numbers carry units (val N),
 * no em dashes, no hedging.
 *
 * Sniped state added 2026-05-27. When a named partner (stack WR/TE,
 * handcuff RB, dev QB) is on ANOTHER roster, the draft path to the play
 * is dead; only trade gets the user there. The verdict reads "sniped"
 * (danger-tone), the holder is named, and the line surfaces a
 * data-grounded trade lever (opponent's thin position cross-referenced
 * against the user's surplus). Replaces the misleading "thin" verdict
 * for the "someone else got my handcuff" case (founder report
 * 2026-05-27: "tell me red like Failed but kinder; I need to know my
 * trade timing and target/angle").
 */

import type { Position } from "../archetypes/schema";
import type { LaneMembership } from "@/lib/strategy/lane-identity";
import type { FormatRules } from "@/lib/engine/llm-contract";
import type { OwnedRosterPlayer } from "./detect";
import type { PlayCommitment, PlayPlayerRef } from "./types";

export type PlayCoverageVerdict = "covered" | "partial" | "thin" | "sniped";

export type PlayCoverageBuiltPiece = {
  player_id: string;
  name: string;
  position: Position | null;
  team: string | null;
  value: number | null;
};

/**
 * A named partner the engine wanted, now on another roster. The trade
 * line surfaces this with value + owner so the user can plan the move.
 */
export type SnipedPartner = {
  player_id: string;
  name: string;
  position: Position | null;
  value: number | null;
  owner_name: string | null;
  owner_roster_id: number;
};

/**
 * Per-opponent roster footprint, keyed by the players that opponent
 * holds. The position_counts let us name a thin-position trade lever
 * without re-deriving roster shape here.
 */
export type OppHolder = {
  roster_id: number;
  owner_name: string | null;
  position_counts: Record<Position, number>;
};

export type PlayCoverage = {
  verdict: PlayCoverageVerdict;
  /** Players already on the user's roster that advance this play. */
  built: PlayCoverageBuiltPiece[];
  /** Voice A description of what is still missing. null when covered. */
  missing: string | null;
  /** One-line summary (e.g. "Built: 3 of 3 contributors · covered"). */
  summary: string;
  /** Named partners the engine wanted that are now held elsewhere. */
  sniped?: SnipedPartner[];
  /** Voice A trade lever line ("they are light at X; you have Y, Z"). */
  trade_angle?: string | null;
};

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five"];

function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function valOf(id: string, valueMap: Record<string, number>): number | null {
  const v = valueMap[id];
  return typeof v === "number" ? Math.round(v) : null;
}

function asPiece(
  p: OwnedRosterPlayer,
  valueMap: Record<string, number>,
): PlayCoverageBuiltPiece {
  return {
    player_id: p.id,
    name: p.name,
    position: p.position,
    team: p.team,
    value: valOf(p.id, valueMap),
  };
}

function namedList(pieces: PlayCoverageBuiltPiece[]): string {
  return pieces
    .map((p) => (p.value != null ? `${p.name} (val ${p.value})` : p.name))
    .join(", ");
}

/**
 * For a list of named partners the engine wanted, return those held by
 * an opponent (not the user, not free agent). Sorted by value desc so
 * the most expensive sniped piece reads first.
 */
function snipedFromTargets(args: {
  targets: PlayPlayerRef[];
  ownedById: Map<string, OwnedRosterPlayer>;
  oppHolders: Record<string, OppHolder>;
  valueMap: Record<string, number>;
}): SnipedPartner[] {
  const out: SnipedPartner[] = [];
  for (const t of args.targets) {
    if (args.ownedById.has(t.player_id)) continue;
    const holder = args.oppHolders[t.player_id];
    if (!holder) continue;
    out.push({
      player_id: t.player_id,
      name: t.name,
      position: t.position ?? null,
      value: valOf(t.player_id, args.valueMap),
      owner_name: holder.owner_name,
      owner_roster_id: holder.roster_id,
    });
  }
  out.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return out;
}

const STARTER_KEY_BY_POS: Record<string, keyof FormatRules> = {
  QB: "qb_starters_max",
  RB: "rb_starters_max",
  WR: "wr_starters_max",
  TE: "te_starters_max",
};

function starterReqFor(
  pos: Position,
  formatRules: FormatRules | null,
): number {
  if (!formatRules) {
    const defaults: Record<string, number> = { QB: 1, RB: 2, WR: 3, TE: 1 };
    return defaults[pos] ?? 1;
  }
  const key = STARTER_KEY_BY_POS[pos];
  if (!key) return 1;
  const v = formatRules[key];
  return typeof v === "number" ? v : 1;
}

/**
 * The trade lever for one sniped partner: identify a thin position on
 * the holder's roster, then name the user's surplus pieces at that
 * position so the user has named tokens to offer. Returns null when no
 * clean lever exists (founder rule: no fabricated angle).
 */
function tradeAngleForHolder(args: {
  holder: OppHolder;
  ownedPlayers: OwnedRosterPlayer[];
  valueMap: Record<string, number>;
  formatRules: FormatRules | null;
}): string | null {
  const { holder, ownedPlayers, valueMap, formatRules } = args;
  const positions: Position[] = ["QB", "RB", "WR", "TE"];
  // The holder's thin positions: count strictly less than starter req.
  const oppThin: Position[] = [];
  for (const pos of positions) {
    const cnt = holder.position_counts[pos] ?? 0;
    if (cnt < starterReqFor(pos, formatRules)) oppThin.push(pos);
  }
  if (oppThin.length === 0) return null;

  // For each thin position, look at the user's owned players at that
  // position. Surplus = anything past starter_req (the user wouldn't
  // trade away their starter). Pick the position that gives the user
  // the most named surplus pieces.
  let bestPos: Position | null = null;
  let bestSurplus: OwnedRosterPlayer[] = [];
  for (const pos of oppThin) {
    const atPos = ownedPlayers
      .filter((p) => p.position === pos)
      .sort((a, b) => (valueMap[b.id] ?? 0) - (valueMap[a.id] ?? 0));
    const req = starterReqFor(pos, formatRules);
    const surplus = atPos.slice(req);
    if (surplus.length === 0) continue;
    if (surplus.length > bestSurplus.length) {
      bestPos = pos;
      bestSurplus = surplus;
    }
  }
  if (!bestPos || bestSurplus.length === 0) return null;

  const who = holder.owner_name ?? "they";
  const names = bestSurplus
    .slice(0, 3)
    .map((p) => {
      const v = valueMap[p.id];
      return typeof v === "number" ? `${p.name} (val ${Math.round(v)})` : p.name;
    })
    .join(", ");
  return `${who} is light at ${bestPos}. Your surplus there: ${names}.`;
}

function coverageForQbWrStack(args: {
  play: PlayCommitment;
  ownedById: Map<string, OwnedRosterPlayer>;
  ownedPlayers: OwnedRosterPlayer[];
  valueMap: Record<string, number>;
  oppHolders: Record<string, OppHolder>;
  formatRules: FormatRules | null;
}): PlayCoverage {
  const anchorId = args.play.primary_player.player_id;
  const anchorTeam = args.play.primary_player.team;
  const built: PlayCoverageBuiltPiece[] = [];

  const anchorOwned = args.ownedById.get(anchorId);
  if (anchorOwned) built.push(asPiece(anchorOwned, args.valueMap));

  // Any rostered WR/TE on the anchor's team is a stack partner. We do
  // not gate on the original target_candidates list because the user
  // might have grabbed a different same-team partner via trade / waiver.
  const partners: PlayCoverageBuiltPiece[] = [];
  if (anchorTeam) {
    for (const p of args.ownedById.values()) {
      if (p.id === anchorId) continue;
      if (p.team !== anchorTeam) continue;
      if (p.position !== "WR" && p.position !== "TE") continue;
      partners.push(asPiece(p, args.valueMap));
    }
  }
  partners.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  built.push(...partners);

  if (!anchorOwned) {
    return {
      verdict: "thin",
      built,
      missing: `${args.play.primary_player.name} not yet rostered.`,
      summary: "Anchor not in hand yet.",
    };
  }
  if (partners.length === 0) {
    // Anchor rostered, no partner on user's roster. Two sub-cases:
    // 1) Named engine partners now on opponent rosters = SNIPED.
    // 2) Named partners still free / on the board = THIN.
    const sniped = snipedFromTargets({
      targets: args.play.followthrough_targets,
      ownedById: args.ownedById,
      oppHolders: args.oppHolders,
      valueMap: args.valueMap,
    });
    if (sniped.length > 0) {
      const top = sniped[0];
      const valTag = top.value != null ? ` (val ${top.value})` : "";
      const heldBy = top.owner_name ?? "another manager";
      const angle = tradeAngleForHolder({
        holder: {
          roster_id: top.owner_roster_id,
          owner_name: top.owner_name,
          position_counts: args.oppHolders[top.player_id].position_counts,
        },
        ownedPlayers: args.ownedPlayers,
        valueMap: args.valueMap,
        formatRules: args.formatRules,
      });
      return {
        verdict: "sniped",
        built,
        missing: `${top.name}${valTag} drafted by ${heldBy}. Trade is the path now.`,
        summary: `Built: ${namedList(built)} · stack partner ${top.name} held by ${heldBy}.`,
        sniped,
        trade_angle: angle,
      };
    }
    return {
      verdict: "thin",
      built,
      missing: `a ${anchorTeam ?? "team"} pass-catcher to stack.`,
      summary: `Built: ${namedList(built)} · missing the stack partner.`,
    };
  }
  return {
    verdict: "covered",
    built,
    missing: null,
    summary: `Built: ${namedList(built)} · covered.`,
  };
}

function coverageForAnchorHandcuff(args: {
  play: PlayCommitment;
  ownedById: Map<string, OwnedRosterPlayer>;
  ownedPlayers: OwnedRosterPlayer[];
  valueMap: Record<string, number>;
  oppHolders: Record<string, OppHolder>;
  formatRules: FormatRules | null;
}): PlayCoverage {
  const anchorId = args.play.primary_player.player_id;
  const anchorTeam = args.play.primary_player.team;
  const built: PlayCoverageBuiltPiece[] = [];

  const anchorOwned = args.ownedById.get(anchorId);
  if (anchorOwned) built.push(asPiece(anchorOwned, args.valueMap));

  const handcuffs: PlayCoverageBuiltPiece[] = [];
  if (anchorTeam) {
    for (const p of args.ownedById.values()) {
      if (p.id === anchorId) continue;
      if (p.team !== anchorTeam) continue;
      if (p.position !== "RB") continue;
      handcuffs.push(asPiece(p, args.valueMap));
    }
  }
  handcuffs.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  built.push(...handcuffs);

  if (!anchorOwned) {
    return {
      verdict: "thin",
      built,
      missing: `${args.play.primary_player.name} not yet rostered.`,
      summary: "Anchor not in hand yet.",
    };
  }
  if (handcuffs.length === 0) {
    const sniped = snipedFromTargets({
      targets: args.play.followthrough_targets,
      ownedById: args.ownedById,
      oppHolders: args.oppHolders,
      valueMap: args.valueMap,
    });
    if (sniped.length > 0) {
      const top = sniped[0];
      const valTag = top.value != null ? ` (val ${top.value})` : "";
      const heldBy = top.owner_name ?? "another manager";
      const angle = tradeAngleForHolder({
        holder: {
          roster_id: top.owner_roster_id,
          owner_name: top.owner_name,
          position_counts: args.oppHolders[top.player_id].position_counts,
        },
        ownedPlayers: args.ownedPlayers,
        valueMap: args.valueMap,
        formatRules: args.formatRules,
      });
      return {
        verdict: "sniped",
        built,
        missing: `${top.name}${valTag} drafted by ${heldBy}. Trade is the path now.`,
        summary: `Built: ${namedList(built)} · handcuff ${top.name} held by ${heldBy}.`,
        sniped,
        trade_angle: angle,
      };
    }
    return {
      verdict: "thin",
      built,
      missing: `the ${anchorTeam ?? "team"} backup RB.`,
      summary: `Built: ${namedList(built)} · handcuff still on the board.`,
    };
  }
  return {
    verdict: "covered",
    built,
    missing: null,
    summary: `Built: ${namedList(built)} · covered.`,
  };
}

function coverageForBridgeQb(args: {
  play: PlayCommitment;
  ownedById: Map<string, OwnedRosterPlayer>;
  ownedPlayers: OwnedRosterPlayer[];
  valueMap: Record<string, number>;
  oppHolders: Record<string, OppHolder>;
  formatRules: FormatRules | null;
}): PlayCoverage {
  const bridgeId = args.play.primary_player.player_id;
  const built: PlayCoverageBuiltPiece[] = [];

  const bridgeOwned = args.ownedById.get(bridgeId);
  if (bridgeOwned) built.push(asPiece(bridgeOwned, args.valueMap));

  // A dev QB is anyone rostered with position QB, age <= 24 or
  // years_exp <= 2, not the bridge himself.
  const devs: PlayCoverageBuiltPiece[] = [];
  for (const p of args.ownedById.values()) {
    if (p.id === bridgeId) continue;
    if (p.position !== "QB") continue;
    const young = (p.age ?? 99) <= 24 || (p.yearsExp ?? 99) <= 2 || p.is_rookie;
    if (!young) continue;
    devs.push(asPiece(p, args.valueMap));
  }
  devs.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  built.push(...devs);

  if (!bridgeOwned) {
    return {
      verdict: "thin",
      built,
      missing: `${args.play.primary_player.name} not yet rostered.`,
      summary: "Bridge starter not in hand yet.",
    };
  }
  if (devs.length === 0) {
    const sniped = snipedFromTargets({
      targets: args.play.followthrough_targets,
      ownedById: args.ownedById,
      oppHolders: args.oppHolders,
      valueMap: args.valueMap,
    });
    if (sniped.length > 0) {
      const top = sniped[0];
      const valTag = top.value != null ? ` (val ${top.value})` : "";
      const heldBy = top.owner_name ?? "another manager";
      const angle = tradeAngleForHolder({
        holder: {
          roster_id: top.owner_roster_id,
          owner_name: top.owner_name,
          position_counts: args.oppHolders[top.player_id].position_counts,
        },
        ownedPlayers: args.ownedPlayers,
        valueMap: args.valueMap,
        formatRules: args.formatRules,
      });
      return {
        verdict: "sniped",
        built,
        missing: `${top.name}${valTag} drafted by ${heldBy}. Trade is the path now.`,
        summary: `Built: ${namedList(built)} · dev QB ${top.name} held by ${heldBy}.`,
        sniped,
        trade_angle: angle,
      };
    }
    return {
      verdict: "partial",
      built,
      missing: "a young dev QB to inherit the SF QB1 slot.",
      summary: `Built: ${namedList(built)} · still need the dev QB.`,
    };
  }
  return {
    verdict: "covered",
    built,
    missing: null,
    summary: `Built: ${namedList(built)} · covered.`,
  };
}

function coverageForQbHoard(args: {
  ownedById: Map<string, OwnedRosterPlayer>;
  valueMap: Record<string, number>;
  formatRules: FormatRules | null;
}): PlayCoverage {
  const qbs: PlayCoverageBuiltPiece[] = [];
  for (const p of args.ownedById.values()) {
    if (p.position === "QB") qbs.push(asPiece(p, args.valueMap));
  }
  qbs.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const starterReq = args.formatRules?.qb_starters_max ?? 1;
  const surplus = Math.max(0, qbs.length - starterReq);

  if (qbs.length === 0) {
    return {
      verdict: "thin",
      built: [],
      missing: "any QBs to flip.",
      summary: "No QBs rostered yet.",
    };
  }
  if (surplus === 0) {
    return {
      verdict: "thin",
      built: qbs,
      missing: `more QBs (you hold ${qbs.length} for ${starterReq} starter).`,
      summary: `Built: ${namedList(qbs)} · starter only, no surplus.`,
    };
  }
  return {
    verdict: "covered",
    built: qbs,
    missing: null,
    summary: `Built: ${namedList(qbs)} · ${numberWord(surplus)} flippable past the ${numberWord(starterReq)}-starter mark.`,
  };
}

function coverageForLanePath(args: {
  play: PlayCommitment;
  ownedById: Map<string, OwnedRosterPlayer>;
  valueMap: Record<string, number>;
  laneMemberships: LaneMembership[];
}): PlayCoverage {
  // The lane play's primary_player.player_id is shaped `lane:{lane_id}`
  // (detect.ts:detectLanePlays). Recover the lane id and read coverage
  // off the live LaneMembership for that lane.
  const raw = args.play.primary_player.player_id;
  const laneId = raw.startsWith("lane:") ? raw.slice(5) : raw;
  const membership = args.laneMemberships.find((m) => m.lane_id === laneId);

  if (!membership || membership.contributors.length === 0) {
    return {
      verdict: "thin",
      built: [],
      missing: "any contributors toward this build yet.",
      summary: "No contributors yet.",
    };
  }

  const built: PlayCoverageBuiltPiece[] = [];
  for (const c of membership.contributors) {
    const owned = args.ownedById.get(c.player_id);
    if (owned) built.push(asPiece(owned, args.valueMap));
    else {
      // Fall back to lane-score data when the player isn't in
      // ownedPlayers (e.g., K / DST excluded from owned lookup).
      built.push({
        player_id: c.player_id,
        name: c.name,
        position: (c.position ?? null) as Position | null,
        team: null,
        value: valOf(c.player_id, args.valueMap),
      });
    }
  }

  const verdict: PlayCoverageVerdict =
    membership.state === "in" ? "covered" : membership.state === "close" ? "partial" : "thin";

  if (verdict === "covered") {
    return {
      verdict,
      built,
      missing: null,
      summary: `Built: ${namedList(built)} · fits ${membership.label}.`,
    };
  }
  if (verdict === "partial") {
    return {
      verdict,
      built,
      missing: membership.gap?.description ?? `close the gap to ${membership.label}.`,
      summary: `Built: ${namedList(built)} · ${membership.gap?.description ?? "one move away."}`,
    };
  }
  return {
    verdict,
    built,
    missing: `more pieces toward ${membership.label}.`,
    summary: `Built: ${namedList(built)} · still thin.`,
  };
}

/**
 * Canonical coverage entry point. Dispatches per archetype. Returns
 * null when the play has no coverage frame (defensive; today every
 * archetype handles itself).
 */
export function derivePlayCoverage(args: {
  play: PlayCommitment;
  ownedPlayers: OwnedRosterPlayer[];
  valueMap: Record<string, number>;
  laneMemberships?: LaneMembership[];
  formatRules?: FormatRules | null;
  /**
   * Opponent roster lookup keyed by player_id (only players NOT on the
   * user's roster). When present, enables the "sniped" verdict for
   * named-partner archetypes (stack / handcuff / bridge); when absent,
   * those plays fall back to the prior "thin" verdict.
   */
  oppHolders?: Record<string, OppHolder>;
}): PlayCoverage | null {
  const ownedById = new Map<string, OwnedRosterPlayer>();
  for (const p of args.ownedPlayers) ownedById.set(p.id, p);

  const oppHolders = args.oppHolders ?? {};
  const formatRules = args.formatRules ?? null;

  switch (args.play.archetype) {
    case "qb_wr_stack":
      return coverageForQbWrStack({
        play: args.play,
        ownedById,
        ownedPlayers: args.ownedPlayers,
        valueMap: args.valueMap,
        oppHolders,
        formatRules,
      });
    case "anchor_handcuff":
      return coverageForAnchorHandcuff({
        play: args.play,
        ownedById,
        ownedPlayers: args.ownedPlayers,
        valueMap: args.valueMap,
        oppHolders,
        formatRules,
      });
    case "bridge_qb":
      return coverageForBridgeQb({
        play: args.play,
        ownedById,
        ownedPlayers: args.ownedPlayers,
        valueMap: args.valueMap,
        oppHolders,
        formatRules,
      });
    case "qb_hoard":
      return coverageForQbHoard({
        ownedById,
        valueMap: args.valueMap,
        formatRules,
      });
    case "lane_path":
      return coverageForLanePath({
        play: args.play,
        ownedById,
        valueMap: args.valueMap,
        laneMemberships: args.laneMemberships ?? [],
      });
  }
}
