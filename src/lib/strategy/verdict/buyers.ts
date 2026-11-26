/**
 * Who should you sell to? Ranks the other rosters for one player by
 * (a) how much they are going for it this season (title odds from the
 * season simulator) and (b) how thin their startable depth is at his
 * position (startable_counts from annotateStartableDepth, starter need
 * from effectiveStarterReqs). No new depth math lives here.
 */

import type { AskLadder } from "./ask";
import { fmtPct } from "@/lib/email/trade-desk/league-week";

export interface BuyerInput {
  roster_id: number;
  label: string;
  title_pct: number;
  playoff_pct: number;
  /** startable_counts[pos] for this roster (body count fallback is the caller's job). */
  startable_at_pos: number;
  /** Realistic starters at the position for this league. */
  starters_at_pos: number;
}

export interface BuyerRead extends BuyerInput {
  /**
   * What to ask this buyer for (acceptable to great, from their roster).
   * Attached by the loader, which has every roster's values; absent in
   * pure compose runs.
   */
  ask?: AskLadder | null;
  /** 0 (deep) to 1 (no startable player at the position). */
  need: number;
  score: number;
  reason: string;
}

/** Weight on need relative to contention. INTERNAL_HEURISTIC; logged
 * outcomes (trade accepted or not) calibrate it. */
const NEED_WEIGHT = 0.75;

export function rankBuyers(args: {
  position: string;
  sellerRosterId: number;
  rosters: BuyerInput[];
  limit?: number;
}): BuyerRead[] {
  const out: BuyerRead[] = [];
  for (const r of args.rosters) {
    if (r.roster_id === args.sellerRosterId) continue;
    const target = Math.max(1, r.starters_at_pos + 1);
    const need = Math.min(1, Math.max(0, (target - r.startable_at_pos) / target));
    const score = r.title_pct * (1 - NEED_WEIGHT + NEED_WEIGHT * need);
    const depth = `${r.startable_at_pos} startable ${args.position} for ${r.starters_at_pos} starter slots`;
    out.push({
      ...r,
      need,
      score,
      reason: `${fmtPct(r.title_pct)} to win the league, ${depth}`,
    });
  }
  out.sort((a, b) => b.score - a.score || a.roster_id - b.roster_id);
  return out.slice(0, args.limit ?? 3);
}
