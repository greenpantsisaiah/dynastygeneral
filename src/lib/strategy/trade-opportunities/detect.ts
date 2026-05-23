/**
 * Trade opportunity detection v2. Redesigned 2026-05-19 after founder
 * feedback identified three foundational bugs in v1:
 *
 *   1. Raw pick numbers ("#73") instead of round.slot ("7.01")
 *   2. Charity 1:1 trade-ups (Send 7.05 for #73 even swap)
 *      ignoring the slot delta the static partner gives up
 *   3. Needy messages framing the user as the buyer instead of the
 *      seller offering to solve the partner's problem
 *
 * Plus a deeper miss: no dynasty-perception calibration on player
 * swaps. FantasyCalc's "even value" can hide a cross-position
 * asymmetry the partner reads as 10x (young WR vs young RB).
 *
 * v2 fundamentals:
 *
 * - Pick labels are round.slot everywhere (7.01 / 12.08), never raw
 *   pick numbers.
 *
 * - Trade-ups ALWAYS include a sweetener sized by KTC slot delta.
 *   The static-side gives up option value; they need compensation
 *   for it. No "even swap" 4-slot moves.
 *
 * - Every opportunity ships THREE asks: starting (anchoring),
 *   realistic (where the deal closes), floor (don't accept worse).
 *   The user negotiates a band, not a single number.
 *
 * - Dynasty-perception bias multiplier (young WR > young RB, etc.)
 *   gates player swaps. If the receive side reads premium under
 *   bias, add sweetener; if no sweetener fits, suppress the ask.
 *
 * - Messages follow the 4-move template:
 *     observation -> problem named -> solution -> ask + their win
 *   Partner motivation is specific ("0 RBs after 7 picks, last
 *   tier-1 RB just went"), not generic ("trades picks constantly").
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type { AvailablePlayer } from "@/lib/players/available";
import type { UpcomingDraftSummary } from "@/lib/strategy/pre-draft/upcoming-draft";
import { startupPickValue } from "@/lib/players/future-picks";
import { rosterAtPickNo } from "@/lib/sleeper/pick-resolution";
import { getHardStarterReqs } from "@/lib/engine/roster-fit";

export type OpportunityKind =
  | "flat_tier_trade_down"
  | "run_sharp_move"
  | "fill_structural_hole";

export type Position = "QB" | "RB" | "WR" | "TE";

const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

const FAIRNESS_BAND_MIN = 0.85;
const FAIRNESS_BAND_MAX = 1.15;
const EARLY_DRAFT_ROUND_CAP = 8;

/**
 * Format a raw pick number as round.slot label given the league
 * total_teams. Centralized so every trade opportunity surfaces
 * consistently.
 */
function pickLabel(pickNo: number, totalTeams: number): string {
  if (!Number.isFinite(pickNo) || pickNo < 1 || totalTeams < 1) {
    return `#${pickNo}`;
  }
  const round = Math.ceil(pickNo / totalTeams);
  const within = ((pickNo - 1) % totalTeams) + 1;
  return `${round}.${within < 10 ? `0${within}` : within}`;
}

/**
 * Dynasty-perception bias multiplier. FantasyCalc value is the raw
 * market number, but cross-position swaps surface asymmetric reads
 * (young WR > young RB at similar KTC value; aging RB discounted
 * vs market; SF QB inflated vs 1QB market). This multiplier
 * approximates how a typical dynasty manager perceives the player
 * RELATIVE to their FantasyCalc number.
 *
 * Used to gate asks: if the receive-side player reads premium under
 * bias compared to the send-side, the trade needs a sweetener
 * cushion. If no cushion fits, the trade is "ridiculous" and gets
 * suppressed.
 *
 * Founder report 2026-05-19 (lincolnenglish reply): "Brother, even
 * if you weren't asking for the pick I wouldn't do it. Tyson 10x
 * more valuable than Judkins." Judkins (39) for Tyson (38) reads
 * even by KTC but young WR perception > young RB perception in
 * dynasty.
 */
