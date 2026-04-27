"use client";

/**
 * Segmented selector for seg3, seg5, and select-style dials. Pills
 * arranged horizontally; active pill gets the accent treatment.
 */

export function SegmentedControl({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1 rounded-md border border-border-strong bg-[rgb(20,18,14)] p-1"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`flex-1 min-w-0 rounded px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition ${
              active
                ? "bg-accent text-black"
                : "text-muted-2 hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
