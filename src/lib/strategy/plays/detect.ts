/**
 * Play detection. Given the current winner candidate and the
 * available pool, identify which plays from the library the pick
 * enables.
 *
 * Detection is intentionally hardcoded per archetype for Phase 1.
 * No LLM in the loop here; the engine surfaces structured plays the
 * UI can render, commit, and discipline against deterministically.
 *
 * Urgency is survival-grounded, not a fixed pick window. Each partner
 * carries P(survives) to the user's next pick (canonical
 * `survivalPctFor` via the injected resolver). A high-value partner
 * about to leave the board pulls the play to `act_now`; a partner
 * nobody else wants reads `no_rush`. The old hardcoded "next 4 picks"
 * copy is retired (founder report 2026-05-20; cite-or-flag invariant).
 */

import type { LeagueSnapshot } from "../league-state/snapshot";
import type { AvailablePlayer } from "@/lib/players/available";
import type { SurvivalResolver } from "../decision-synthesis/synthesize";
import type { Position } from "../archetypes/schema";
import type { Play, PlayPlayerRef, PartnerSurvival, Urgency } from "./types";
import {
  urgencyFromSurvival,
  urgentPartnerOf,
  derivePlayUrgency,
  urgencyLabel,
} from "./urgency";
import { canEmitPlay, playFormatGates } from "./catalog";
import { buildFormatRulesFromSnapshot } from "@/lib/engine/llm-contract";
import type {
  LaneMembership,
  IdentityMove,
} from "@/lib/strategy/lane-identity";

const STARTING_QB_KTC_RANK_CAP = 24;
const ELITE_RB_KTC_RANK_CAP = 12;
// A QB count this far above the starter requirement is pure surplus
// in a 1QB league: one starter, one prudent backup, the rest is a
// flip asset.
const QB_HOARD_SURPLUS_OVER_STARTERS = 2;
// Lapse horizons (in user-pick rounds) kept for storage lapse math
// only. NOT surfaced in user-facing copy; urgency comes from survival.
const STACK_LAPSE_ROUNDS = 4;
const HANDCUFF_LAPSE_ROUNDS = 4;
const BRIDGE_QB_LAPSE_ROUNDS = 6;
const STACK_PARTNER_CANDIDATES = 3;
const HANDCUFF_CANDIDATES = 2;
const BRIDGE_DEV_QB_CANDIDATES = 3;

function toPlayPlayerRef(p: AvailablePlayer): PlayPlayerRef | null {
  const pos = (p.position ?? "").toUpperCase() as Position;
  if (!["QB", "RB", "WR", "TE"].includes(pos)) return null;
  return {
    player_id: p.id,
    name: p.name,
    position: pos,
    team: p.team,
  };
}

function sortByKtcValue(
  players: AvailablePlayer[],
  ktcValues: Record<string, number>,
): AvailablePlayer[] {
  return [...players].sort((a, b) => {
    const va = ktcValues[a.id] ?? 0;
    const vb = ktcValues[b.id] ?? 0;
    return vb - va;
  });
}

/**
 * Convert sorted candidate players into partner refs with KTC value
 * and survival attached. Survival is null when no resolver is provided
 * or there is no live contested gap (post-draft, no upcoming pick).
 */
function toPartnerRefs(
  players: AvailablePlayer[],
  ktcValues: Record<string, number>,
  survival?: SurvivalResolver,
): PlayPlayerRef[] {
  const refs: PlayPlayerRef[] = [];
  for (const p of players) {
    const base = toPlayPlayerRef(p);
    if (!base) continue;
    let surv: PartnerSurvival | null = null;
    const r = survival ? survival(p) : null;
    if (r) {
      surv = {
        pct: r.pct,
        ci_low: r.ci_low,
        ci_high: r.ci_high,
        to_pick_no: r.to_pick_no,
        urgency: urgencyFromSurvival(r.pct),
      };
    }
    refs.push({
      ...base,
      ktc_value: ktcValues[p.id] ?? null,
      survival: surv,
    });
  }
  return refs;
}

