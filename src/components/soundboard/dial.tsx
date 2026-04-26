"use client";

/**
 * Single Soundboard dial. Two visual variants depending on the dial's
 * axis: linear (slider with -100..+100) and select (option pills).
 *
 * Each dial includes:
 *   - the slider/select control
 *   - a numeric or label readout of the current value
 *   - a "what does this do" tooltip listing the truthful surface
 *   - an "argue" link that opens the argue modal at this dial
 *   - a "wired/pending" badge if the dial is stored but not yet wired
 *
 * Per the moat strategy: never fictionalize the surface list. The
 * tooltip's items are exactly the engine surfaces this dial drives.
 * If a dial isn't wired yet, say so plainly.
 */

import { useState } from "react";
import type { DialSpec } from "@/lib/soundboard/types";

export function SoundboardDial({
  spec,
  value,
  onChange,
  onArgue,
}: {
  spec: DialSpec;
  value: number | string;
  onChange: (v: number | string) => void;
  onArgue: (dialId: string) => void;
}) {
  const [showSurface, setShowSurface] = useState(false);

  return (
    <div className="rounded-lg border border-border-strong bg-surface px-5 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-foreground">
            {spec.name}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {spec.short_blurb}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!spec.wired && (
            <span
              title="Stored. Engine wiring is the next migration."
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2"
            >
              Pending wiring
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowSurface((v) => !v)}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2 hover:text-accent"
          >
            {showSurface ? "Hide" : "What it does"}
          </button>
          <button
            type="button"
            onClick={() => onArgue(spec.id)}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2 hover:text-warning"
          >
            Argue
          </button>
        </div>
      </div>

      {/* Control */}
      <div className="mt-4">
        {spec.axis.kind === "linear" ? (
          <LinearControl
            spec={spec}
            value={typeof value === "number" ? value : 0}
            onChange={onChange}
          />
        ) : (
          <SelectControl
            spec={spec}
            value={typeof value === "string" ? value : String(spec.default)}
            onChange={onChange}
          />
        )}
      </div>

      {/* Surface list (truthful) */}
      {showSurface && (
        <div className="mt-3 rounded-md border border-border-soft bg-surface-2 px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
            What this dial consults
          </div>
          <ul className="mt-1 space-y-1 text-xs text-foreground">
            {spec.surface.map((s) => (
              <li key={s}>· {s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LinearControl({
  spec,
  value,
  onChange,
}: {
  spec: DialSpec;
  value: number;
  onChange: (v: number) => void;
}) {
  if (spec.axis.kind !== "linear") return null;
  const left = spec.axis.left;
  const right = spec.axis.right;
  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
        <span>{left}</span>
        <span className="text-foreground">
          {value === 0 ? "Balanced" : value > 0 ? `+${value}` : value}
        </span>
        <span>{right}</span>
      </div>
      <input
        type="range"
        min={-100}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-accent"
        aria-label={`${spec.name}: ${left} to ${right}`}
      />
    </div>
  );
}

function SelectControl({
  spec,
  value,
  onChange,
}: {
  spec: DialSpec;
  value: string;
  onChange: (v: string) => void;
}) {
  if (spec.axis.kind !== "select") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {spec.axis.options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-md border px-3 py-1.5 text-xs transition ${
              active
                ? "border-accent bg-accent/10 text-foreground"
                : "border-border-strong bg-surface-2 text-muted hover:border-accent/60 hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
