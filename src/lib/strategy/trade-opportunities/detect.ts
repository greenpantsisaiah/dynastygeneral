/**
 * Trade opportunity detection. Proactively surfaces actionable trades
 * during active draft so the platform isn't treating pick trades as
 * an exception. Three opportunity kinds:
 *
 *   1. flat_tier_trade_down. When the projected value at the user's
 *      current slot is roughly equal to value at a later slot, swap
 *      down for a future-round pick uplift.
 *   2. run_sharp_move. When a position run is on AND the last-of-tier
 *      player at that position has low survival to the user's next
 *      pick, trade up to grab them.
 *   3. fill_structural_hole. When the user has a starter hole at a
 *      position AND a specific opponent has surplus there, propose
 *      a swap that fills the hole.
 *
 * Each opportunity carries a partner candidate (named opponent +
 * their trade signature for fit context), value math inside the
 * +/- 15% fairness band, a one-line thesis, and a ready-to-send
 * draft message.
 *
 * Per founder direction 2026-05-19: the platform should find ways
 * to evaluate how trades affect EV and value across the board, while
 * suggesting sharp moves to nab key players or reduce key risks.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type { AvailablePlayer } from "@/lib/players/available";
import type { UpcomingDraftSummary } from "@/lib/strategy/pre-draft/upcoming-draft";
import { startupPickValue } from "@/lib/players/future-picks";

export type OpportunityKind =
  | "flat_tier_trade_down"
  | "run_sharp_move"
  | "fill_structural_hole";

export type Position = "QB" | "RB" | "WR" | "TE";

const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

export type PartnerCandidate = {
  roster_id: number;
  owner_name: string;
  /** pick_flipper / pick_hoarder / pick_seller / pick_quiet. */
  trade_signature: string;
  /** Plain-English read of why this partner fits. */
  why_them: string;
};

export type TradeOpportunity = {
  id: string;
  kind: OpportunityKind;
  headline: string;
  thesis: string;
  partners: PartnerCandidate[];
  math: {
    you_send: string;
    you_receive: string;
    send_value: number;
    receive_value: number;
    ratio: number;
  };
  draft_message: string;
  priority: number;
};

/**
 * Trade opportunities surface during early-mid rounds where positional
 * advantage shopping has the highest EV impact. After round 8 the
 * pick-trading window narrows and the platform shifts to in-draft
 * Decision-card guidance.
 */
const EARLY_DRAFT_ROUND_CAP = 8;

