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
 */

import type { Position } from "../archetypes/schema";
import type { LaneMembership } from "@/lib/strategy/lane-identity";
import type { FormatRules } from "@/lib/engine/llm-contract";
import type { OwnedRosterPlayer } from "./detect";
import type { PlayCommitment } from "./types";

export type PlayCoverageVerdict = "covered" | "partial" | "thin";

export type PlayCoverageBuiltPiece = {
  player_id: string;
  name: string;
  position: Position | null;
  team: string | null;
  value: number | null;
};

export type PlayCoverage = {
  verdict: PlayCoverageVerdict;
  /** Players already on the user's roster that advance this play. */
  built: PlayCoverageBuiltPiece[];
  /** Voice A description of what is still missing. null when covered. */
  missing: string | null;
  /** One-line summary (e.g. "Built: 3 of 3 contributors · covered"). */
  summary: string;
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

function coverageForQbWrStack(args: {
  play: PlayCommitment;
  ownedById: Map<string, OwnedRosterPlayer>;
  valueMap: Record<string, number>;
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
  valueMap: Record<string, number>;
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
  valueMap: Record<string, number>;
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
}): PlayCoverage | null {
  const ownedById = new Map<string, OwnedRosterPlayer>();
  for (const p of args.ownedPlayers) ownedById.set(p.id, p);

  switch (args.play.archetype) {
    case "qb_wr_stack":
      return coverageForQbWrStack({
        play: args.play,
        ownedById,
        valueMap: args.valueMap,
      });
    case "anchor_handcuff":
      return coverageForAnchorHandcuff({
        play: args.play,
        ownedById,
        valueMap: args.valueMap,
      });
    case "bridge_qb":
      return coverageForBridgeQb({
        play: args.play,
        ownedById,
        valueMap: args.valueMap,
      });
    case "qb_hoard":
      return coverageForQbHoard({
        ownedById,
        valueMap: args.valueMap,
        formatRules: args.formatRules ?? null,
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
