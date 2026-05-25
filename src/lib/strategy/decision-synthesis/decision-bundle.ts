/**
 * Single production entry point for the standing decision.
 *
 * The hub board and Coach both call `resolveStandingDecision`, never
 * `synthesizeDecision` directly, so the standing call is produced through
 * exactly one code path. The available pool + player values handed in
 * here MUST come from `buildPricedPool` (all-rosters priced): the parity
 * guard in evals/anti-patterns.test.ts enforces both surfaces build that
 * pool, and the "no direct synthesizeDecision call" lint enforces that
 * this wrapper is the only caller in app code. Together they make the
 * 2026-05-24 board/Coach divergence (two hand-built preludes feeding
 * synthesizeDecision differently) structurally hard to reintroduce: a new
 * decision surface has one door, and that door is fed by the canonical
 * priced pool.
 */
import { synthesizeDecision } from "./synthesize";
import type { Decision, SynthesisDials } from "./types";
import type { LeagueSnapshot } from "../league-state/snapshot";
import type { RankedArchetype } from "../archetypes/schema";
import type { WindowsResult } from "../windows/compute";
import type { AvailablePlayer } from "@/lib/players/available";

export function resolveStandingDecision(args: {
  snap: LeagueSnapshot;
  ranked: RankedArchetype[];
  /** From buildPricedPool: realistic pool, consensus-reranked. */
  available: AvailablePlayer[];
  windows: WindowsResult;
  picksUntilMe: number;
  /** From buildPricedPool: id -> normalized value (all rosters priced). */
  playerValues: Record<string, number>;
  /** From buildPricedPool: id -> KTC overall rank. */
  ktcOverallRanks: Record<string, number>;
  dials: SynthesisDials;
}): Decision | null {
  if (args.available.length === 0) return null;
  return synthesizeDecision({
    snap: args.snap,
    ranked: args.ranked,
    available: args.available,
    windows: args.windows,
    picks_until_me: args.picksUntilMe,
    player_values: args.playerValues,
    ktc_overall_ranks: args.ktcOverallRanks,
    dials: args.dials,
  });
}