// Voice A genius line. Names the urgent partner + its survival when
// known; otherwise states the core action. No "next N picks".
function geniusVsAverage(args: {
  coreAction: string; // "stack a BAL pass-catcher"
  landTarget: (urgent: PlayPlayerRef) => string; // "land Mark Andrews"
  urgent: PlayPlayerRef | null;
  playUrgency: Urgency | null;
  otherwise: string; // "Average QB2 otherwise."
}): string {
  const { coreAction, landTarget, urgent, playUrgency, otherwise } = args;
  if (urgent?.survival && playUrgency) {
    return `Genius if you ${landTarget(urgent)} (${urgent.survival.pct}% survival, ${urgencyLabel(playUrgency)}). ${otherwise}`;
  }
  return `Genius if you ${coreAction}. ${otherwise}`;
}

// Voice A follow-through. Splits partners into urgent (act now / this
// round) and comfortable, names survival on the urgent ones. No
// "next N picks". Falls back to a window-free phrasing when survival
// is unavailable.
function followThroughDescription(args: {
  partners: PlayPlayerRef[];
  faNote: string;
}): string {
  const { partners, faNote } = args;
  const named = partners.map((p) => p.name);
  const haveSurvival = partners.some((p) => p.survival != null);
  if (!haveSurvival) {
    return `Take ${named.join(" or ")}. ${faNote}`;
  }

  const urgent = partners.filter(
    (p) =>
      p.survival &&
      (p.survival.urgency === "act_now" ||
        p.survival.urgency === "this_round"),
  );
  const comfortable = partners.filter(
    (p) =>
      p.survival &&
      (p.survival.urgency === "two_round_cushion" ||
        p.survival.urgency === "no_rush"),
  );

  const parts: string[] = [];
  if (urgent.length > 0) {
    const u = urgent.map((p) => `${p.name} (${p.survival!.pct}%)`).join(", ");
    parts.push(
      `${u} ${urgent.length === 1 ? "is unlikely to reach your next pick" : "are unlikely to reach your next pick"}: take now or trade up`,
    );
  }
  if (comfortable.length > 0) {
    const c = comfortable.map((p) => p.name).join(", ");
    parts.push(
      `${c} ${comfortable.length === 1 ? "sits" : "sit"} comfortably for now`,
    );
  }
  if (parts.length === 0) {
    return `Take ${named.join(" or ")}. ${faNote}`;
  }
  return `${parts.join("; ")}. ${faNote}`;
}

/**
 * QB-WR Stack. Triggered by a starting-tier QB pick. Looks for the
 * QB's team's top skill players (WR / TE) in the available pool.
 */
function detectQbWrStack(args: {
  winner: AvailablePlayer;
  winnerPos: Position;
  available: AvailablePlayer[];
  ktcValues: Record<string, number>;
  winnerKtcRank: number;
  survival?: SurvivalResolver;
}): Play | null {
  if (args.winnerPos !== "QB") return null;
  if (!args.winner.team) return null;
  if (args.winnerKtcRank > STARTING_QB_KTC_RANK_CAP) return null;

  const sameTeamSkill = args.available.filter((p) => {
    if (p.id === args.winner.id) return false;
    if (p.team !== args.winner.team) return false;
    const pos = (p.position ?? "").toUpperCase();
    return pos === "WR" || pos === "TE";
  });
  if (sameTeamSkill.length === 0) return null;

  const sortedPartners = sortByKtcValue(sameTeamSkill, args.ktcValues).slice(
    0,
    STACK_PARTNER_CANDIDATES,
  );
  const partnerRefs = toPartnerRefs(
    sortedPartners,
    args.ktcValues,
    args.survival,
  );
  if (partnerRefs.length === 0) return null;

  const playUrgency = derivePlayUrgency(partnerRefs);
  const urgent = urgentPartnerOf(partnerRefs);
  const team = args.winner.team;

  return {
    archetype: "qb_wr_stack",
    name: `${args.winner.name} + ${team} Stack`,
    primary_player: toPlayPlayerRef(args.winner)!,
    upside_thesis: `${args.winner.name}'s TD share runs through ${team}'s pass-catchers. Stacking the offense banks correlated upside across the weeks ${args.winner.name} hits.`,
    followthrough: {
      description: followThroughDescription({
        partners: partnerRefs,
        faNote: "Grab via FA immediately if they leave the board first.",
      }),
      target_candidates: partnerRefs,
      picks_window: STACK_LAPSE_ROUNDS,
    },
    genius_vs_average_line: geniusVsAverage({
      coreAction: `stack a ${team} pass-catcher`,
      landTarget: (u) => `land ${u.name}`,
      urgent,
      playUrgency,
      otherwise: "Average QB2 otherwise.",
    }),
    play_urgency: playUrgency ?? undefined,
    format_gates: playFormatGates.qb_wr_stack,
  };
}