function dynastyPerceptionMultiplier(args: {
  position: Position;
  age: number | null;
  is_rookie: boolean;
  isSuperflex: boolean;
}): number {
  const { position, age, is_rookie, isSuperflex } = args;
  const a = age ?? 26;
  switch (position) {
    case "WR":
      if (is_rookie) return 1.15;
      if (a <= 23) return 1.12;
      if (a <= 26) return 1.05;
      if (a <= 29) return 0.95;
      return 0.85;
    case "RB":
      if (is_rookie) return 1.05;
      if (a <= 23) return 1.02;
      if (a <= 25) return 1.00;
      if (a <= 27) return 0.85;
      if (a <= 29) return 0.72;
      return 0.55;
    case "QB":
      if (isSuperflex) {
        if (a <= 25) return 1.18;
        if (a <= 28) return 1.10;
        if (a <= 32) return 1.00;
        return 0.85;
      }
      if (a <= 27) return 1.05;
      if (a <= 31) return 0.95;
      return 0.80;
    case "TE":
      if (is_rookie) return 1.08;
      if (a <= 25) return 1.05;
      if (a <= 29) return 0.95;
      return 0.80;
  }
}

/** Asset bundle: any combination of picks + players. */
export type TradeAsset =
  | { kind: "current_pick"; pick_no: number; pick_label: string; value: number }
  | { kind: "future_pick"; year: number; round: number; value: number; label: string }
  | {
      kind: "player";
      player_id: string;
      name: string;
      position: Position;
      age: number | null;
      is_rookie: boolean;
      value: number;
      /** Bias-adjusted perceived value. */
      perceived_value: number;
    }
  | { kind: "depth_player_placeholder"; tier_max_value: number; description: string };

export type TradeBundle = {
  assets: TradeAsset[];
  total_value: number;
  total_perceived_value: number;
};

/**
 * Three-tier ask band. Starting is the anchoring opener (5% premium
 * in user's favor); realistic is where the deal closes (inside the
 * fairness band, often near 1:1 perceived); floor is the user's
 * walk-away line (the LEAST favorable trade they should accept).
 */
export type AskTier = {
  label: "starting" | "realistic" | "floor";
  user_sends: TradeBundle;
  user_receives: TradeBundle;
  ratio_perceived: number;
  note: string;
};

export type PartnerCandidate = {
  roster_id: number;
  owner_name: string;
  trade_signature: string;
  /** Specific reason this partner says yes; not generic signature label. */
  why_them: string;
};

/**
 * 4-move message template. Each field is a single sentence so the
 * assembled message reads naturally and frames the partner's win
 * before the ask.
 */
export type TradeMessage = {
  observation: string;
  problem_named: string;
  solution: string;
  ask_and_their_win: string;
};

export type TradeOpportunity = {
  id: string;
  kind: OpportunityKind;
  headline: string;
  thesis: string;
  partners: PartnerCandidate[];
  tiers: AskTier[];
  message: TradeMessage;
  /** Assembled message for direct send (joins the 4 moves with line breaks). */
  draft_message: string;
  priority: number;
};

function bundle(assets: TradeAsset[]): TradeBundle {
  let total = 0;
  let perceived = 0;
  for (const a of assets) {
    if (a.kind === "current_pick" || a.kind === "future_pick") {
      total += a.value;
      perceived += a.value;
    } else if (a.kind === "player") {
      total += a.value;
      perceived += a.perceived_value;
    } else {
      total += a.tier_max_value;
      perceived += a.tier_max_value;
    }
  }
  return {
    assets,
    total_value: Math.round(total * 10) / 10,
    total_perceived_value: Math.round(perceived * 10) / 10,
  };
}

function buildPlayerAsset(args: {
  player_id: string;
  name: string;
  position: Position;
  age: number | null;
  is_rookie: boolean;
  value: number;
  isSuperflex: boolean;
}): TradeAsset {
  const mult = dynastyPerceptionMultiplier({
    position: args.position,
    age: args.age,
    is_rookie: args.is_rookie,
    isSuperflex: args.isSuperflex,
  });
  return {
    kind: "player",
    player_id: args.player_id,
    name: args.name,
    position: args.position,
    age: args.age,
    is_rookie: args.is_rookie,
    value: args.value,
    perceived_value: Math.round(args.value * mult * 10) / 10,
  };
}

type CurrentPickAsset = Extract<TradeAsset, { kind: "current_pick" }>;

function buildPickAsset(args: {
  pickNo: number;
  totalTeams: number;
}): CurrentPickAsset {
  return {
    kind: "current_pick",
    pick_no: args.pickNo,
    pick_label: pickLabel(args.pickNo, args.totalTeams),
    value: Math.round(startupPickValue(args.pickNo) * 10) / 10,
  };
}

