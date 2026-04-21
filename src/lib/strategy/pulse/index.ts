/**
 * Pulse aggregator. Single entry point for callers. runs every
 * generator, sorts by severity, returns the list to render.
 *
 * Severity sort: critical first, then notable, then info.
 */

import type { LeagueSnapshot } from "../league-state/snapshot";
import type { Pulse, PulseSeverity } from "./types";
import {
  formatNote,
  openingPreview,
  positionRun,
  qbPace,
  yourTurn,
} from "./generators";

const SEVERITY_RANK: Record<PulseSeverity, number> = {
  critical: 0,
  notable: 1,
  info: 2,
};

export function generatePulse(snap: LeagueSnapshot): Pulse[] {
  const all: Pulse[] = [
    ...formatNote(snap),
    ...qbPace(snap),
    ...positionRun(snap),
    ...yourTurn(snap),
    ...openingPreview(snap),
  ];

  // Dedupe by id (defensive. generators shouldn't collide but it's cheap)
  const byId = new Map<string, Pulse>();
  for (const p of all) byId.set(p.id, p);

  return [...byId.values()].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}

export type { Pulse, PulseSeverity, PulseCategory, PulseStat } from "./types";