/**
 * Anchor RB + Handcuff. Triggered by an elite RB pick. Looks for the
 * same team's backup RB in the available pool.
 */
function detectAnchorHandcuff(args: {
  winner: AvailablePlayer;
  winnerPos: Position;
  available: AvailablePlayer[];
  ktcValues: Record<string, number>;
  winnerKtcRank: number;
  survival?: SurvivalResolver;
}): Play | null {
  if (args.winnerPos !== "RB") return null;
  if (!args.winner.team) return null;
  if (args.winnerKtcRank > ELITE_RB_KTC_RANK_CAP) return null;

  const sameTeamRBs = args.available.filter((p) => {
    if (p.id === args.winner.id) return false;
    if (p.team !== args.winner.team) return false;
    const pos = (p.position ?? "").toUpperCase();
    return pos === "RB";
  });
  if (sameTeamRBs.length === 0) return null;

  const sortedHandcuffs = sortByKtcValue(sameTeamRBs, args.ktcValues).slice(
    0,
    HANDCUFF_CANDIDATES,
  );
  const handcuffRefs = toPartnerRefs(
    sortedHandcuffs,
    args.ktcValues,
    args.survival,
  );
  if (handcuffRefs.length === 0) return null;

  const playUrgency = derivePlayUrgency(handcuffRefs);
  const urgent = urgentPartnerOf(handcuffRefs);
  const lead = handcuffRefs[0].name;

  return {
    archetype: "anchor_handcuff",
    name: `${args.winner.name} + Handcuff`,
    primary_player: toPlayPlayerRef(args.winner)!,
    upside_thesis: `Top RBs go down. ${args.winner.team}'s backup converts to a startable RB on injury. Without the handcuff, you eat zero on that injury week and your season hinges on waivers.`,
    followthrough: {
      description: followThroughDescription({
        partners: handcuffRefs,
        faNote: "Grab via FA immediately if they leave the board first.",
      }),
      target_candidates: handcuffRefs,
      picks_window: HANDCUFF_LAPSE_ROUNDS,
    },
    genius_vs_average_line: geniusVsAverage({
      coreAction: `lock down ${lead}`,
      landTarget: (u) => `lock down ${u.name}`,
      urgent,
      playUrgency,
      otherwise: "One injury away from a season tank otherwise.",
    }),
    play_urgency: playUrgency ?? undefined,
    format_gates: playFormatGates.anchor_handcuff,
  };
}

/**
 * Bridge QB -> Developmental QB. Triggered in SF / 2QB when the user
 * takes an aging starter. The play is the 2-year succession. The
 * superflex requirement is enforced by the format-gate matrix
 * (canEmitPlay), not an inline check here.
 */
