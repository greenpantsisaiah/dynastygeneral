"use client";

/**
 * Two-handle range control for the age preference dial. Renders as a
 * compact tactical bar with min + max thumbs. Native dual-range UX is
 * not standard, so this composes two stacked range inputs and clamps
 * one against the other to keep min <= max.
 */

import { useId } from "react";

export function RangeControl({
  min,
  max,
  value,
  onChange,
  ariaLabel,
}: {
  min: number;
  max: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  ariaLabel?: string;
}) {
  const idLow = useId();
  const idHigh = useId();
  const [low, high] = value;
  const clampedLow = Math.max(min, Math.min(low, high - 1));
  const clampedHigh = Math.min(max, Math.max(high, low + 1));

  const lowPct = ((clampedLow - min) / (max - min)) * 100;
  const highPct = ((clampedHigh - min) / (max - min)) * 100;

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="relative h-12 w-full">
        {/* track */}
        <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[rgb(40,38,34)]" />
        {/* active band */}
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
          style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
        />
        {/* low thumb input */}
        <input
          id={idLow}
          type="range"
          min={min}
          max={max}
          value={clampedLow}
          aria-label={`${ariaLabel ?? "Range"} minimum`}
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), clampedHigh - 1);
            onChange([v, clampedHigh]);
          }}
          className="pointer-events-auto absolute inset-0 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-accent"
        />
        {/* high thumb input */}
        <input
          id={idHigh}
          type="range"
          min={min}
          max={max}
          value={clampedHigh}
          aria-label={`${ariaLabel ?? "Range"} maximum`}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), clampedLow + 1);
            onChange([clampedLow, v]);
          }}
          className="pointer-events-auto absolute inset-0 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-accent"
        />
      </div>
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
        {clampedLow}-{clampedHigh}
      </div>
    </div>
  );
}
