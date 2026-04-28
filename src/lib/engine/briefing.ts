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
import type { JudgmentProfile } from "@/lib/soundboard/types";
import { buildPositionRoomHealth, type RoomHealth } from "./roster-fit";
import { buildTrajectory, type BuildTrajectory } from "./build-trajectory";

const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];

/**
 * Soundboard dial overrides extracted from the user's judgment
 * profile and shaped for engine consumption. Today only horizon is
 * wired; other dials remain "Pending wiring" until they're read by
 * a real engine consumer.
 */
export type DialOverrides = {
  /** -100 (Win Now) ↔ +100 (Future). 0 = no override. */
  horizon: number;
};

export type LeagueBriefing = {
  /**
   * Per-position room health. THE source of truth for every surface
   * that talks about starter count, saturation, or bench depth.
   */
  position_health: Record<Position, RoomHealth>;
  /**
   * Emergent build trajectory derived from the user's actual picks
   * this draft.
   */
  trajectory: BuildTrajectory;
  /**
   * Soundboard dial overrides. Sparse: only dials with a real engine
   * consumer are populated.
   */
  dials: DialOverrides;
};

export function buildLeagueBriefing(
  snap: LeagueSnapshot,
  judgmentProfile?: JudgmentProfile | null,
): LeagueBriefing {
  const position_health = {} as Record<Position, RoomHealth>;
  for (const pos of POSITIONS) {
    position_health[pos] = buildPositionRoomHealth(snap, pos);
  }
  const horizonRaw = judgmentProfile?.dials?.horizon;
  const horizon =
    typeof horizonRaw === "number" ? horizonRaw : 0;
  return {
    position_health,
    trajectory: buildTrajectory(snap),
    dials: { horizon },
  };
}
