/**
 * Play catalog: the format-gate matrix and the single emission gate.
 *
 * CANONICAL_SOURCES.md "Play format gates (engine emission gate)".
 * The engine MUST NOT emit a play whose gates are unsatisfied. One
 * matrix, one gate; no scattered per-archetype if/else format checks.
 *
 * Founder report 2026-05-20: "The platform has been over-prioritizing
 * TEs in my no-TEP league." The TE-value side of that bug lives in
 * pricing (resolvePlayerValues); this matrix is the play-emission side,
 * and is also where a future TE-Premium Double-Up play would carry
 * requires_te_premium so it never surfaces in a standard-TE league.
 */

import type { LeagueSnapshot } from "../league-state/snapshot";
import { buildFormatRulesFromSnapshot } from "@/lib/engine/llm-contract";
import type { FormatGates, PlayArchetype } from "./types";

/**
 * Format requirements per play type. An empty object = no requirement.
 * bridge_qb's superflex requirement lives here now (was an inline
 * isSuperflex check in detect.ts) so the matrix is load-bearing.
 */
export const playFormatGates: Record<PlayArchetype, FormatGates> = {
  qb_wr_stack: {},
  anchor_handcuff: {},
  bridge_qb: { requires_superflex: true },
  // QB Hoard only makes sense where you start one QB: a third QB is
  // pure surplus. In superflex / 2QB, QB depth is a need, not a flip
  // asset, so the play must never surface there.
  qb_hoard: { requires_1qb_starter: true },
};

/**
 * Whether a play type is eligible for this league's format. Reads the
 * canonical format rules; never branches on raw snap.format directly.
 */
export function canEmitPlay(
  snap: LeagueSnapshot,
  archetype: PlayArchetype,
): boolean {
  const gates = playFormatGates[archetype];
  if (!gates) return true;

  const fmt = buildFormatRulesFromSnapshot(snap);

  if (gates.requires_superflex && !fmt.is_superflex) return false;
  if (gates.requires_1qb_starter && fmt.is_superflex) return false;
  if (gates.requires_te_premium && !fmt.te_premium) return false;
  if (gates.forbid_te_premium && fmt.te_premium) return false;
  if (gates.requires_dynasty && snap.league_type !== "dynasty") return false;
  if (
    typeof gates.requires_deep_bench_min === "number" &&
    snap.starter_slots.bench < gates.requires_deep_bench_min
  ) {
    return false;
  }

  return true;
}
