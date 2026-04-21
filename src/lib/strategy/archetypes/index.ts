/**
 * Flat catalog export. Single source of truth for all archetypes
 * across categories. Validates pivot referential integrity at module
 * load. any dangling archetype_id reference throws immediately so
 * authoring mistakes can't slip past dev.
 */

import type { Archetype } from "./schema";
import { QB_ARCHETYPES } from "./catalog/qb";
import { WR_ARCHETYPES } from "./catalog/wr";
import { MACRO_ARCHETYPES } from "./catalog/macro";

export const ARCHETYPES: Archetype[] = [
  ...QB_ARCHETYPES,
  ...WR_ARCHETYPES,
  ...MACRO_ARCHETYPES,
];

export const ARCHETYPE_BY_ID: Map<string, Archetype> = new Map(
  ARCHETYPES.map((a) => [a.id, a]),
);

export function getArchetype(id: string): Archetype | undefined {
  return ARCHETYPE_BY_ID.get(id);
}

function validatePivotReferences(): void {
  const ids = new Set(ARCHETYPES.map((a) => a.id));
  const dangling: Array<{ from: string; to: string; where: string }> = [];

  for (const a of ARCHETYPES) {
    for (const pivot of a.pivots) {
      for (const branch of pivot.branches) {
        if (!ids.has(branch.archetype_id)) {
          dangling.push({
            from: a.id,
            to: branch.archetype_id,
            where: "pivot.branch",
          });
        }
      }
      if (pivot.trigger.kind === "opposing_archetype_overlap") {
        if (!ids.has(pivot.trigger.archetype_id)) {
          dangling.push({
            from: a.id,
            to: pivot.trigger.archetype_id,
            where: "pivot.trigger",
          });
        }
      }
    }
    for (const cid of a.counter_archetypes ?? []) {
      if (!ids.has(cid)) {
        dangling.push({ from: a.id, to: cid, where: "counter_archetypes" });
      }
    }
  }

  if (dangling.length > 0) {
    const lines = dangling
      .map((d) => `  ${d.from} → ${d.to} (${d.where})`)
      .join("\n");
    throw new Error(`Archetype catalog has dangling references:\n${lines}`);
  }
}

validatePivotReferences();
