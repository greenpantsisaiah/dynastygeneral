"use client";

/**
 * Preset chips bar above the dial grid. Each chip loads a stock
 * doctrine config; "Custom" lights when the active dial state doesn't
 * match any preset.
 */

import { PRESETS, type PresetId } from "@/lib/soundboard/presets";

export function PresetBar({
  active,
  onLoad,
}: {
  active: PresetId | "custom";
  onLoad: (id: PresetId) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border-strong bg-[rgb(15,13,10)] px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
        Preset
      </span>
      {PRESETS.map((p) => {
        const isActive = active === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onLoad(p.id)}
            title={p.blurb}
            className={`rounded-md border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
              isActive
                ? "border-accent bg-accent/15 text-accent"
                : "border-border-strong bg-surface-2 text-muted-2 hover:border-accent/50 hover:text-foreground"
            }`}
          >
            {p.name}
          </button>
        );
      })}
      <span
        className={`ml-auto rounded-md border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
          active === "custom"
            ? "border-warning/60 bg-warning/10 text-warning"
            : "border-border-strong bg-surface-2 text-muted-2"
        }`}
      >
        {active === "custom" ? "Custom" : "Stock"}
      </span>
    </div>
  );
}