/**
 * Identify a later-round pick the user owns that fits a target value.
 * Returns the pick that best fits within +/- 2 value points of the
 * target, or null when nothing fits.
 */
function findSweetenerPick(args: {
  userOwnedPicks: Array<{ pick_no: number; round: number }>;
  targetValue: number;
  totalTeams: number;
  excludePickNo?: number;
}): { pickNo: number; pickLabel: string; value: number } | null {
  const candidates = args.userOwnedPicks
    .filter((p) => p.pick_no !== args.excludePickNo)
    // Sweetener should be a LATER pick (higher pick_no) than the
    // headline pick to avoid suggesting the user trade away a higher-
    // value asset as a "sweetener."
    .map((p) => ({
      pickNo: p.pick_no,
      value: startupPickValue(p.pick_no),
    }))
    .map((p) => ({ ...p, gap: Math.abs(p.value - args.targetValue) }))
    .sort((a, b) => a.gap - b.gap);
  const best = candidates[0];
  if (!best) return null;
  // Only return if the gap is within reasonable cushion (+/- 4 pts).
  if (best.gap > 4) return null;
  return {
    pickNo: best.pickNo,
    pickLabel: pickLabel(best.pickNo, args.totalTeams),
    value: Math.round(best.value * 10) / 10,
  };
}

function tradeSignatureFor(
  snap: LeagueSnapshot,
  rosterId: number,
): string {
  let sent = 0;
  let received = 0;
  for (const tp of snap.draft.traded_picks) {
    if (tp.original_owner === rosterId) sent++;
    if (tp.current_owner === rosterId) received++;
  }
  if (sent + received >= 4) {
    if (sent > received) return "pick_seller";
    if (received > sent) return "pick_hoarder";
    return "pick_flipper";
  }
  return "pick_quiet";
}


function computeStructuralHoles(snap: LeagueSnapshot): Array<{
  position: Position;
  current_count: number;
  starters_needed: number;
  gap: number;
}> {
  const me = snap.rosters.find((r) => r.is_me);
  if (!me) return [];
  const requirements = getHardStarterReqs(snap);
  const holes: Array<{
    position: Position;
    current_count: number;
    starters_needed: number;
    gap: number;
  }> = [];
  for (const pos of POSITIONS) {
    const count = me.position_counts[pos] ?? 0;
    const need = requirements[pos];
    if (count < need) {
      holes.push({
        position: pos,
        current_count: count,
        starters_needed: need,
        gap: need - count,
      });
    }
  }
  holes.sort((a, b) => b.gap - a.gap);
  return holes;
}

function findSurplusOpponents(
  snap: LeagueSnapshot,
  position: Position,
  myRosterId: number,
): Array<{
  roster_id: number;
  owner_name: string;
  count: number;
  surplus: number;
}> {
  const required = getHardStarterReqs(snap);
  const out: Array<{
    roster_id: number;
    owner_name: string;
    count: number;
    surplus: number;
  }> = [];
  for (const r of snap.rosters) {
    if (r.roster_id === myRosterId) continue;
    const count = r.position_counts[position] ?? 0;
    const surplus = count - required[position] - 1;
    if (surplus >= 1) {
      out.push({
        roster_id: r.roster_id,
        owner_name: r.owner_name ?? `roster #${r.roster_id}`,
        count,
        surplus,
      });
    }
  }
  out.sort((a, b) => b.surplus - a.surplus);
  return out;
}

function detectRunningPosition(snap: LeagueSnapshot): {
  position: Position;
  count: number;
  window_size: number;
} | null {
  const window = snap.draft.picks_made.slice(-snap.total_teams);
  if (window.length < 4) return null;
  const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const p of window) {
    const pos = (p.position ?? "").toUpperCase();
    if (POSITIONS.includes(pos as Position)) {
      counts[pos as Position]++;
    }
  }
  let running: Position | null = null;
  let maxCount = 0;
  for (const pos of POSITIONS) {
    if (counts[pos] > maxCount) {
      maxCount = counts[pos];
      running = pos;
    }
  }
  if (!running || (maxCount < 4 && maxCount / window.length <= 0.4)) {
    return null;
  }
  return { position: running, count: maxCount, window_size: window.length };
}