function detectBridgeQb(args: {
  winner: AvailablePlayer;
  winnerPos: Position;
  available: AvailablePlayer[];
  ktcValues: Record<string, number>;
  survival?: SurvivalResolver;
}): Play | null {
  if (args.winnerPos !== "QB") return null;
  const age = args.winner.age ?? 0;
  if (age < 30) return null;

  const devQbs = args.available.filter((p) => {
    if (p.id === args.winner.id) return false;
    const pos = (p.position ?? "").toUpperCase();
    if (pos !== "QB") return false;
    const pAge = p.age ?? 99;
    const yearsExp = p.yearsExp ?? 99;
    return p.is_rookie || pAge <= 24 || yearsExp <= 2;
  });
  if (devQbs.length === 0) return null;

  const sortedDevs = sortByKtcValue(devQbs, args.ktcValues).slice(
    0,
    BRIDGE_DEV_QB_CANDIDATES,
  );
  const devRefs = toPartnerRefs(sortedDevs, args.ktcValues, args.survival);
  if (devRefs.length === 0) return null;

  const playUrgency = derivePlayUrgency(devRefs);
  const urgent = urgentPartnerOf(devRefs);
  const lead = devRefs[0].name;

  return {
    archetype: "bridge_qb",
    name: `${args.winner.name} Bridge + Dev QB`,
    primary_player: toPlayPlayerRef(args.winner)!,
    upside_thesis: `${args.winner.name} starts now (age ${age}) but the runway is short. Pair him with a young developmental QB to inherit the SF QB1 slot when ${args.winner.name} retires or declines.`,
    followthrough: {
      description: followThroughDescription({
        partners: devRefs,
        faNote: "Build the QB succession; do not reach for a rookie QB next offseason.",
      }),
      target_candidates: devRefs,
      picks_window: BRIDGE_QB_LAPSE_ROUNDS,
    },
    genius_vs_average_line: geniusVsAverage({
      coreAction: `pair ${args.winner.name} with a young dev QB (${lead} is the top option)`,
      landTarget: (u) => `pair ${args.winner.name} with ${u.name}`,
      urgent,
      playUrgency,
      otherwise: "Bridge to nowhere otherwise.",
    }),
    play_urgency: playUrgency ?? undefined,
    format_gates: playFormatGates.bridge_qb,
  };
}

export type OwnedRosterPlayer = {
  id: string;
  name: string;
  position: Position;
  team: string | null;
  age: number | null;
  is_rookie: boolean;
  yearsExp: number;
};

/**
 * Suggest plays the engine sees as possible based on the user's
 * CURRENT roster (already-drafted players + active-draft picks).
 * Distinct from detectPlaysEnabledBy which only fires for the
 * immediate pick decision.
 *
 * Filtering rules:
 *   - A suggestion fires for each owned player that, treated as the
 *     "trigger pick," activates a library archetype.
 *   - Suggestions whose follow-through targets are already on the
 *     user's roster get filtered out (play implicitly executed).
 *   - Dedupe by (archetype, primary_player_id).
 */
