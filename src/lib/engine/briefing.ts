/**
 * League briefing: the digested object every surface consumes.
 *
 * Today the hub passes raw pieces (snap, archetypes, windows, available,
 * currentPickNo) separately to each component, and each component
 * re-derives downstream signals from those raw pieces. This module
 * pre-bundles the digest so:
 *
 *   1) Surfaces consume ONE typed object (position_health, future
 *      lane-tagging, doctrine, etc.) instead of redoing the math.
 *   2) Adding a new field once propagates to every consumer that
 *      reads the briefing.
 *   3) /?diagnose=1 can render the briefing for debugging without
 *      poking inside each surface separately.
 *
 * Per the architectural pillar: "tuning capacity is the reason to
 * consolidate" (founder ultrathink 2026-04-27). Briefing is the home
 * for tunable digested signals; raw inputs stay in their own pipes.
 *
 * Phase B (2026-04-27): position_health bundled per position.
 * Phase D (planned): timeline-lane-tagged candidates added.
 * Doctrine readout, archetype digest, etc. plug in incrementally.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type { Position } from "@/lib/strategy/archetypes/schema";
import { buildPositionRoomHealth, type RoomHealth } from "./roster-fit";

const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];

export type LeagueBriefing = {
  /**
   * Per-position room health. THE source of truth for every surface
   * that talks about starter count, saturation, or bench depth.
   *
   * Each entry contains hard / realistic / upper-bound starter counts
   * AND a `room` classification (thin / adequate / saturated / locked).
   * SWOT uses room + upper_bound for bench-safety framing; Decision
   * card uses surplus_after_one_more + realistic for economic-fit
   * framing. Same data, different lens.
   */
  position_health: Record<Position, RoomHealth>;
};

export function buildLeagueBriefing(snap: LeagueSnapshot): LeagueBriefing {
  const position_health = {} as Record<Position, RoomHealth>;
  for (const pos of POSITIONS) {
    position_health[pos] = buildPositionRoomHealth(snap, pos);
  }
  return { position_health };
}