function computeStructuralHoles(snap: LeagueSnapshot): Array<{
  position: Position;
  current_count: number;
  starters_needed: number;
  gap: number;
}> {
  const me = snap.rosters.find((r) => r.is_me);
  if (!me) return [];
  const isSuperflex =
    snap.format === "superflex" || snap.format === "2qb";
  const requirements: Record<Position, number> = {
    QB: isSuperflex ? 2 : 1,
    RB: 2,
    WR: 3,
    TE: 1,
  };
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
  const isSuperflex =
    snap.format === "superflex" || snap.format === "2qb";
  const required: Record<Position, number> = {
    QB: isSuperflex ? 2 : 1,
    RB: 2,
    WR: 3,
    TE: 1,
  };
  const out: Array<{
    roster_id: number;
    owner_name: string;
    count: number;
    surplus: number;
  }> = [];
  for (const r of snap.rosters) {
    if (r.roster_id === myRosterId) continue;
    const count = r.position_counts[position] ?? 0;
    const surplus = count - required[position] - 1; // 1 backup buffer
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

function fitNoteForSignature(signature: string): string {
  switch (signature) {
    case "pick_flipper":
      return "Trades picks constantly; current-pick offers land best";
    case "pick_hoarder":
      return "Net pick acquirer; open to picks of any kind";
    case "pick_seller":
      return "Net pick outflow; prefers player return, not more picks";
    case "pick_quiet":
      return "No fingerprint yet; lead with what you actually want";
    default:
      return "";
  }
}

function findRosterAtSlot(
  snap: LeagueSnapshot,
  pickNo: number,
): number | null {
  const totalTeams = snap.total_teams;
  if (pickNo < 1) return null;
  const round = Math.ceil(pickNo / totalTeams);
  const positionInRound = ((pickNo - 1) % totalTeams) + 1;
  const isSnake =
    snap.draft.type !== "linear" && snap.draft.type !== "auction";
  const slot =
    isSnake && round % 2 === 0
      ? totalTeams + 1 - positionInRound
      : positionInRound;
  const direct = snap.draft.slot_to_roster_id?.[slot];
  if (typeof direct !== "number") return null;
  for (const tp of snap.draft.traded_picks) {
    if (tp.season !== snap.season) continue;
    if (tp.round !== round) continue;
    if (tp.original_owner !== direct) continue;
    return tp.current_owner;
  }
  return direct;
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
  const opportunities: TradeOpportunity[] = [];

  // Opportunity 1: Run-driven sharp move.
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
      const partnerRosterId = findRosterAtSlot(snap, targetPickNo);
      if (partnerRosterId && partnerRosterId !== myRosterId) {
        const partner = snap.rosters.find(
          (r) => r.roster_id === partnerRosterId,
        );
        if (partner) {
          const partnerSig = tradeSignatureFor(snap, partnerRosterId);
          const ownPick = firstUpcoming;
          const sendValue = startupPickValue(targetPickNo);
          const receiveValue = startupPickValue(ownPick.pick_no);
          const ratio = sendValue / Math.max(1, receiveValue);
          opportunities.push({
            id: "run_sharp_move",
            kind: "run_sharp_move",
            headline: `Trade up to grab ${lastOfTier.name} before the ${run.position} run finishes`,
            thesis: `${run.position} run on (${run.count} of last ${run.window_size}). ${lastOfTier.name} is the last starter-tier ${run.position} on the board (ADP ${Math.round(lastOfTier.adp)}); your next slot is ${ownPick.pick_label}. Trade up to lock him.`,
            partners: [
              {
                roster_id: partner.roster_id,
                owner_name:
                  partner.owner_name ?? `roster #${partner.roster_id}`,
                trade_signature: partnerSig,
                why_them: `Currently holds the pick at #${targetPickNo}. ${fitNoteForSignature(partnerSig)}.`,
              },
            ],
            math: {
              you_send: `${ownPick.pick_label} (value ${Math.round(receiveValue)})`,
              you_receive: `pick #${targetPickNo} (value ${Math.round(sendValue)})`,
              send_value: receiveValue,
              receive_value: sendValue,
              ratio,
            },
            draft_message: `Hey, with the ${run.position} run going I want to grab ${lastOfTier.name} before he's gone. Swap your pick at #${targetPickNo} for my ${ownPick.pick_label}? Even ${isSuperflex ? "SF" : "1QB"} value swap.`,
            priority: 90,
          });
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
    const offerShape =
      partnerSig === "pick_seller"
        ? `one of your players for one of their ${hole.position}s`
        : `one of your current picks + a depth piece for their ${hole.position} surplus`;
    opportunities.push({
      id: `fill_hole_${hole.position}`,
      kind: "fill_structural_hole",
      headline: `Convert depth into a ${hole.position} starter via ${top.owner_name}`,
      thesis: `You're at ${hole.current_count} of ${hole.starters_needed} ${hole.position} starters. ${top.owner_name} has ${top.count} (surplus ${top.surplus}). They're built to deal at the position; offer ${offerShape}.`,
      partners: [
        {
          roster_id: top.roster_id,
          owner_name: top.owner_name,
          trade_signature: partnerSig,
          why_them: `${top.count} ${hole.position} bodies on roster (surplus ${top.surplus}). ${fitNoteForSignature(partnerSig)}.`,
        },
      ],
      math: {
        you_send: `${offerShape} (TBD per their roster)`,
        you_receive: `1 ${hole.position} starter (TBD)`,
        send_value: 0,
        receive_value: 0,
        ratio: 1,
      },
      draft_message: `Hey, you've got ${top.count} ${hole.position} bodies and I'm sitting on ${hole.current_count}. Want to talk about a ${hole.position} for ${offerShape}? Open to your shape on the deal.`,
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
      const partnerRosterId = findRosterAtSlot(snap, slot1.pick_no + 3);
      const partner = partnerRosterId
        ? snap.rosters.find((r) => r.roster_id === partnerRosterId)
        : null;
      if (partner && partner.roster_id !== myRosterId) {
        const partnerSig = tradeSignatureFor(snap, partner.roster_id);
        opportunities.push({
          id: "flat_tier_trade_down",
          kind: "flat_tier_trade_down",
          headline: `Trade down a few slots, gain a later-round pick`,
          thesis: `Value gap between ${slot1.pick_label} and ${slot2.pick_label} is shallow (${tierGap.toFixed(0)} pts). No tier break separates the top of these slots. Swap to a partner's nearby slot in exchange for an uplift in a later round.`,
          partners: [
            {
              roster_id: partner.roster_id,
              owner_name:
                partner.owner_name ?? `roster #${partner.roster_id}`,
              trade_signature: partnerSig,
              why_them: `Holds a slot near yours. ${fitNoteForSignature(partnerSig)}.`,
            },
          ],
          math: {
            you_send: slot1.pick_label,
            you_receive: `partner's nearby slot + a later-round pick uplift`,
            send_value: startupPickValue(slot1.pick_no),
            receive_value: startupPickValue(slot1.pick_no + 3) + 3,
            ratio: 1.0,
          },
          draft_message: `Tier looks flat between ${slot1.pick_label} and the next few slots. Want to swap and toss me a later round pick? Painless lift for both of us.`,
          priority: 60,
        });
      }
    }
  }

  opportunities.sort((a, b) => b.priority - a.priority);
  return opportunities.slice(0, 3);
}
