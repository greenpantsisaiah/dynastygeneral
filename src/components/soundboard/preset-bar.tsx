"use client";

/**
 * Doctrine library bar above the dial grid. Each chip loads a stock
 * doctrine config that maps to a canonical strategic archetype:
 * Aggressive Rebuilder, Rebuilder, Pivot, Hold, Patient Contender,
 * Contender, Win-Now Maxer, plus two flavor doctrines (Field
 * General, Gambler) orthogonal to the timeline spectrum.
 *
 * Loading a doctrine = "lean toward this archetype's dial config."
 * "Custom" lights when active dial state matches no doctrine.
 *
 * Per founder design directive 2026-04-27: presets are the strategy
 * library users browse to declare a direction. The Decision card
 * lane grid then weights toward whichever lane the chosen doctrine's
 * Horizon dial points to. Dials drive lanes; lanes drive picks.
 */

import { PRESETS, type PresetId } from "@/lib/lab/presets";

export function PresetBar({
  active,
  onLoad,
}: {
  active: PresetId | "custom";
  onLoad: (id: PresetId) => void;
}) {
  return (
    <div className="rounded-md border border-border-strong bg-[rgb(15,13,10)] px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Doctrine library
        </span>
        <span
          className={`rounded-md border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${
            active === "custom"
              ? "border-warning/60 bg-warning/10 text-warning"
              : "border-border-strong bg-surface-2 text-muted-2"
          }`}
        >
          {active === "custom" ? "Custom · tuned away" : "Stock"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const isActive = active === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onLoad(p.id)}
              title={p.blurb}
              className={`rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition ${
                isActive
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border-strong bg-surface-2 text-muted-2 hover:border-accent/50 hover:text-foreground"
              }`}
            >
              {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