export function suggestPlaysFromRoster(args: {
  snap: LeagueSnapshot;
  available: AvailablePlayer[];
  ktcValues: Record<string, number>;
  ownedPlayers: OwnedRosterPlayer[];
  survival?: SurvivalResolver;
}): Play[] {
  if (args.ownedPlayers.length === 0) return [];

  const ownedIds = new Set(args.ownedPlayers.map((p) => p.id));
  const suggestions: Play[] = [];

  for (const player of args.ownedPlayers) {
    const winnerLike = {
      id: player.id,
      name: player.name,
      position: player.position,
      team: player.team,
      age: player.age,
      yearsExp: player.yearsExp,
      is_rookie: player.is_rookie,
      adp: null,
      adp_variant: null,
      search_rank: 100,
      dynasty_rank: 100,
    } as unknown as AvailablePlayer;
    const plays = detectPlaysEnabledBy({
      winner: winnerLike,
      snap: args.snap,
      available: [winnerLike, ...args.available],
      ktcValues: args.ktcValues,
      survival: args.survival,
    });
    suggestions.push(...plays);
  }

  // Dedupe by archetype + primary player.
  const seen = new Set<string>();
  const deduped: Play[] = [];
  for (const p of suggestions) {
    const key = `${p.archetype}:${p.primary_player.player_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
  }

  // Filter out plays whose follow-through is already on the roster.
  return deduped.filter(
    (p) =>
      !p.followthrough.target_candidates.some((t) => ownedIds.has(t.player_id)),
  );
}

// Roster-shape plays don't lapse on a draft-pick window; they are
// season-long. A very large window keeps the storage lapse math from
// ever firing during a draft.
const SEASON_LONG_NO_LAPSE_ROUNDS = 999;

/**
 * QB Hoard. A roster-shape play (not triggered by one pick): in a 1QB
 * league, holding QBs well past the starter requirement turns the
 * surplus into an in-season trade asset. Format-gated to 1QB via
 * canEmitPlay; in superflex / 2QB a third QB is depth, not surplus.
 */
function detectQbHoard(args: {
  snap: LeagueSnapshot;
  ownedPlayers: OwnedRosterPlayer[];
  ktcValues: Record<string, number>;
}): Play | null {
  if (!canEmitPlay(args.snap, "qb_hoard")) return null;
  const fmt = buildFormatRulesFromSnapshot(args.snap);
  const qbs = args.ownedPlayers.filter((p) => p.position === "QB");
  const threshold = fmt.qb_starters_max + QB_HOARD_SURPLUS_OVER_STARTERS;
  if (qbs.length < threshold) return null;

  // Anchor on the highest-value owned QB so the play has a real, stable
  // primary. The surplus QBs are named in the thesis.
  const sortedQbs = [...qbs].sort(
    (a, b) => (args.ktcValues[b.id] ?? 0) - (args.ktcValues[a.id] ?? 0),
  );
  const names = sortedQbs.map((q) => q.name);
  const anchor = sortedQbs[0];

  return {
    archetype: "qb_hoard",
    name: "QB Hoard",
    primary_player: {
      player_id: anchor.id,
      name: anchor.name,
      position: "QB",
      team: anchor.team,
    },
    upside_thesis: `You hold ${qbs.length} QBs (${names.join(", ")}) in a ${fmt.qb_starters_max}-QB league. QB scoring is replaceable week to week, but a contender whose QB1 goes down will overpay. The surplus is a trade asset, not bench rot.`,
    followthrough: {
      description:
        "Hold the surplus. Shop your most expendable QB when the first contender loses a starter (QB injuries spike weeks 6-12); do not pre-sell at a discount.",
      target_candidates: [],
      picks_window: SEASON_LONG_NO_LAPSE_ROUNDS,
    },
    genius_vs_average_line:
      "Genius if you flip a surplus QB when a contender's starter goes down. Bench rot otherwise.",
    format_gates: playFormatGates.qb_hoard,
    auto_active: true,
  };
}

/**
 * Detect plays that emerge from the user's whole roster shape rather
 * than a single trigger pick. Today: QB Hoard. Future: multi-handcuff
 * lottery. Lane-path plays come from detectLanePlays (separate input).
 */
export function detectRosterShapePlays(args: {
  snap: LeagueSnapshot;
  ownedPlayers: OwnedRosterPlayer[];
  ktcValues: Record<string, number>;
}): Play[] {
  const plays: Play[] = [];
  const hoard = detectQbHoard(args);
  if (hoard) plays.push(hoard);
  return plays;
}

// Pure-posture horizon lanes are a stance, not a play. The archetype
// and composite lanes (RB Bellcow, WR Stable, Future Stock, ...) are
// the paths a user actively builds, so only those become plays.
const LANE_PLAY_EXCLUDE: ReadonlySet<string> = new Set([
  "win_now_floor",
  "balanced",
]);

function laneFollowThrough(
  m: LaneMembership,
  move: IdentityMove | undefined,
): string {
  if (m.state !== "close") {
    return `Keep adding pieces that fit ${m.label}.`;
  }
  const parts: string[] = [m.gap?.description ?? `Close the gap to ${m.label}.`];
  if (move && move.targets.length > 0) {
    const t = move.targets
      .slice(0, 3)
      .map(
        (x) => `${x.name} (${x.owner_name ?? "FA"}, val ${Math.round(x.value)})`,
      )
      .join("; ");
    parts.push(`Targets: ${t}.`);
  }
  if (move && move.funding.length > 0) {
    parts.push(
      `Package: ${move.funding.slice(0, 3).map((x) => x.name).join(", ")}.`,
    );
  }
  return parts.join(" ");
}

/**
 * Fold roster build identity (aggregateRosterIdentity → LaneMembership)
 * into committable plays. A build you FIT or PARTLY FIT is a path you
 * are running; the plays panel is the cornerstone for those paths
 * (founder direction 2026-05-21). CLOSE-build plays carry the named
 * trade targets + funding from the identity move so the richness of
 * the retired build-fit chips is preserved.
 */
export function detectLanePlays(
  memberships: LaneMembership[],
  moves: IdentityMove[] = [],
): Play[] {
  const movesByLane = new Map(moves.map((mv) => [mv.lane_id, mv]));
  const plays: Play[] = [];
  for (const m of memberships) {
    if (m.state === "not_in") continue;
    if (LANE_PLAY_EXCLUDE.has(m.lane_id)) continue;

    const rawPos = (m.contributors[0]?.position ?? "RB").toUpperCase();
    const position = (
      ["QB", "RB", "WR", "TE", "K", "DST"].includes(rawPos) ? rawPos : "RB"
    ) as Position;
    const genius =
      m.state === "close"
        ? `One move from ${m.label}: ${m.gap?.description ?? "close the gap."}`
        : `You fit ${m.label}. ${m.blurb}`;

    plays.push({
      archetype: "lane_path",
      name: m.label,
      primary_player: {
        player_id: `lane:${m.lane_id}`,
        name: m.label,
        position,
        team: null,
      },
      upside_thesis: m.blurb,
      followthrough: {
        description: laneFollowThrough(m, movesByLane.get(m.lane_id)),
        target_candidates: [],
        picks_window: SEASON_LONG_NO_LAPSE_ROUNDS,
      },
      genius_vs_average_line: genius,
      format_gates: playFormatGates.lane_path,
      // A build the roster FITS is already running; PARTLY-FIT builds
      // are one move away, so they read as suggestions, not active.
      auto_active: m.state === "in",
    });
  }
  return plays;
}

/**
 * Detect all plays the winner candidate enables. Returns an empty
 * array when no plays apply. Order matters: the most-conditional play
 * (stack / handcuff) is listed before the more situational (bridge).
 * Format gates (canEmitPlay) suppress plays the league format does not
 * support before detection runs.
 */
export function detectPlaysEnabledBy(args: {
  winner: AvailablePlayer;
  snap: LeagueSnapshot;
  available: AvailablePlayer[];
  ktcValues: Record<string, number>;
  survival?: SurvivalResolver;
}): Play[] {
  const winnerPos = (args.winner.position ?? "").toUpperCase() as Position;
  if (!["QB", "RB", "WR", "TE"].includes(winnerPos)) return [];

  // Winner's KTC rank in their position, used as the "elite" /
  // "starting-tier" gate.
  const samePosPool = args.available.filter(
    (p) =>
      (p.position ?? "").toUpperCase() === winnerPos &&
      typeof args.ktcValues[p.id] === "number",
  );
  const sortedByValue = sortByKtcValue(samePosPool, args.ktcValues);
  const winnerKtcRank = sortedByValue.findIndex((p) => p.id === args.winner.id);
  const effectiveRank = winnerKtcRank >= 0 ? winnerKtcRank + 1 : 999;

  const plays: Play[] = [];

  if (canEmitPlay(args.snap, "qb_wr_stack")) {
    const stack = detectQbWrStack({
      winner: args.winner,
      winnerPos,
      available: args.available,
      ktcValues: args.ktcValues,
      winnerKtcRank: effectiveRank,
      survival: args.survival,
    });
    if (stack) plays.push(stack);
  }

  if (canEmitPlay(args.snap, "anchor_handcuff")) {
    const handcuff = detectAnchorHandcuff({
      winner: args.winner,
      winnerPos,
      available: args.available,
      ktcValues: args.ktcValues,
      winnerKtcRank: effectiveRank,
      survival: args.survival,
    });
    if (handcuff) plays.push(handcuff);
  }

  if (canEmitPlay(args.snap, "bridge_qb")) {
    const bridge = detectBridgeQb({
      winner: args.winner,
      winnerPos,
      available: args.available,
      ktcValues: args.ktcValues,
      survival: args.survival,
    });
    if (bridge) plays.push(bridge);
  }

  return plays;
}
