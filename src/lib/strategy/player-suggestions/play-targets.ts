/**
 * Play target enrichment. Given an archetype and the league's opponent
 * readout, match each play to the most relevant opposing owners. The
 * play template is generic ("anyone need QB help?"); the readout knows
 * which specific owner is QB-saturated and might sell at a discount.
 *
 * Bridges two layers we'd otherwise leave disconnected: the static
 * archetype playbook and the live counter-intel.
 */

import type {
  Archetype,
  Play,
  PlayTarget,
  Position,
  TargetedPlay,
} from "../archetypes/schema";
import type { OpponentReadout, TradeAngle } from "../opponents/observe";

// Map an archetype's primary position. Used to filter trade angles
// down to those relevant for this archetype's typical assets.
function inferPrimaryPosition(archetype: Archetype): Position | null {
  const id = archetype.id;
  const cat = archetype.category;
  if (id.startsWith("qb-") || cat === "Positional Leverage") return "QB";
  if (id.startsWith("wr-") || cat === "WR Strategy") return "WR";
  if (id.startsWith("rb-") || cat === "RB Strategy") return "RB";
  if (id.startsWith("te-") || cat === "TE Strategy") return "TE";
  return null;
}

// Score how well a trade angle matches a play's intent.
// Higher = better match. Returns null when the angle doesn't apply.
//
// Strict positional gating: a play that's about an archetype anchored
// in QB only matches angles that mention QB. Otherwise we'd surface
// "WR-saturated" opponents as QB Cartel sell targets, which is the
// wrong axis. Honest empty > wrong targets.
function scoreAngleForPlay(
  play: Play,
  angle: TradeAngle,
  primaryPosition: Position | null,
): number | null {
  if (primaryPosition == null) return null;
  const positionMatch = angle.headline
    .toUpperCase()
    .includes(primaryPosition);
  if (!positionMatch) return null;

  switch (play.intent) {
    case "probe":
    case "verify-archetype":
      if (angle.stance === "approach") return 10;
      if (angle.stance === "extract") return 6;
      return null;
    case "negotiate":
    case "setup":
      if (angle.stance === "approach") return 10;
      if (angle.stance === "extract") return 5;
      return null;
    case "market-make":
    case "misdirect":
      if (angle.stance === "approach") return 7;
      return null;
    case "pressure":
      if (angle.stance === "extract") return 9;
      return null;
  }
}

export function targetsForPlay(
  play: Play,
  archetype: Archetype,
  readout: OpponentReadout,
): PlayTarget[] {
  const pos = inferPrimaryPosition(archetype);
  type Scored = { team_name: string; angle: TradeAngle; score: number };
  const scored: Scored[] = [];

  for (const team of readout.teams) {
    for (const angle of team.trade_angles) {
      const score = scoreAngleForPlay(play, angle, pos);
      if (score == null) continue;
      scored.push({ team_name: team.owner_name, angle, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  // Cap at 2 targets per play. More than that becomes noise; the user
  // wants the sharp top match, not a list.
  return scored.slice(0, 2).map((s) => ({
    owner_name: s.team_name,
    reason: s.angle.headline,
  }));
}

export function enrichArchetypeWithTargets(
  archetype: Archetype,
  readout: OpponentReadout,
): TargetedPlay[] {
  const out: TargetedPlay[] = [];
  for (const play of archetype.plays ?? []) {
    const targets = targetsForPlay(play, archetype, readout);
    if (targets.length === 0) continue;
    out.push({ play_id: play.id, targets });
  }
  return out;
}