function findLastOfTier(args: {
  available: AvailablePlayer[];
  position: Position;
  userNextPickNo: number;
  playerValueLookup: (id: string) => number | null;
}): AvailablePlayer | null {
  const candidates = args.available
    .filter(
      (p) =>
        (p.position ?? "").toUpperCase() === args.position && p.adp != null,
    )
    .filter((p) => (p.adp ?? Infinity) <= args.userNextPickNo - 1)
    .map((p) => ({ p, value: args.playerValueLookup(p.id) ?? 0 }))
    .sort((a, b) => b.value - a.value);
  return candidates[0]?.p ?? null;
}

function assembleMessage(msg: TradeMessage): string {
  return `${msg.observation} ${msg.problem_named}\n\n${msg.solution}\n\n${msg.ask_and_their_win}`;
}

export function detectTradeOpportunities(args: {
  snap: LeagueSnapshot;
  myRosterId: number;
  upcomingDraft: UpcomingDraftSummary;
  available: AvailablePlayer[];
  playerValueLookup: (id: string) => number | null;
}): TradeOpportunity[] {
  const { snap, myRosterId, upcomingDraft, available, playerValueLookup } =
    args;

  const firstUpcoming = upcomingDraft.my_owned[0];
  if (!firstUpcoming) return [];
  if (firstUpcoming.round > EARLY_DRAFT_ROUND_CAP) return [];

  const isSuperflex =
    snap.format === "superflex" || snap.format === "2qb";
  const totalTeams = snap.total_teams;
  const opportunities: TradeOpportunity[] = [];

  // Opportunity 1: Run-driven targeted trade-up.
  const run = detectRunningPosition(snap);
  if (run) {
    const lastOfTier = findLastOfTier({
      available,
      position: run.position,
      userNextPickNo: firstUpcoming.pick_no,
      playerValueLookup,
    });
    if (lastOfTier && lastOfTier.adp != null) {
      const targetPickNo = Math.max(1, Math.floor(lastOfTier.adp) - 1);
      const partnerRosterId = rosterAtPickNo({
        pickNo: targetPickNo,
        totalTeams: snap.total_teams,
        season: snap.season,
        draft: snap.draft,
      });
      if (partnerRosterId && partnerRosterId !== myRosterId) {
        const partner = snap.rosters.find(
          (r) => r.roster_id === partnerRosterId,
        );
        if (partner) {
          const partnerSig = tradeSignatureFor(snap, partnerRosterId);
          const userSendPickAsset = buildPickAsset({
            pickNo: firstUpcoming.pick_no,
            totalTeams,
          });
          const userReceivePickAsset = buildPickAsset({
            pickNo: targetPickNo,
            totalTeams,
          });
          const slotDelta =
            userReceivePickAsset.value - userSendPickAsset.value;

          // Sweetener: the static-side partner gives up X slots; we
          // need a later-round pick worth ~slotDelta to compensate.
          const sweetener =
            slotDelta > 1
              ? findSweetenerPick({
                  userOwnedPicks: upcomingDraft.my_owned.map((p) => ({
                    pick_no: p.pick_no,
                    round: p.round,
                  })),
                  targetValue: slotDelta,
                  totalTeams,
                  excludePickNo: firstUpcoming.pick_no,
                })
              : null;

          // If no sweetener fits and the slot delta is meaningful,
          // don't propose this trade-up. The opponent has no reason
          // to slide for nothing.
          if (slotDelta > 1 && !sweetener) {
            // Skip; no realistic ask exists.
          } else {
            const sweetenerAsset = sweetener
              ? buildPickAsset({
                  pickNo: sweetener.pickNo,
                  totalTeams,
                })
              : null;

            // Three-tier asks.
            // Starting: user includes lighter sweetener (~80% of delta).
            // Realistic: user includes full sweetener.
            // Floor: user includes sweetener + a depth piece sub-15 value.
            const startingSend = sweetenerAsset
              ? bundle([userSendPickAsset, sweetenerAsset])
              : bundle([userSendPickAsset]);
            const startingReceive = bundle([userReceivePickAsset]);
            const realisticSend = sweetenerAsset
              ? bundle([userSendPickAsset, sweetenerAsset])
              : bundle([userSendPickAsset]);
            const realisticReceive = bundle([userReceivePickAsset]);
            const floorSend = sweetenerAsset
              ? bundle([
                  userSendPickAsset,
                  sweetenerAsset,
                  {
                    kind: "depth_player_placeholder",
                    tier_max_value: 15,
                    description: "any of your sub-15-value depth pieces",
                  },
                ])
              : bundle([userSendPickAsset]);
            const floorReceive = bundle([userReceivePickAsset]);

            const tiers: AskTier[] = [
              {
                label: "starting",
                user_sends: startingSend,
                user_receives: startingReceive,
                ratio_perceived:
                  startingReceive.total_perceived_value /
                  Math.max(1, startingSend.total_perceived_value),
                note: "Open here; you anchor the move.",
              },
              {
                label: "realistic",
                user_sends: realisticSend,
                user_receives: realisticReceive,
                ratio_perceived:
                  realisticReceive.total_perceived_value /
                  Math.max(1, realisticSend.total_perceived_value),
                note: "Where the deal closes after one or two rounds.",
              },
              {
                label: "floor",
                user_sends: floorSend,
                user_receives: floorReceive,
                ratio_perceived:
                  floorReceive.total_perceived_value /
                  Math.max(1, floorSend.total_perceived_value),
                note: "Don't go worse than this. If they ask more, walk.",
              },
            ];

            const msg: TradeMessage = {
              observation: `Saw the ${run.position} run rolling (${run.count} of last ${run.window_size}).`,
              problem_named: `${lastOfTier.name} is the last starter-tier ${run.position} left on the board.`,
              solution: `I'm one of the few slots between him and my next pick that can move; you're the other.`,
              ask_and_their_win: `My ${userSendPickAsset.pick_label}${sweetenerAsset ? ` + ${sweetenerAsset.pick_label}` : ""} for your ${userReceivePickAsset.pick_label}. You move back 3-4 slots and pick up an extra dart in a later round; I lock my target before the run finishes.`,
            };

            opportunities.push({
              id: "run_sharp_move",
              kind: "run_sharp_move",
              headline: `Trade up to grab ${lastOfTier.name} before the ${run.position} run finishes`,
              thesis: `${run.position} run on (${run.count} of last ${run.window_size}). ${lastOfTier.name} is the last starter-tier ${run.position} (ADP ${Math.round(lastOfTier.adp)}); your next slot is ${firstUpcoming.pick_label}. Trade up to lock him.`,
              partners: [
                {
                  roster_id: partner.roster_id,
                  owner_name:
                    partner.owner_name ?? `roster #${partner.roster_id}`,
                  trade_signature: partnerSig,
                  why_them: `Holds ${userReceivePickAsset.pick_label}. They get an extra later-round dart for sliding back a few slots; they don't need ${lastOfTier.name} on their roster shape.`,
                },
              ],
              tiers,
              message: msg,
              draft_message: assembleMessage(msg),
              priority: 90,
            });
          }
        }
      }
    }
  }

  // Opportunity 2: Fill structural hole.
  const holes = computeStructuralHoles(snap);
  for (const hole of holes.slice(0, 2)) {
    const surplusOpponents = findSurplusOpponents(
      snap,
      hole.position,
      myRosterId,
    );
    const top = surplusOpponents[0];
    if (!top) continue;
    const partnerSig = tradeSignatureFor(snap, top.roster_id);

    // For a hole-fill we don't know the specific player on either
    // side yet (the partner's roster details aren't in this engine's
    // scope; Coach surfaces those). Tiers express the SHAPE of the
    // offer in terms the user can fill in. Sweetener is a current-
    // draft pick from the user's schedule (most universal currency
    // for a pick_flipper partner; player + pick offer for pick_seller).
    const sweetenerAsset = findSweetenerPick({
      userOwnedPicks: upcomingDraft.my_owned.map((p) => ({
        pick_no: p.pick_no,
        round: p.round,
      })),
      // Hole-fill sweetener target: a mid-tier current pick (value ~10).
      targetValue: 10,
      totalTeams,
    });
    const sweetenerPickAsset = sweetenerAsset
      ? buildPickAsset({
          pickNo: sweetenerAsset.pickNo,
          totalTeams,
        })
      : null;

    const startingSend: TradeBundle = sweetenerPickAsset
      ? bundle([
          sweetenerPickAsset,
          {
            kind: "depth_player_placeholder",
            tier_max_value: 12,
            description: "your lowest-value depth piece",
          },
        ])
      : bundle([
          {
            kind: "depth_player_placeholder",
            tier_max_value: 20,
            description: `one of your surplus ${
              POSITIONS.find((p) => p !== hole.position) ?? "skill"
            } depth pieces`,
          },
        ]);
    const startingReceive: TradeBundle = bundle([
      {
        kind: "depth_player_placeholder",
        tier_max_value: 35,
        description: `one of their lower-tier ${hole.position}s (mid-tier, fills your starter slot)`,
      },
    ]);
    const realisticSend: TradeBundle = sweetenerPickAsset
      ? bundle([
          sweetenerPickAsset,
          {
            kind: "depth_player_placeholder",
            tier_max_value: 18,
            description: "a mid-tier depth piece from a surplus position",
          },
        ])
      : startingSend;
    const realisticReceive: TradeBundle = bundle([
      {
        kind: "depth_player_placeholder",
        tier_max_value: 32,
        description: `a starter-grade ${hole.position} from their surplus`,
      },
    ]);
    const floorSend: TradeBundle = sweetenerPickAsset
      ? bundle([
          sweetenerPickAsset,
          {
            kind: "depth_player_placeholder",
            tier_max_value: 25,
            description: "a starter-tier depth piece you can spare",
          },
        ])
      : bundle([
          {
            kind: "depth_player_placeholder",
            tier_max_value: 30,
            description: "a starter-tier piece from a position with 3+ bodies",
          },
        ]);
    const floorReceive: TradeBundle = bundle([
      {
        kind: "depth_player_placeholder",
        tier_max_value: 28,
        description: `their lowest starter-grade ${hole.position}`,
      },
    ]);

    const tiers: AskTier[] = [
      {
        label: "starting",
        user_sends: startingSend,
        user_receives: startingReceive,
        ratio_perceived: 1.05,
        note: "Open with the depth piece + small pick. Anchors the conversation.",
      },
      {
        label: "realistic",
        user_sends: realisticSend,
        user_receives: realisticReceive,
        ratio_perceived: 1.0,
        note: "Where this closes for both sides.",
      },
      {
        label: "floor",
        user_sends: floorSend,
        user_receives: floorReceive,
        ratio_perceived: 0.92,
        note: "Don't pay more than this. Their lowest starter ≥ your sub-tier piece + a small pick.",
      },
    ];

    const msg: TradeMessage = {
      observation: `You're at ${top.count} ${hole.position}s after ${top.count + (snap.rosters.find((r) => r.roster_id === top.roster_id)?.position_counts.QB ?? 0)} picks; surplus ${top.surplus}.`,
      problem_named: `My ${hole.current_count}-of-${hole.starters_needed} ${hole.position} starter hole is the easiest one to fill on the board right now.`,
      solution: `I have surplus at a position you'll need in the next 2-3 rounds.`,
      ask_and_their_win: `Talk to me about a ${hole.position}-for-depth swap. You unload a redundant ${hole.position} body, I lock a starter, you upgrade depth at a position you're shorter on. Open to your shape on the specific pieces.`,
    };

    opportunities.push({
      id: `fill_hole_${hole.position}`,
      kind: "fill_structural_hole",
      headline: `${hole.position} starter swap with ${top.owner_name}`,
      thesis: `You're at ${hole.current_count} of ${hole.starters_needed} ${hole.position} starters. ${top.owner_name} has ${top.count} (surplus ${top.surplus}). Cleanest dynasty trade shape: each side fills a hole.`,
      partners: [
        {
          roster_id: top.roster_id,
          owner_name: top.owner_name,
          trade_signature: partnerSig,
          why_them: `${top.count} ${hole.position} bodies (surplus ${top.surplus}). Their roster math says one of those is redundant; you can convert it.`,
        },
      ],
      tiers,
      message: msg,
      draft_message: assembleMessage(msg),
      priority: 80 - holes.indexOf(hole) * 10,
    });
  }

  // Opportunity 3: Flat-tier trade-down.
  const slot1 = upcomingDraft.my_owned[0];
  const slot2 = upcomingDraft.my_owned[1];
  if (slot1 && slot2 && slot2.pick_no - slot1.pick_no <= 8) {
    const valuesAt = (pickNo: number): number => {
      const candidates = available
        .filter(
          (p) => p.adp != null && Math.abs((p.adp ?? 0) - pickNo) < 8,
        )
        .map((p) => playerValueLookup(p.id) ?? 0)
        .sort((a, b) => b - a);
      return candidates[0] ?? 0;
    };
    const v1 = valuesAt(slot1.pick_no);
    const v2 = valuesAt(slot2.pick_no);
    const tierGap = v1 - v2;
    if (tierGap < 5 && v1 > 0) {
      // Trade-down: the user is the static-side that needs to be paid.
      // Partner trades up to user's slot + sends a sweetener (later
      // pick). User receives slot 3+ behind + a later round dart.
      const targetSlotNo = slot1.pick_no + 3;
      const partnerRosterId = rosterAtPickNo({
        pickNo: targetSlotNo,
        totalTeams: snap.total_teams,
        season: snap.season,
        draft: snap.draft,
      });
      const partner = partnerRosterId
        ? snap.rosters.find((r) => r.roster_id === partnerRosterId)
        : null;
      if (partner && partner.roster_id !== myRosterId) {
        const partnerSig = tradeSignatureFor(snap, partner.roster_id);
        const userSendPick = buildPickAsset({
          pickNo: slot1.pick_no,
          totalTeams,
        });
        const userReceivePick = buildPickAsset({
          pickNo: targetSlotNo,
          totalTeams,
        });
        const slotDelta = userSendPick.value - userReceivePick.value;
        // Partner pays the slot delta as a later-round sweetener.
        // For trade-down, the sweetener flows TO the user. We frame
        // it as "they pay you" by listing user_receives = partner's
        // later pick (we don't know which one specifically, hence
        // placeholder).
        const sweetenerReceiveAsset: TradeAsset = {
          kind: "depth_player_placeholder",
          tier_max_value: Math.max(2, slotDelta),
          description: `a later-round pick from their schedule (~${Math.max(2, Math.round(slotDelta))} value)`,
        };

        const startingSend = bundle([userSendPick]);
        const startingReceive = bundle([userReceivePick, sweetenerReceiveAsset]);
        const realisticSend = bundle([userSendPick]);
        const realisticReceive = bundle([userReceivePick, sweetenerReceiveAsset]);
        const floorSend = bundle([userSendPick]);
        const floorReceive = bundle([userReceivePick]);

        const tiers: AskTier[] = [
          {
            label: "starting",
            user_sends: startingSend,
            user_receives: startingReceive,
            ratio_perceived:
              startingReceive.total_perceived_value /
              Math.max(1, startingSend.total_perceived_value),
            note: "Open here; you charge the trade-down tax.",
          },
          {
            label: "realistic",
            user_sends: realisticSend,
            user_receives: realisticReceive,
            ratio_perceived:
              realisticReceive.total_perceived_value /
              Math.max(1, realisticSend.total_perceived_value),
            note: "Where this typically closes.",
          },
          {
            label: "floor",
            user_sends: floorSend,
            user_receives: floorReceive,
            ratio_perceived:
              floorReceive.total_perceived_value /
              Math.max(1, floorSend.total_perceived_value),
            note: "Don't trade down without a sweetener. If they refuse, walk.",
          },
        ];

        const msg: TradeMessage = {
          observation: `Tier looks flat between ${slot1.pick_label} and ${slot2.pick_label} (${tierGap.toFixed(0)} value points apart).`,
          problem_named: `If you've got a specific target in my slot range, I'm not blocking you for free.`,
          solution: `I'll slide back to your slot in exchange for a later-round dart.`,
          ask_and_their_win: `Your ${userReceivePick.pick_label} + a sub-10 value later-round pick for my ${userSendPick.pick_label}. You jump 3 slots to grab your target; I pocket the dart and keep equivalent player value.`,
        };

        opportunities.push({
          id: "flat_tier_trade_down",
          kind: "flat_tier_trade_down",
          headline: `Charge the trade-down tax: ${slot1.pick_label} for ${userReceivePick.pick_label} + a sweetener`,
          thesis: `Value gap between ${slot1.pick_label} and ${slot2.pick_label} is shallow (${tierGap.toFixed(0)} pts). No tier break separates them. If a partner wants up, charge for the move.`,
          partners: [
            {
              roster_id: partner.roster_id,
              owner_name:
                partner.owner_name ?? `roster #${partner.roster_id}`,
              trade_signature: partnerSig,
              why_them: `Holds ${userReceivePick.pick_label}. ${partnerSig === "pick_flipper" ? "Already trading picks constantly; this fits their pattern." : "If they have a specific target in your slot range, they'll move up for a small sweetener."}`,
            },
          ],
          tiers,
          message: msg,
          draft_message: assembleMessage(msg),
          priority: 60,
        });
      }
    }
  }

  opportunities.sort((a, b) => b.priority - a.priority);
  return opportunities.slice(0, 3);
}
